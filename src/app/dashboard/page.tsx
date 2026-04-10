"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AgendaSection, type AgendaItem } from "./components/AgendaSection";
import { JournalSection, type JournalEntry } from "./components/JournalSection";
import { ProjekteSection, type Projekt } from "./components/ProjekteSection";
import { AccountSection } from "./components/AccountSection";

type Tab = "agenda" | "journal" | "projekte" | "konto";

const tabs: { key: Tab; label: string; color: string }[] = [
  { key: "agenda", label: "Agenda", color: "bg-[#E25B45]" },
  { key: "journal", label: "Journal", color: "bg-gray-900 text-white" },
  { key: "projekte", label: "Projekte", color: "bg-white border" },
  { key: "konto", label: "Konto", color: "bg-gray-100 border" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [active, setActive] = useState<Tab>("agenda");
  const [data, setData] = useState<{ agenda: AgendaItem[]; journal: JournalEntry[]; projekte: Projekt[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/agenda/").then((r) => r.json()),
      fetch("/api/dashboard/journal/").then((r) => r.json()),
      fetch("/api/dashboard/projekte/").then((r) => r.json()),
    ]).then(([a, j, p]) => {
      setData({
        agenda: a.success ? a.data : [],
        journal: j.success ? j.data : [],
        projekte: p.success ? p.data : [],
      });
      setLoading(false);
    }).catch(() => {
      setError("Daten konnten nicht geladen werden.");
      setLoading(false);
    });
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout/", { method: "POST" });
    router.push("/dashboard/login/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Laden...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">alit Dashboard</h1>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-black">Abmelden</button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`px-4 py-2 rounded text-sm font-medium transition-opacity ${tab.color} ${active === tab.key ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {active === "agenda" && data && <AgendaSection initial={data.agenda} />}
        {active === "journal" && data && <JournalSection initial={data.journal} />}
        {active === "projekte" && data && <ProjekteSection initial={data.projekte} />}
        {active === "konto" && <AccountSection />}
      </div>
    </div>
  );
}

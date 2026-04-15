"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AgendaSection, type AgendaItem } from "./components/AgendaSection";
import { JournalSection, type JournalEntry } from "./components/JournalSection";
import { ProjekteSection, type Projekt } from "./components/ProjekteSection";
import { MediaSection, type MediaItem } from "./components/MediaSection";
import { AlitSection, type AlitSectionItem } from "./components/AlitSection";
import { AccountSection } from "./components/AccountSection";
import { SignupsSection, type MembershipRow, type NewsletterRow } from "./components/SignupsSection";

type Tab = "agenda" | "journal" | "projekte" | "medien" | "alit" | "signups" | "konto";

const tabs: { key: Tab; label: string; color: string }[] = [
  { key: "agenda", label: "Agenda", color: "bg-[#E25B45]" },
  { key: "journal", label: "Discours Agités", color: "bg-gray-900 text-white" },
  { key: "alit", label: "Über Alit", color: "bg-gray-100 border" },
  { key: "signups", label: "Mitgliedschaft & Newsletter", color: "bg-gray-100 border" },
  { key: "projekte", label: "Projekte", color: "bg-white border" },
  { key: "medien", label: "Medien", color: "bg-gray-100 border" },
  { key: "konto", label: "Konto", color: "bg-gray-100 border" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [active, setActive] = useState<Tab>("agenda");
  const [data, setData] = useState<{ agenda: AgendaItem[]; journal: JournalEntry[]; projekte: Projekt[]; media: MediaItem[]; alit: AlitSectionItem[]; signups: { memberships: MembershipRow[]; newsletter: NewsletterRow[] } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/agenda/").then((r) => r.json()).catch(() => ({ success: false })),
      fetch("/api/dashboard/journal/").then((r) => r.json()).catch(() => ({ success: false })),
      fetch("/api/dashboard/projekte/").then((r) => r.json()).catch(() => ({ success: false })),
      fetch("/api/dashboard/media/").then((r) => r.json()).catch(() => ({ success: false })),
      fetch("/api/dashboard/alit/").then((r) => r.json()).catch(() => ({ success: false })),
      fetch("/api/dashboard/signups/").then((r) => r.json()).catch(() => ({ success: false })),
    ]).then(([a, j, p, m, al, s]) => {
      const failed = [
        !a.success && "Agenda",
        !j.success && "Journal",
        !p.success && "Projekte",
        !m.success && "Medien",
        !al.success && "Über Alit",
        !s.success && "Anmeldungen",
      ].filter(Boolean);
      if (failed.length === 6) {
        setError("Daten konnten nicht geladen werden.");
        setLoading(false);
        return;
      }
      if (failed.length > 0) {
        setError(`Fehler beim Laden: ${failed.join(", ")}`);
      }
      setData({
        agenda: a.success ? a.data : [],
        journal: j.success ? j.data : [],
        projekte: p.success ? p.data : [],
        media: m.success ? m.data : [],
        alit: al.success ? al.data : [],
        signups: s.success ? s.data : { memberships: [], newsletter: [] },
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

  if (error && !data) {
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
      {error && data && (
        <div className="max-w-5xl mx-auto px-6 pt-4">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">{error}</p>
        </div>
      )}

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

        {active === "agenda" && data && <AgendaSection initial={data.agenda} projekte={data.projekte} />}
        {active === "journal" && data && <JournalSection initial={data.journal} projekte={data.projekte} />}
        {active === "projekte" && data && <ProjekteSection initial={data.projekte} />}
        {active === "medien" && data && <MediaSection initial={data.media} />}
        {active === "alit" && data && <AlitSection initial={data.alit} />}
        {active === "signups" && data && <SignupsSection initial={data.signups} />}
        {active === "konto" && <AccountSection />}
      </div>
    </div>
  );
}

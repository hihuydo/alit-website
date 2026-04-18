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
import { MobileTabMenu } from "./components/MobileTabMenu";
import { DirtyProvider, useDirty } from "./DirtyContext";

type Tab = "agenda" | "journal" | "projekte" | "medien" | "alit" | "signups" | "konto";

const tabs: { key: Tab; label: string }[] = [
  { key: "agenda", label: "Agenda" },
  { key: "journal", label: "Discours Agités" },
  { key: "alit", label: "Über Alit" },
  { key: "signups", label: "Mitgliedschaft & Newsletter" },
  { key: "projekte", label: "Projekte" },
  { key: "medien", label: "Medien" },
];

export default function DashboardPage() {
  return (
    <DirtyProvider>
      <DashboardInner />
    </DirtyProvider>
  );
}

function DashboardInner() {
  const router = useRouter();
  const { confirmDiscard } = useDirty();
  const [active, setActive] = useState<Tab>("agenda");
  const [burgerOpen, setBurgerOpen] = useState(false);
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

  const goToTab = (key: Tab) => {
    if (key === active) return;
    confirmDiscard(() => setActive(key));
  };

  /**
   * Burger-menu tab selection. Closes the panel FIRST so the dirty-confirm
   * modal (if dirty) is the only aria-modal dialog on screen — no stacked
   * modals. Dirty-guard ownership stays in `goToTab`.
   */
  const handleBurgerSelect = (key: Tab) => {
    setBurgerOpen(false);
    goToTab(key);
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
        <div className="flex items-center gap-4">
          <button
            onClick={() => goToTab("konto")}
            className={`text-sm transition-colors ${
              active === "konto" ? "text-black font-medium underline underline-offset-4" : "text-gray-500 hover:text-black"
            }`}
          >
            Konto
          </button>
          <span aria-hidden className="text-gray-300">|</span>
          <button
            onClick={() => confirmDiscard(handleLogout)}
            className="text-sm text-gray-500 hover:text-black"
          >
            Abmelden
          </button>
        </div>
      </header>
      {error && data && (
        <div className="max-w-5xl mx-auto px-6 pt-4">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">{error}</p>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-3 md:px-6 py-6">
        <MobileTabMenu
          tabs={tabs}
          active={active}
          isOpen={burgerOpen}
          onOpenChange={setBurgerOpen}
          onSelect={handleBurgerSelect}
        />
        <div className="hidden md:flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => goToTab(tab.key)}
              title={tab.label}
              className={`px-3 md:px-4 py-2 rounded text-xs md:text-sm lg:text-base font-medium border border-black transition-colors min-w-0 truncate ${
                active === tab.key
                  ? "bg-black text-white"
                  : "bg-white text-black hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {active === "agenda" && data && (
          <AgendaSection
            initial={data.agenda}
            projekte={data.projekte.map((p) => ({
              slug_de: p.slug_de,
              titel: p.title_i18n?.de ?? p.title_i18n?.fr ?? p.slug_de,
            }))}
          />
        )}
        {active === "journal" && data && (
          <JournalSection
            initial={data.journal}
            projekte={data.projekte.map((p) => ({
              slug_de: p.slug_de,
              titel: p.title_i18n?.de ?? p.title_i18n?.fr ?? p.slug_de,
            }))}
          />
        )}
        {active === "projekte" && data && <ProjekteSection initial={data.projekte} />}
        {active === "medien" && data && <MediaSection initial={data.media} />}
        {active === "alit" && data && <AlitSection initial={data.alit} />}
        {active === "signups" && data && <SignupsSection initial={data.signups} />}
        {active === "konto" && <AccountSection />}
      </div>
    </div>
  );
}

"use client";

import { useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { JournalSidebar } from "./JournalSidebar";
import { LanguageBar, NavBars, activeNavKey } from "./Navigation";
import Link from "next/link";
import { Logo } from "./Logo";
import { AgendaPanel } from "./AgendaPanel";
import { ProjekteList } from "./ProjekteList";
import type { AgendaItemData } from "./AgendaItem";
import type { JournalEntry } from "@/content/de/journal/entries";
import type { Projekt } from "@/content/projekte";
import type { Dictionary } from "@/i18n/dictionaries";
import type { AlitSection } from "@/lib/queries";
import type { JournalContent } from "@/lib/journal-types";
import { buildProjektSlugMap } from "@/lib/projekt-slug";
import { useMemo } from "react";

interface WrapperProps {
  children: React.ReactNode;
  agendaItems: AgendaItemData[];
  journalEntries: JournalEntry[];
  projekte: Projekt[];
  alitSections: AlitSection[];
  journalInfo: { content: JournalContent; isFallback: boolean };
  dict: Dictionary;
  locale: string;
}

type Column = "1" | "2" | "3";
type ColumnState = "primary" | "secondary" | "hidden";

export function Wrapper({ children, agendaItems, journalEntries, projekte, alitSections, journalInfo, dict, locale }: WrapperProps) {
  // Map keyed by slug_de (the stable ID hashtags store as `projekt_slug`).
  // Built from the locale-filtered `projekte` prop, so the map naturally
  // encodes "visible in this locale": absent keys = hidden projekte.
  // AgendaItem + JournalSidebar render map-miss hashtags as <span> to
  // avoid linking to guaranteed 404s.
  const projektSlugMap = useMemo(() => buildProjektSlugMap(projekte), [projekte]);
  // Initial panel layout: if we're already on a route that lives in panel 3
  // (a nav item like /de/alit, or a /de/projekte/<slug> link from a hashtag),
  // panel 3 starts as primary so the section is visible on first paint —
  // especially on mobile where panel 3 is otherwise hidden. Derived
  // synchronously from pathname to avoid a post-hydration flash.
  const pathname = usePathname();
  const navActive = activeNavKey(pathname, locale) !== null;
  const projekteActive = pathname.startsWith(`/${locale}/projekte`);
  const panel3Active = navActive || projekteActive;
  const [primary, setPrimary] = useState<Column>(panel3Active ? "3" : "1");
  const [secondary, setSecondary] = useState<Column>(panel3Active ? "1" : "3");
  const [journalInfoVisible, setJournalInfoVisible] = useState(false);
  const toggleJournalInfo = () => setJournalInfoVisible((v) => !v);

  // i-button handler: if panel 2 is closed, open it and show the info.
  // If panel 2 is already open, just toggle the info visibility.
  const handleJournalInfoClick = () => {
    if (primary !== "2") {
      setSecondary(primary);
      setPrimary("2");
      setJournalInfoVisible(true);
    } else {
      toggleJournalInfo();
    }
  };

  // Promote panel 3 to primary when ENTERING a panel-3 route (nav item or
  // a /projekte/<slug> link, e.g. clicked from an agenda hashtag). Never
  // auto-demote on leaving: clicking an already-open nav item routes back
  // to /de to collapse the section, and the user expects to stay on panel 3
  // (with all sections collapsed) rather than jump back to the agenda.
  const [prevPanel3Active, setPrevPanel3Active] = useState(panel3Active);
  if (panel3Active !== prevPanel3Active) {
    setPrevPanel3Active(panel3Active);
    if (panel3Active) {
      setPrimary("3");
      setSecondary("1");
    }
  }

  const stateOf = (col: Column): ColumnState =>
    col === primary ? "primary" : col === secondary ? "secondary" : "hidden";

  const handleClick = (clicked: Column) => {
    // Unified logic across desktop and mobile:
    // - Click primary or secondary → swap them (tapping the open leiste on
    //   mobile reveals the previously-open panel, like a "back" gesture).
    // - Click the hidden column → it becomes primary, old primary demotes.
    if (clicked === primary || clicked === secondary) {
      setPrimary(secondary);
      setSecondary(primary);
      return;
    }
    setSecondary(primary);
    setPrimary(clicked);
  };

  // Click anywhere inside a SECONDARY panel's content → promote it to primary.
  // Hidden panels can't trigger this (pointer-events:none), and clicks on the
  // primary panel are no-ops. Bubbles before child link/button handlers, so
  // navigation/expansion still runs normally — state just updates first.
  const handlePanelContentClick = (col: Column) => {
    if (stateOf(col) === "secondary") {
      setSecondary(primary);
      setPrimary(col);
    }
  };

  const panelClass = (col: Column) => {
    const state = stateOf(col);
    const mobile = state === "primary" ? "mobile-active" : "mobile-hidden";
    return `panel panel-${col} panel-${state} ${mobile}`;
  };

  const leisteClass = (col: Column) =>
    `leiste leiste-${col} leiste-${stateOf(col)}`;

  // 60px for leiste 3, 63px for the other two — keeps the active column at exactly 70vw
  const rootStyle = {
    "--primary-leiste-w": primary === "3" ? "60px" : "63px",
  } as CSSProperties;

  const handleLogoClick = () => {
    // Activate panel 3 (Netzwerk) as primary
    if (primary !== "3") {
      setSecondary(primary);
      setPrimary("3");
    }
  };

  return (
    <div className="wrapper-root" data-primary={primary} style={rootStyle}>
      <Logo locale={locale} onLogoClick={handleLogoClick} />
      {/* Mobile top bar: logo + d/f switcher in one row, visible only < 768px */}
      <div className="mobile-top-bar">
        <Link
          href={`/${locale}`}
          onClick={handleLogoClick}
          className="mobile-logo block bg-black"
          aria-label="Alit"
        >
          <svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" className="block fill-white">
            <path d="M741.75,248l302-67-18-81-302,67Zm212.5,445,86.5-19L923.25,144l-86.5,19ZM745.75,484.5a72.5,72.5,0,1,0-72.5-72.5A72.55,72.55,0,0,0,745.75,484.5Zm-126,410,86.5-19-169.5-765L450.25,130Zm219.5,150,86.5-19L822.25,559l-86.5,19ZM215.75,961h282l-17-74.5h-247Zm-59.5,139h91l95-445.5c14.5-69,14.5-90.5,24.5-210.5h-8c9,120.5,9.5,141.5,24,210.5l94.5,445.5h93L411.75,387.5h-95Z" />
          </svg>
        </Link>
        <LanguageBar locale={locale} />
      </div>
      {/* Leiste 1: Agenda */}
      <div className={leisteClass("1")} onClick={() => handleClick("1")}>
        <p className="leiste-label">
          {dict.leiste.verein}
        </p>
      </div>

      {/* Panel 1: main content */}
      <div className={panelClass("1")} onClick={() => handlePanelContentClick("1")}>
        <AgendaPanel
          items={agendaItems}
          projektSlugMap={projektSlugMap}
          supportersLabel={dict.agenda.supporters.label}
        />
      </div>

      {/* Leiste 2: Discours Agités */}
      <div className={leisteClass("2")} onClick={() => handleClick("2")}>
        <p className="leiste-label">
          {dict.leiste.literatur}
        </p>
        {/* i-button embedded in leiste 2 on mobile; hidden on desktop */}
        <button
          className="leiste-2-ibutton"
          onClick={(e) => {
            e.stopPropagation();
            handleJournalInfoClick();
          }}
          aria-label="Info ein-/ausblenden"
          type="button"
        >
          i
        </button>
      </div>

      {/* Panel 2: Discours Agités */}
      <div className={panelClass("2")} onClick={() => handlePanelContentClick("2")}>
        <JournalSidebar
          entries={journalEntries}
          infoContent={journalInfo.content}
          infoIsFallback={journalInfo.isFallback}
          locale={locale}
          infoVisible={journalInfoVisible}
          onToggleInfo={toggleJournalInfo}
          projektSlugMap={projektSlugMap}
        />
      </div>

      {/* Leiste 3: Netzwerk */}
      <div className={leisteClass("3")} onClick={() => handleClick("3")}>
        <p className="leiste-label">
          {dict.leiste.stiftung}
        </p>
      </div>

      {/* Panel 3: site navigation + projekte list (always visible) +
          the current route's content (children, may be null) */}
      <div className={panelClass("3")} onClick={() => handlePanelContentClick("3")}>
        <LanguageBar locale={locale} />
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <NavBars locale={locale} dict={dict} alitSections={alitSections} />
          <ProjekteList projekte={projekte} dict={dict} />
          {children}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { JournalSidebar } from "./JournalSidebar";
import { LanguageBar, NavBars, activeNavKey } from "./Navigation";
import { Logo } from "./Logo";
import { AgendaPanel } from "./AgendaPanel";
import type { AgendaItemData } from "./AgendaItem";
import type { JournalEntry } from "@/content/de/journal/entries";
import type { Dictionary } from "@/i18n/dictionaries";

interface WrapperProps {
  children: React.ReactNode;
  agendaItems: AgendaItemData[];
  journalEntries: JournalEntry[];
  dict: Dictionary;
  locale: string;
}

type Column = "1" | "2" | "3";
type ColumnState = "primary" | "secondary" | "hidden";

export function Wrapper({ children, agendaItems, journalEntries, dict, locale }: WrapperProps) {
  // Initial panel layout: if we're already on a nav route (e.g. /de/alit),
  // panel 3 starts as primary so the section is visible on first paint —
  // especially on mobile where panel 3 is otherwise hidden. Derived
  // synchronously from pathname to avoid a post-hydration flash.
  const pathname = usePathname();
  const navActive = activeNavKey(pathname, locale) !== null;
  const [primary, setPrimary] = useState<Column>(navActive ? "3" : "1");
  const [secondary, setSecondary] = useState<Column>(navActive ? "1" : "3");

  // Promote panel 3 to primary when ENTERING a nav route (e.g. clicking
  // "Über Alit" navigates to /de/alit → ensure panel 3 is visible). Never
  // auto-demote on leaving: clicking an already-open nav item routes back
  // to /de to collapse the section, and the user expects to stay on panel 3
  // (with all sections collapsed) rather than jump back to the agenda.
  const [prevNavActive, setPrevNavActive] = useState(navActive);
  if (navActive !== prevNavActive) {
    setPrevNavActive(navActive);
    if (navActive) {
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
      {/* Leiste 1: Agenda */}
      <div className={leisteClass("1")} onClick={() => handleClick("1")}>
        <p className="leiste-label">
          {dict.leiste.verein} <em>{dict.leiste.vereinSub}</em>
        </p>
      </div>

      {/* Panel 1: main content */}
      <div className={panelClass("1")}>
        <AgendaPanel items={agendaItems} />
      </div>

      {/* Leiste 2: Discours Agités */}
      <div className={leisteClass("2")} onClick={() => handleClick("2")}>
        <p className="leiste-label">
          {dict.leiste.literatur} <em>{dict.leiste.literaturSub}</em>
        </p>
      </div>

      {/* Panel 2: Discours Agités */}
      <div className={panelClass("2")}>
        <JournalSidebar entries={journalEntries} infoText={dict.journal.info} />
      </div>

      {/* Leiste 3: Netzwerk */}
      <div className={leisteClass("3")} onClick={() => handleClick("3")}>
        <p className="leiste-label">
          {dict.leiste.stiftung} <em>{dict.leiste.stiftungSub}</em>
        </p>
      </div>

      {/* Panel 3: site navigation + the current route's content (children) */}
      <div className={panelClass("3")}>
        <LanguageBar locale={locale} />
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <NavBars locale={locale} dict={dict} />
          {children}
        </div>
      </div>
    </div>
  );
}

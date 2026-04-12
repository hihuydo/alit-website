"use client";

import { useState, type CSSProperties } from "react";
import { JournalSidebar } from "./JournalSidebar";
import { LanguageBar, NavBars } from "./Navigation";
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
  // Initial: panel 1 primary at 70vw, panel 3 (Navigation/Netzwerk) secondary, panel 2 hidden
  const [primary, setPrimary] = useState<Column>("1");
  const [secondary, setSecondary] = useState<Column>("3");

  const stateOf = (col: Column): ColumnState =>
    col === primary ? "primary" : col === secondary ? "secondary" : "hidden";

  const handleClick = (clicked: Column) => {
    // Click on a visible column (primary or secondary) → swap the two.
    // Click on the hidden column → it becomes primary, old primary demotes.
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
          <NavBars dict={dict} />
          {children}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { JournalSidebar } from "./JournalSidebar";
import { Navigation, navItems } from "./Navigation";
import { AgendaPanel } from "./AgendaPanel";
import type { JournalEntry } from "@/content/de/journal/entries";
import type { Dictionary } from "@/i18n/dictionaries";

interface WrapperProps {
  children: React.ReactNode;
  journalEntries: JournalEntry[];
  dict: Dictionary;
  locale: string;
}

type Column = "1" | "2" | "3";
type ColumnState = "primary" | "secondary" | "hidden";

export function Wrapper({ children, journalEntries, dict, locale }: WrapperProps) {
  // Initial: panel 1 primary at 70vw, panel 3 (Navigation/Netzwerk) secondary, panel 2 hidden
  const [primary, setPrimary] = useState<Column>("1");
  const [secondary, setSecondary] = useState<Column>("3");
  // i-toggle for the stiftung info text — lives at the top of panel 1
  const [infoOpen, setInfoOpen] = useState(false);

  // Resolve the title shown in panel 3's menu bar. Items flagged with
  // hideFromMenu are filtered out (see Navigation.tsx) — when the current
  // page is one of those (e.g. /agenda), fall back to the first visible
  // entry so the title slot still shows something meaningful.
  const pathname = usePathname();
  const pathWithoutLocale = pathname.replace(`/${locale}`, "").replace(/\/$/, "") || "";
  const visibleNavItems = navItems.filter((item) => !item.hideFromMenu);
  const currentNavItem = visibleNavItems.find((item) => item.href === pathWithoutLocale) ?? visibleNavItems[0];
  const fullTitle = currentNavItem ? dict.nav[currentNavItem.key as keyof typeof dict.nav] : "";
  // Hide the title in panel 3's menu bar when panel 3 is the small secondary
  // column — the title doesn't fit cleanly there.
  const currentTitle = secondary === "3" ? "" : fullTitle;

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

  return (
    <div className="wrapper-root" data-primary={primary} style={rootStyle}>
      {/* Leiste 1: Agenda */}
      <div className={leisteClass("1")} onClick={() => handleClick("1")}>
        <p className="leiste-label">
          {dict.leiste.verein} <em>{dict.leiste.vereinSub}</em>
        </p>
      </div>

      {/* Panel 1: main content */}
      <div className={panelClass("1")}>
        {/* i-header-bar — black "i" on panel 1's red background, height matches the logo box */}
        <div className="shrink-0 flex items-start justify-end" style={{ height: "var(--logo-height)", padding: "var(--spacing-half) 0 var(--spacing-half) var(--spacing-base)", background: "var(--color-verein)" }}>
          <button
            className="text-black cursor-pointer"
            style={{ width: "32px", height: "54px", fontSize: "45.333px", lineHeight: "54px", textAlign: "center", marginRight: "var(--spacing-base)", padding: "0 2.667px", border: "none", background: "var(--color-verein)" }}
            onClick={() => setInfoOpen(!infoOpen)}
            aria-label="Info ein-/ausblenden"
          >
            i
          </button>
        </div>
        {/* Toggleable stiftung text — closes visually with the bottom border */}
        <div
          className={`overflow-hidden border-b-3 border-black transition-info ${infoOpen ? "max-h-[500px]" : "max-h-0"}`}
          style={{ padding: infoOpen ? "var(--spacing-content-top) var(--spacing-base) var(--spacing-base)" : "0 var(--spacing-base)" }}
        >
          <p>{dict.stiftung.text}</p>
        </div>
        {/* Panel 1 always shows the agenda — independent of the URL/menu selection */}
        <AgendaPanel />
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
        <Navigation locale={locale} title={currentTitle} dict={dict} />
        {children}
      </div>
    </div>
  );
}

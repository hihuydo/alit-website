"use client";

import { useState } from "react";
import { JournalSidebar } from "./JournalSidebar";
import type { JournalEntry } from "@/content/de/journal/entries";
import type { Dictionary } from "@/i18n/dictionaries";

interface WrapperProps {
  children: React.ReactNode;
  journalEntries: JournalEntry[];
  dict: Dictionary;
}

type MobilePanel = "verein" | "journal" | "stiftung";

export function Wrapper({ children, journalEntries, dict }: WrapperProps) {
  // Desktop toggle state (Verein is always open)
  const [journalClosed, setJournalClosed] = useState(false);
  const [stiftungClosed, setStiftungClosed] = useState(true);

  // Mobile: which panel is active
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("verein");

  return (
    <div className="wrapper-root" style={{ background: "var(--color-bg)" }}>
      {/* Leiste: Verein */}
      <div
        className="leiste leiste-verein"
        style={{ background: "var(--color-verein)", color: "#fff" }}
        onClick={() => setMobilePanel("verein")}
      >
        <p className="leiste-label" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-leiste)", lineHeight: 1 }}>
          {dict.leiste.verein} <em>{dict.leiste.vereinSub}</em>
        </p>
      </div>

      {/* Verein (main content) */}
      <div className={`panel panel-verein-open ${mobilePanel === "verein" ? "mobile-active" : "mobile-hidden"}`} style={{ background: "var(--color-verein)" }}>
        {children}
      </div>

      {/* Leiste: Journal */}
      <div
        className="leiste leiste-journal"
        style={{ background: "var(--color-journal)", color: "#fff" }}
        onClick={() => {
          setJournalClosed(!journalClosed);
          setMobilePanel("journal");
        }}
      >
        <p className="leiste-label" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-leiste)", lineHeight: 1 }}>
          {dict.leiste.literatur} <em>{dict.leiste.literaturSub}</em>
        </p>
      </div>

      {/* Journal */}
      <div className={`panel panel-journal ${journalClosed ? "panel-closed" : "panel-journal-open"} ${mobilePanel === "journal" ? "mobile-active" : "mobile-hidden"}`} style={{ background: "var(--color-journal)" }}>
        <JournalSidebar entries={journalEntries} infoText={dict.journal.info} />
      </div>

      {/* Leiste: Stiftung */}
      <div
        className="leiste leiste-stiftung"
        style={{ background: "var(--color-stiftung)", color: "#fff" }}
        onClick={() => {
          setStiftungClosed(!stiftungClosed);
          setMobilePanel("stiftung");
        }}
      >
        <p className="leiste-label" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-leiste)", lineHeight: 1 }}>
          {dict.leiste.stiftung} <em>{dict.leiste.stiftungSub}</em>
        </p>
      </div>

      {/* Stiftung */}
      <div className={`panel panel-stiftung ${stiftungClosed ? "panel-closed" : "panel-stiftung-open"} ${mobilePanel === "stiftung" ? "mobile-active" : "mobile-hidden"}`} style={{ background: "var(--color-stiftung)" }}>
        <div className="flex-1 overflow-y-auto text-white" style={{ fontSize: "var(--text-body)", lineHeight: "normal" }}>
          <p className="m-0 border-b-3 border-black" style={{ padding: "28px var(--spacing-base) var(--spacing-base)" }}>
            {dict.stiftung.text}
          </p>
        </div>
      </div>
    </div>
  );
}

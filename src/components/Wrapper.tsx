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
  const [journalClosed, setJournalClosed] = useState(false);
  const [stiftungClosed, setStiftungClosed] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("verein");

  return (
    <div className="wrapper-root">
      {/* Leiste: Verein */}
      <div
        className="leiste leiste-verein"
        onClick={() => setMobilePanel("verein")}
      >
        <p className="leiste-label">
          {dict.leiste.verein} <em>{dict.leiste.vereinSub}</em>
        </p>
      </div>

      {/* Verein (main content) */}
      <div className={`panel panel-verein-open ${mobilePanel === "verein" ? "mobile-active" : "mobile-hidden"}`}>
        {children}
      </div>

      {/* Leiste: Journal */}
      <div
        className="leiste leiste-journal"
        onClick={() => {
          setJournalClosed(!journalClosed);
          setMobilePanel("journal");
        }}
      >
        <p className="leiste-label">
          {dict.leiste.literatur} <em>{dict.leiste.literaturSub}</em>
        </p>
      </div>

      {/* Journal */}
      <div className={`panel ${journalClosed ? "panel-closed" : "panel-journal-open"} ${mobilePanel === "journal" ? "mobile-active" : "mobile-hidden"}`}>
        <JournalSidebar entries={journalEntries} infoText={dict.journal.info} />
      </div>

      {/* Leiste: Stiftung */}
      <div
        className="leiste leiste-stiftung"
        onClick={() => {
          setStiftungClosed(!stiftungClosed);
          setMobilePanel("stiftung");
        }}
      >
        <p className="leiste-label">
          {dict.leiste.stiftung} <em>{dict.leiste.stiftungSub}</em>
        </p>
      </div>

      {/* Stiftung */}
      <div className={`panel ${stiftungClosed ? "panel-closed" : "panel-stiftung-open"} ${mobilePanel === "stiftung" ? "mobile-active" : "mobile-hidden"}`}>
        <div className="flex-1 overflow-y-auto text-white" style={{ fontSize: "var(--text-body)", lineHeight: "normal" }}>
          <p className="m-0 border-b-3 border-black" style={{ padding: "var(--spacing-content-top) var(--spacing-base) var(--spacing-base)" }}>
            {dict.stiftung.text}
          </p>
        </div>
      </div>
    </div>
  );
}

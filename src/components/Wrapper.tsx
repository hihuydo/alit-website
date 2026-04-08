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

export function Wrapper({ children, journalEntries, dict }: WrapperProps) {
  const [vereinClosed, setVereinClosed] = useState(false);
  const [journalClosed, setJournalClosed] = useState(false);
  const [stiftungClosed, setStiftungClosed] = useState(true);

  return (
    <div className="absolute inset-0 flex" style={{ background: "var(--color-bg)" }}>
      {/* Leiste: Verein */}
      <div
        className="shrink-0 relative overflow-hidden cursor-pointer transition-all duration-200 hover:!bg-white hover:!text-black"
        style={{ width: "var(--leiste-width)", background: "var(--color-verein)", borderRight: "3px solid #000", color: "#fff" }}
        onClick={() => setVereinClosed(!vereinClosed)}
      >
        <p className="absolute whitespace-nowrap" style={{ bottom: "39px", left: "50%", writingMode: "vertical-rl", transform: "translateX(-50%) rotate(180deg)", fontFamily: "var(--font-serif)", fontSize: "var(--text-leiste)", lineHeight: 1 }}>
          {dict.leiste.verein} <em>{dict.leiste.vereinSub}</em>
        </p>
      </div>

      {/* Verein (main content) */}
      <div className={`flex flex-col min-w-0 overflow-hidden transition-panel border-r-3 border-black ${vereinClosed ? "flex-[0_0_0%] opacity-0 pointer-events-none" : "flex-[1.5_1_0%]"}`} style={{ background: "var(--color-verein)" }}>
        {children}
      </div>

      {/* Leiste: Journal */}
      <div
        className="shrink-0 relative overflow-hidden cursor-pointer transition-all duration-200 hover:!bg-white hover:!text-black"
        style={{ width: "var(--leiste-width)", background: "var(--color-journal)", borderRight: "3px solid #fff", color: "#fff" }}
        onClick={() => setJournalClosed(!journalClosed)}
      >
        <p className="absolute whitespace-nowrap" style={{ bottom: "39px", left: "50%", writingMode: "vertical-rl", transform: "translateX(-50%) rotate(180deg)", fontFamily: "var(--font-serif)", fontSize: "var(--text-leiste)", lineHeight: 1 }}>
          {dict.leiste.literatur} <em>{dict.leiste.literaturSub}</em>
        </p>
      </div>

      {/* Journal */}
      <div className={`transition-panel ${journalClosed ? "flex-[0_0_0%] opacity-0 pointer-events-none" : "flex-[1_1_0%]"}`} style={{ background: "var(--color-journal)", borderRight: "3px solid #fff" }}>
        <JournalSidebar entries={journalEntries} infoText={dict.journal.info} />
      </div>

      {/* Leiste: Stiftung */}
      <div
        className="shrink-0 relative overflow-hidden cursor-pointer transition-all duration-200 hover:!bg-white hover:!text-black"
        style={{ width: "var(--leiste-s-width)", background: "var(--color-stiftung)", color: "#fff" }}
        onClick={() => setStiftungClosed(!stiftungClosed)}
      >
        <p className="absolute whitespace-nowrap" style={{ bottom: "39px", left: "50%", writingMode: "vertical-rl", transform: "translateX(-50%) rotate(180deg)", fontFamily: "var(--font-serif)", fontSize: "var(--text-leiste)", lineHeight: 1 }}>
          {dict.leiste.stiftung} <em>{dict.leiste.stiftungSub}</em>
        </p>
      </div>

      {/* Stiftung */}
      <div className={`flex flex-col overflow-hidden transition-panel text-white ${stiftungClosed ? "flex-[0_0_0%] opacity-0 pointer-events-none" : "flex-[1_1_0%]"}`} style={{ background: "var(--color-stiftung)", borderLeft: "3px solid #000" }}>
        <div className="flex-1 overflow-y-auto" style={{ fontSize: "var(--text-body)", lineHeight: "normal" }}>
          <p className="m-0 border-b-3 border-black" style={{ padding: "28px var(--spacing-base) var(--spacing-base)" }}>
            {dict.stiftung.text}
          </p>
        </div>
      </div>
    </div>
  );
}

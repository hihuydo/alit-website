"use client";

import { useState } from "react";
import type { JournalEntry } from "@/content/de/journal/entries";

interface JournalSidebarProps {
  entries: JournalEntry[];
  infoText: string;
}

export function JournalSidebar({ entries, infoText }: JournalSidebarProps) {
  const [infoVisible, setInfoVisible] = useState(false);

  return (
    <div className="flex flex-col overflow-hidden" style={{ fontFamily: "var(--font-mono)", color: "#fff" }}>
      {/* Journal menu bar — height matches the logo box and panel 1 i-bar */}
      <div className="shrink-0 flex items-start justify-end border-b-3 border-white" style={{ height: "var(--logo-height)", padding: "var(--spacing-half) 0 var(--spacing-half) var(--spacing-base)" }}>
        <button
          className="bg-black border-none border-b-2 border-b-white text-white cursor-pointer"
          style={{ width: "32px", height: "54px", fontFamily: "var(--font-mono)", fontSize: "45.333px", lineHeight: "54px", textAlign: "center", marginRight: "var(--spacing-base)", padding: "0 2.667px" }}
          onClick={() => setInfoVisible(!infoVisible)}
        >
          i
        </button>
      </div>

      {/* Journal content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar" style={{ fontSize: "var(--text-journal)", lineHeight: "26px" }}>
        {/* Info panel */}
        <div
          className={`overflow-hidden transition-info ${infoVisible ? "max-h-[500px] border-b-2 border-white" : "max-h-0"}`}
          style={{ padding: infoVisible ? "var(--spacing-half)" : "0 var(--spacing-half)", fontSize: "var(--text-journal)", lineHeight: "26px" }}
        >
          <p>{infoText}</p>
        </div>

        {/* Entries */}
        {entries.map((entry, i) => (
          <div key={i} className="border-b-2 border-meta">
            <div className="text-right text-meta" style={{ padding: "var(--spacing-half) var(--spacing-base) 0", fontSize: "var(--text-journal-meta)", lineHeight: "16px" }}>
              {entry.date}
            </div>
            <div style={{ padding: `0 var(--spacing-half) var(--spacing-half)`, fontSize: "var(--text-journal)", lineHeight: "26px" }}>
              {entry.title && (
                <p className={`pt-[14.667px] font-normal ${entry.titleBorder ? "border-b-3 border-black pb-[13px] mb-[13px]!" : ""}`}>
                  <strong className="font-normal" style={{ fontSize: "var(--text-journal)" }}>{entry.title}</strong>
                </p>
              )}
              {entry.lines.map((line, j) => {
                const imageAfter = entry.images?.find((img) => img.afterLine === j);
                return (
                  <div key={j}>
                    {line === "" ? (
                      <div style={{ height: "26px" }} />
                    ) : (
                      <p>
                        {j === 0 && !entry.title ? <span className="pt-[14.667px] block">{line}</span> : line}
                      </p>
                    )}
                    {imageAfter && (
                      <img
                        src={imageAfter.src}
                        alt=""
                        className="w-1/2 my-[13px]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {(i === 0 || entry.footer) && (
              <div className="border-b-3 border-black" style={{ height: "56px", padding: entry.footer ? "13px" : undefined }}>
                {entry.footer && <p style={{ fontSize: "var(--text-journal)", lineHeight: "26px" }}>{entry.footer}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

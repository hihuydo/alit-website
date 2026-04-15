"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { JournalEntry } from "@/content/de/journal/entries";
import type { ProjektSlugMap } from "@/lib/projekt-slug";
import { JournalBlockRenderer } from "./JournalBlockRenderer";

interface JournalSidebarProps {
  entries: JournalEntry[];
  infoText: string;
  infoVisible: boolean;
  onToggleInfo: () => void;
  projektSlugMap: ProjektSlugMap;
}

export function JournalSidebar({ entries, infoText, infoVisible, onToggleInfo, projektSlugMap }: JournalSidebarProps) {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "de";

  return (
    <div className="flex flex-col overflow-hidden" style={{ fontFamily: "var(--font-mono)", color: "#fff" }}>
      {/* Journal menu bar — height matches the logo box and panel 1 i-bar */}
      <div className="journal-ibar shrink-0 flex items-start justify-end border-b-3 border-white" style={{ height: "var(--logo-height)", padding: "var(--spacing-half) 0 var(--spacing-half) var(--spacing-base)" }}>
        <button
          className="journal-ibutton bg-black border-none border-b-2 border-b-white text-white cursor-pointer"
          style={{ width: "32px", height: "54px", fontFamily: "var(--font-mono)", fontSize: "45.333px", lineHeight: "54px", textAlign: "center", marginRight: "var(--spacing-base)", padding: "0 2.667px" }}
          onClick={onToggleInfo}
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
            <div
              className="journal-entry-body"
              style={{
                padding: `${entry.title ? "0" : "var(--spacing-base)"} var(--spacing-base) var(--spacing-base)`,
                fontSize: "var(--text-journal)",
                lineHeight: "26px",
              }}
            >
              {entry.title && (
                <p
                  className="pt-[14.667px] font-bold"
                  lang={entry.titleIsFallback ? "de" : undefined}
                  style={{
                    fontSize: "var(--text-journal)",
                    marginBottom: entry.author ? undefined : "var(--spacing-base)",
                  }}
                >
                  {entry.title}
                </p>
              )}
              {entry.author && (
                <p className="font-normal" style={{ fontSize: "var(--text-journal)", lineHeight: "26px", marginBottom: "var(--spacing-base)" }}>
                  von <span className="italic">{entry.author}</span>
                </p>
              )}
              {entry.content && entry.content.length > 0 ? (
                <div lang={entry.contentIsFallback ? "de" : undefined}>
                  <JournalBlockRenderer content={entry.content} />
                </div>
              ) : (
                entry.lines.map((line, j) => {
                  const imageAfter = entry.images?.find((img) => img.afterLine === j);
                  return (
                    <div key={j}>
                      {line === "" ? (
                        <div style={{ height: "26px" }} />
                      ) : (
                        <p>{line}</p>
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
                })
              )}
              {entry.hashtags && entry.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 pt-[29.333px]" style={{ fontFamily: "var(--font-mono)" }}>
                  {entry.hashtags.map((h) => {
                    const entryMap = projektSlugMap[h.projekt_slug];
                    if (entryMap) {
                      return (
                        <Link
                          key={h.tag}
                          href={`/${locale}/projekte/${entryMap.urlSlug}`}
                          className="link-dotted"
                        >
                          #{h.tag}
                        </Link>
                      );
                    }
                    // Map-miss: projekt hidden in this locale or deleted.
                    return (
                      <span key={h.tag} className="link-dotted" aria-disabled="true">
                        #{h.tag}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            {entry.footer && (
              <div className="border-b-3 border-black" style={{ height: "56px", padding: "13px" }}>
                <p lang={entry.footerIsFallback ? "de" : undefined} style={{ fontSize: "var(--text-journal)", lineHeight: "26px" }}>{entry.footer}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Projekt } from "@/content/projekte";
import { JournalBlockRenderer } from "./JournalBlockRenderer";

export function ProjekteList({ projekte }: { projekte: Projekt[] }) {
  const params = useParams<{ locale: string; slug?: string }>();
  const locale = params.locale;
  const expandedSlug = params.slug;

  const sorted = [...projekte].sort((a, b) => Number(a.archived) - Number(b.archived));

  // When a project is expanded via /projekte/<slug> (e.g. clicked from an
  // agenda hashtag), scroll it to the top of panel 3 so the user lands on
  // the right item instead of having to scroll past the nav bars.
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!expandedSlug) return;
    const el = itemRefs.current[expandedSlug];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [expandedSlug]);

  return (
    <div className="text-black" style={{ fontSize: "var(--text-body)" }}>
      {sorted.map((p) => {
        const isExpanded = p.slug === expandedSlug;
        // Click toggles between collapsed (/projekte) and expanded (/projekte/<slug>)
        const href = isExpanded ? `/${locale}/projekte` : `/${locale}/projekte/${p.slug}`;

        const titleAndCategory = (
          <>
            <h2 className="heading-title">
              {p.titel}
              {p.archived && (
                <span
                  className="inline-block align-middle"
                  style={{
                    marginLeft: "var(--spacing-half)",
                    padding: "2px 8px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-journal-meta)",
                    fontWeight: 400,
                    lineHeight: 1.4,
                    backgroundColor: "#000",
                    color: "#fff",
                    verticalAlign: "middle",
                  }}
                >
                  archiviert
                </span>
              )}
            </h2>
            <span
              className="italic"
              style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)", lineHeight: 1.2 }}
            >
              {p.kategorie}
            </span>
          </>
        );

        return (
          <div
            key={p.slug}
            ref={(el) => { itemRefs.current[p.slug] = el; }}
            className={`border-b-3 border-black transition-all duration-200 ${
              p.archived ? "bg-[var(--color-meta)]" : "hover:bg-white"
            }`}
          >
            <Link
              href={href}
              className="block text-black no-underline hover:!not-italic"
              style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}
            >
              {titleAndCategory}
            </Link>
            <div
              className={`grid transition-[grid-template-rows] duration-500 ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              style={{ fontSize: "var(--text-body)", lineHeight: 1.2 }}
              inert={!isExpanded}
            >
              <div className="overflow-hidden">
                <div style={{ padding: "0 var(--spacing-base) var(--spacing-base)" }}>
                  {p.content && p.content.length > 0 ? (
                    <JournalBlockRenderer content={p.content} />
                  ) : (
                    p.paragraphs.map((paragraph, i) => (
                      <p key={i} style={{ marginBottom: "var(--spacing-half)" }}>
                        {paragraph}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

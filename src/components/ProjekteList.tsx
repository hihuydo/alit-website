"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { Projekt } from "@/content/projekte";
import { JournalBlockRenderer } from "./JournalBlockRenderer";

export function ProjekteList({ projekte }: { projekte: Projekt[] }) {
  const params = useParams<{ locale: string; slug?: string }>();
  const locale = params.locale;
  const expandedSlug = params.slug;

  return (
    <div className="page-content hide-scrollbar">
      {projekte.map((p) => {
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
              className={`overflow-hidden transition-nav ${isExpanded ? "max-h-[1000px]" : "max-h-0"}`}
              style={{ fontSize: "var(--text-body)", lineHeight: 1.2 }}
            >
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
        );
      })}
    </div>
  );
}

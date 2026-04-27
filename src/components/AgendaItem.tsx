"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { JournalContent } from "@/lib/journal-types";
import type { AgendaHashtag } from "@/lib/agenda-hashtags-shared";
import type { ProjektSlugMap } from "@/lib/projekt-slug";
import type { AgendaImage } from "@/lib/agenda-images";
import { JournalBlockRenderer } from "./JournalBlockRenderer";

export type { AgendaHashtag };
export type { AgendaImage } from "@/lib/agenda-images";

export interface AgendaItemData {
  datum: string;
  zeit: string;
  ort: string;
  ortUrl: string | null;
  /** True when datum is today or later (Zurich-local). Drives the
   *  "Nächster Termin" badge on the public Panel-1 renderer. Optional
   *  so the legacy seed fixture in `src/content/agenda.ts` type-checks
   *  without duplicating the computation there — renderer falls back
   *  to `undefined → no badge` via truthy-short-circuit. */
  isUpcoming?: boolean;
  titel: string;
  lead?: string | null;
  beschrieb: string[];
  content?: JournalContent | null;
  hashtags?: AgendaHashtag[];
  images?: AgendaImage[];
  /** Per-Eintrag Spaltenzahl für die Bilder. cols=1 + length=1 triggert
   *  den orientation-aware Single-Image-Branch. cols>=2 (oder length>=2 mit
   *  cols=1 als defensive Edge-Case) triggert das Multi-Image-Grid.
   *  Optional für Legacy-Compat (seed-fixture in src/content/agenda.ts) —
   *  Renderer leitet `cols = item.imagesGridColumns ?? 1` defensiv ab. */
  imagesGridColumns?: number;
  /** Per-field fallback flags — set when the requested locale was empty and
   *  DE content was rendered. `lang="de"` goes on the per-field wrapper. */
  titleIsFallback?: boolean;
  leadIsFallback?: boolean;
  ortIsFallback?: boolean;
  contentIsFallback?: boolean;
}

const iconClass = "inline-block w-[14px] h-[14px] align-[-1px] mr-[3px]";
const iconProps = { fill: "none", stroke: "#000", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" className={iconClass} {...iconProps}>
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
  </svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" className={iconClass} {...iconProps}>
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" className={iconClass} {...iconProps}>
    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export function AgendaItem({
  item,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  projektSlugMap,
}: {
  item: AgendaItemData;
  defaultExpanded?: boolean;
  /** Controlled mode (Panel 1 accordion): parent owns expand-state. When
   *  defined, internal state is bypassed; toggle calls `onToggle` instead. */
  expanded?: boolean;
  onToggle?: () => void;
  // Resolves `hashtag.projekt_slug` (= projekt.slug_de, the stable ID)
  // to the locale-appropriate URL-slug. Map-miss = render tag as <span>
  // without link (projekt is hidden in this locale or was deleted — no
  // point pointing users at a guaranteed 404).
  projektSlugMap?: ProjektSlugMap;
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;
  const toggle = () => {
    if (isControlled) onToggle?.();
    else setInternalExpanded((v) => !v);
  };
  // Locale fallback: dashboard preview renders this component outside the
  // [locale] route segment, so useParams returns no locale. "de" is the
  // default site locale, used only for the hashtag preview links.
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "de";
  const hashtags = item.hashtags ?? [];
  const images = item.images ?? [];
  // Defensive: Legacy items + seed-fixtures haben das Feld nicht. cols=1 ist
  // der "Einzelbild"-Mode (default) — single-image-Branch nur wenn auch
  // exakt 1 Bild vorhanden, sonst defensive Multi-Image-Grid mit min(2, length)
  // Spalten (Risk #1: visuelle Migration bestehender Multi-Image-Einträge).
  const cols = item.imagesGridColumns ?? 1;

  return (
    <div className="border-b-3 border-black hoverable:hover:bg-white transition-all duration-200">
      {/* Meta row: date+time on the left, location on the right.
          flex-wrap + justify-between → on a wide panel they sit at opposite
          edges; on a narrow panel (panel 1 secondary) the location wraps onto
          its own line directly below the time. */}
      <div
        className="flex flex-wrap justify-between gap-x-4 gap-y-1"
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 300,
          fontSize: "var(--text-agenda-meta)",
          color: "#000",
          padding: "var(--spacing-half) var(--spacing-base) var(--spacing-half)",
        }}
      >
        <span className="min-w-0">
          <CalendarIcon /> {item.datum} &nbsp; <ClockIcon /> {item.zeit}
        </span>
        <span className="min-w-0" lang={item.ortIsFallback ? "de" : undefined}>
          <GlobeIcon />
          {item.ortUrl ? (
            <a href={item.ortUrl} target="_blank" rel="noopener noreferrer" className="link-dotted">{item.ort}</a>
          ) : (
            <span>{item.ort}</span>
          )}
        </span>
      </div>
      {item.isUpcoming && (
        <div style={{ padding: "0 var(--spacing-base) var(--spacing-half)" }}>
          <span
            className="inline-block"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-journal-meta)",
              fontWeight: 500,
              lineHeight: 1,
              color: "#fff",
              backgroundColor: "#000",
              padding: "0.25em 0.6em",
              borderRadius: "999px",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Nächster Termin
          </span>
        </div>
      )}
      <h2
        className="heading-title cursor-pointer"
        lang={item.titleIsFallback ? "de" : undefined}
        style={{ padding: `0 var(--spacing-base) ${item.lead ? "var(--spacing-half)" : "var(--spacing-base)"}` }}
        onClick={toggle}
      >
        {item.titel}
      </h2>
      {item.lead && (
        <p
          className="cursor-pointer"
          lang={item.leadIsFallback ? "de" : undefined}
          onClick={toggle}
          style={{
            padding: "0 var(--spacing-base) var(--spacing-base)",
            fontFamily: "var(--font-serif)",
            fontSize: "var(--text-body)",
            lineHeight: 1.2,
          }}
        >
          {item.lead}
        </p>
      )}
      <div
        className={`grid transition-[grid-template-rows] duration-500 ease-in-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)", lineHeight: 1.2 }}
        inert={!expanded}
      >
        <div className="overflow-hidden">
          {images.length > 0 && (() => {
            // Branch 1: Single-Image-Mode (cols=1 + length=1) → orientation-aware.
            // Container hat aspect-ratio aus width/height (oder Fallback 4:3
            // landscape / 3:4 portrait für Legacy-Rows). object-fit: cover
            // wirkt nur wenn container-aspect ≠ image-aspect (= bei Legacy
            // ohne dimensions wo Fallback ratio greift).
            if (cols === 1 && images.length === 1) {
              const img = images[0];
              const isPortrait = img.orientation === "portrait";
              const aspectW = img.width ?? (isPortrait ? 3 : 4);
              const aspectH = img.height ?? (isPortrait ? 4 : 3);
              return (
                <div style={{ padding: "0 var(--spacing-base) var(--spacing-base)" }}>
                  <div
                    className={isPortrait ? "w-1/2 mx-auto" : "w-full"}
                    style={{ aspectRatio: `${aspectW} / ${aspectH}` }}
                  >
                    <img
                      src={`/api/media/${img.public_id}/`}
                      alt={img.alt ?? ""}
                      loading="lazy"
                      width={aspectW}
                      height={aspectH}
                      className="w-full h-full block"
                      style={
                        img.fit === "contain"
                          ? { objectFit: "contain", background: "#fff" }
                          : {
                              objectFit: "cover",
                              objectPosition: `${img.cropX ?? 50}% ${img.cropY ?? 50}%`,
                            }
                      }
                    />
                  </div>
                </div>
              );
            }

            // Branch 2: Multi-Image-Grid (cols>=2 ODER defensive cols=1+length>=2).
            // Effektive Spaltenzahl gecapt auf images.length (kein leerer
            // trailing Slot im Render). Bei defensive Edge-Case (cols=1 +
            // length>=2) rendert min(2, length) Spalten. Inline style für
            // grid-template-columns weil Tailwind JIT keine runtime-cols
            // arbitrary-values erzeugt (would silently fall back to block).
            const effectiveCols = cols >= 2
              ? Math.min(cols, images.length)
              : Math.min(2, images.length);
            return (
              <div
                className="grid gap-[var(--spacing-half)]"
                style={{
                  padding: "0 var(--spacing-base) var(--spacing-base)",
                  gridTemplateColumns: `repeat(${effectiveCols}, 1fr)`,
                }}
              >
                {images.map((img, i) => (
                  <div key={`${img.public_id}-${i}`} className="aspect-[2/3]">
                    <img
                      src={`/api/media/${img.public_id}/`}
                      alt={img.alt ?? ""}
                      loading="lazy"
                      className="w-full h-full block"
                      style={
                        img.fit === "contain"
                          ? { objectFit: "contain", background: "#fff" }
                          : {
                              objectFit: "cover",
                              objectPosition: `${img.cropX ?? 50}% ${img.cropY ?? 50}%`,
                            }
                      }
                    />
                  </div>
                ))}
              </div>
            );
          })()}
          {item.content && item.content.length > 0 ? (
            <div
              lang={item.contentIsFallback ? "de" : undefined}
              style={{ padding: `0 var(--spacing-base) var(--spacing-base)` }}
            >
              <JournalBlockRenderer content={item.content} />
            </div>
          ) : (
            <div lang={item.contentIsFallback ? "de" : undefined}>
              {item.beschrieb.map((text, i) => (
                <p key={i} style={{ padding: `0 var(--spacing-base) var(--spacing-base)` }}>{text}</p>
              ))}
            </div>
          )}
          {hashtags.length > 0 && (
            <div
              className="flex flex-wrap gap-x-3 gap-y-1"
              style={{
                padding: `0 var(--spacing-base) var(--spacing-base)`,
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-agenda-meta)",
              }}
            >
              {hashtags.map((h) => {
                const entry = projektSlugMap?.[h.projekt_slug];
                if (entry) {
                  return (
                    <Link
                      key={h.tag}
                      href={`/${locale}/projekte/${entry.urlSlug}`}
                      className="link-dotted"
                    >
                      #{h.tag}
                    </Link>
                  );
                }
                // Map-miss: projekt is hidden in this locale or was deleted.
                // Render label without link to avoid a guaranteed 404.
                return (
                  <span key={h.tag} className="link-dotted" aria-disabled="true">
                    #{h.tag}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

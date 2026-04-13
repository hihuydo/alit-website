"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { JournalContent } from "@/lib/journal-types";
import type { AgendaHashtag } from "@/lib/agenda-hashtags-shared";
import { JournalBlockRenderer } from "./JournalBlockRenderer";

export type { AgendaHashtag };

export interface AgendaImage {
  public_id: string;
  orientation: "portrait" | "landscape";
  width?: number | null;
  height?: number | null;
  alt?: string | null;
}

export interface AgendaItemData {
  datum: string;
  zeit: string;
  ort: string;
  ortUrl: string;
  titel: string;
  lead?: string | null;
  beschrieb: string[];
  content?: JournalContent | null;
  hashtags?: AgendaHashtag[];
  images?: AgendaImage[];
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

export function AgendaItem({ item, defaultExpanded = false }: { item: AgendaItemData; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Locale fallback: dashboard preview renders this component outside the
  // [locale] route segment, so useParams returns no locale. "de" is the
  // default site locale, used only for the hashtag preview links.
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "de";
  const hashtags = item.hashtags ?? [];
  const images = item.images ?? [];

  return (
    <div className="border-b-3 border-black hover:bg-white transition-all duration-200">
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
        <span className="min-w-0">
          <GlobeIcon />
          <a href={item.ortUrl} target="_blank" rel="noopener noreferrer" className="link-dotted">{item.ort}</a>
        </span>
      </div>
      <h2
        className="heading-title cursor-pointer"
        style={{ padding: `0 var(--spacing-base) ${item.lead || images.length > 0 ? "var(--spacing-half)" : "var(--spacing-base)"}` }}
        onClick={() => setExpanded(!expanded)}
      >
        {item.titel}
      </h2>
      {item.lead && (
        <p
          className="cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          style={{
            padding: `0 var(--spacing-base) ${images.length > 0 ? "var(--spacing-half)" : "var(--spacing-base)"}`,
            fontFamily: "var(--font-serif)",
            fontSize: "var(--text-body)",
            lineHeight: 1.2,
          }}
        >
          {item.lead}
        </p>
      )}
      {images.length > 0 && (
        <div
          className="grid grid-cols-2 gap-[var(--spacing-half)]"
          style={{ padding: "0 var(--spacing-base) var(--spacing-base)" }}
        >
          {images.map((img, i) => {
            // width/height attrs let the browser reserve space and avoid CLS;
            // fall back to orientation-based aspect ratios for legacy rows
            // saved before we tracked dimensions.
            const w = img.width ?? (img.orientation === "portrait" ? 3 : 4);
            const h = img.height ?? (img.orientation === "portrait" ? 4 : 3);
            return (
              <img
                key={`${img.public_id}-${i}`}
                src={`/api/media/${img.public_id}/`}
                alt={img.alt ?? ""}
                loading="lazy"
                width={w}
                height={h}
                className={`w-full h-auto block ${img.orientation === "landscape" ? "col-span-2" : "col-span-1"}`}
              />
            );
          })}
        </div>
      )}
      <div
        className={`grid transition-[grid-template-rows] duration-500 ease-in-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)", lineHeight: 1.2 }}
        inert={!expanded}
      >
        <div className="overflow-hidden">
          {item.content && item.content.length > 0 ? (
            <div style={{ padding: `0 var(--spacing-base) var(--spacing-base)` }}>
              <JournalBlockRenderer content={item.content} />
            </div>
          ) : (
            item.beschrieb.map((text, i) => (
              <p key={i} style={{ padding: `0 var(--spacing-base) var(--spacing-base)` }}>{text}</p>
            ))
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
              {hashtags.map((h, i) => (
                <Link
                  key={`${h.projekt_slug}-${i}`}
                  href={`/${locale}/projekte/${h.projekt_slug}`}
                  className="link-dotted"
                >
                  #{h.tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

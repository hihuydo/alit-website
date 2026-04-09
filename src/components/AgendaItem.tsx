"use client";

import { useState } from "react";

export interface AgendaItemData {
  datum: string;
  zeit: string;
  ort: string;
  ortUrl: string;
  titel: string;
  beschrieb: string[];
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

export function AgendaItem({ item }: { item: AgendaItemData }) {
  const [expanded, setExpanded] = useState(false);

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
        style={{ padding: "0 var(--spacing-base) var(--spacing-base)" }}
        onClick={() => setExpanded(!expanded)}
      >
        {item.titel}
      </h2>
      <div className={`overflow-hidden transition-accordion ${expanded ? "max-h-[1200px]" : "max-h-0"}`} style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)", lineHeight: 1.2 }}>
        {item.beschrieb.map((text, i) => (
          <p key={i} style={{ padding: `0 var(--spacing-base) var(--spacing-base)` }}>{text}</p>
        ))}
      </div>
    </div>
  );
}

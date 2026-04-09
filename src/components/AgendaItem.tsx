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
    <div className="grid grid-cols-2 border-b-3 border-black hover:bg-white transition-all duration-200">
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 300, fontSize: "var(--text-agenda-meta)", color: "#000", padding: "var(--spacing-half) 0 var(--spacing-half) var(--spacing-base)" }}>
        <CalendarIcon /> {item.datum} &nbsp; <ClockIcon /> {item.zeit}
      </span>
      <span className="text-right" style={{ fontFamily: "var(--font-mono)", fontWeight: 300, fontSize: "var(--text-agenda-meta)", color: "#000", padding: "var(--spacing-half) var(--spacing-base) var(--spacing-half) 0" }}>
        <GlobeIcon />
        <a href={item.ortUrl} target="_blank" rel="noopener noreferrer" className="link-dotted">{item.ort}</a>
      </span>
      <h2
        className="col-span-full heading-title cursor-pointer"
        style={{ padding: "0 var(--spacing-base) var(--spacing-base)" }}
        onClick={() => setExpanded(!expanded)}
      >
        {item.titel}
      </h2>
      <div className={`col-span-full overflow-hidden transition-accordion ${expanded ? "max-h-[1200px]" : "max-h-0"}`} style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)", lineHeight: 1.2 }}>
        {item.beschrieb.map((text, i) => (
          <p key={i} style={{ padding: `0 var(--spacing-base) var(--spacing-base)` }}>{text}</p>
        ))}
      </div>
    </div>
  );
}

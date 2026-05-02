"use client";

import { useState } from "react";
import { AgendaItem } from "./AgendaItem";
import type { AgendaItemData } from "./AgendaItem";
import type { ProjektSlugMap } from "@/lib/projekt-slug";

export function AgendaPanel({
  items,
  projektSlugMap,
  supportersLabel,
}: {
  items: AgendaItemData[];
  projektSlugMap: ProjektSlugMap;
  /** Sprint M3 — localized "Mit freundlicher Unterstützung von" label,
   *  resolved by Wrapper.tsx from the dictionary and passed to each item. */
  supportersLabel: string;
}) {
  // Accordion: only one entry expanded at a time. null = all collapsed.
  // Click an open entry → collapse it; click a closed one → switch focus.
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="page-content hide-scrollbar">
      {items.map((item, i) => (
        <AgendaItem
          key={i}
          item={item}
          projektSlugMap={projektSlugMap}
          expanded={i === expandedIndex}
          onToggle={() => setExpandedIndex((prev) => (prev === i ? null : i))}
          supportersLabel={supportersLabel}
        />
      ))}
    </div>
  );
}

import { AgendaItem } from "./AgendaItem";
import type { AgendaItemData } from "./AgendaItem";
import type { ProjektSlugMap } from "@/lib/projekt-slug";

export function AgendaPanel({
  items,
  projektSlugMap,
}: {
  items: AgendaItemData[];
  projektSlugMap: ProjektSlugMap;
}) {
  return (
    <div className="page-content hide-scrollbar">
      {items.map((item, i) => (
        <AgendaItem key={i} item={item} projektSlugMap={projektSlugMap} />
      ))}
    </div>
  );
}

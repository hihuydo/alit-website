import { AgendaItem } from "./AgendaItem";
import type { AgendaItemData } from "./AgendaItem";

export function AgendaPanel({ items }: { items: AgendaItemData[] }) {
  return (
    <div className="page-content hide-scrollbar">
      {items.map((item, i) => (
        <AgendaItem key={i} item={item} />
      ))}
    </div>
  );
}

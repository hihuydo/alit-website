import { AgendaItem } from "./AgendaItem";
import { agendaItems } from "@/content/agenda";

export function AgendaPanel() {
  return (
    <div className="page-content hide-scrollbar">
      {agendaItems.map((item, i) => (
        <AgendaItem key={i} item={item} />
      ))}
    </div>
  );
}

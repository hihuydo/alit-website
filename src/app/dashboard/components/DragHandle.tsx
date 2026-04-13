export function DragHandle() {
  return (
    <span
      aria-hidden
      className="shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors select-none"
      title="Zum Neuordnen ziehen"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="5" cy="3" r="1.2" />
        <circle cx="11" cy="3" r="1.2" />
        <circle cx="5" cy="8" r="1.2" />
        <circle cx="11" cy="8" r="1.2" />
        <circle cx="5" cy="13" r="1.2" />
        <circle cx="11" cy="13" r="1.2" />
      </svg>
    </span>
  );
}

export function ReorderHint({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <circle cx="5" cy="3" r="1.2" />
        <circle cx="11" cy="3" r="1.2" />
        <circle cx="5" cy="8" r="1.2" />
        <circle cx="11" cy="8" r="1.2" />
        <circle cx="5" cy="13" r="1.2" />
        <circle cx="11" cy="13" r="1.2" />
      </svg>
      Reihenfolge per Drag &amp; Drop anpassen
    </p>
  );
}

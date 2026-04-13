function GripIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="3" r="1.2" />
      <circle cx="11" cy="3" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="13" r="1.2" />
      <circle cx="11" cy="13" r="1.2" />
    </svg>
  );
}

export function DragHandle() {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors select-none"
      title="Zum Neuordnen ziehen"
    >
      <GripIcon size={16} />
    </span>
  );
}

export function ReorderHint({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
      <GripIcon size={12} />
      Reihenfolge per Drag &amp; Drop anpassen
    </p>
  );
}

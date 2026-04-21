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
      className="shrink-0 min-w-11 min-h-11 md:min-w-0 md:min-h-0 flex items-center justify-center text-gray-400 group-hover:text-gray-600 transition-colors select-none"
      title="Zum Neuordnen ziehen"
    >
      <GripIcon size={16} />
    </span>
  );
}


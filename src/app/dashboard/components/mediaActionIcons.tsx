/**
 * Inline SVG icons for the MediaSection row action cluster.
 *
 * Same Lucide-style convention as `richTextIcons.tsx` (MIT-licensed path
 * shapes): 24×24 viewBox, stroke="currentColor", strokeWidth=2, round
 * linecaps + linejoins. Icons inherit color via `currentColor`, caller
 * sizes via className (default w-4 h-4 → 16×16).
 *
 * `aria-hidden` on each SVG: the containing <button> always owns an
 * aria-label (e.g. "Link intern kopieren") — the icon itself is purely
 * decorative for screen readers.
 */

type IconProps = { className?: string };

const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Chain-link icon — internal copy-link action. */
export function LinkIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" />
    </svg>
  );
}

/** Chain-link with up-right arrow — external/public copy-link action. */
export function LinkExternalIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

/** Download arrow-into-tray icon. */
export function DownloadIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** Pencil icon — rename action. */
export function EditIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

/** Trash can icon — delete action. */
export function TrashIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

/** Checkmark — copy-success feedback flash (replaces link icon ~500ms). */
export function CheckIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <polyline points="5 12 10 17 20 7" />
    </svg>
  );
}

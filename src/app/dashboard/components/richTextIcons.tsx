/**
 * Inline SVG icons for the RichTextEditor toolbar.
 *
 * Lucide-style paths (MIT): 24×24 viewBox, stroke="currentColor",
 * strokeWidth=2, stroke-linecap + stroke-linejoin="round". Icons inherit
 * button color via `currentColor`, visible size via caller's className
 * (default w-4 h-4 → 16×16). No external dependency — SVG paths are
 * small enough to inline without bundle-size cost.
 *
 * aria-hidden on the SVG itself: the containing <button> already has an
 * aria-label (Fett / Kursiv / Überschrift 2 / …). Screen-readers don't
 * need to announce the decorative SVG.
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

export function BoldIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M14 12a4 4 0 0 0 0-8H6v8" />
      <path d="M15 20a4 4 0 0 0 0-8H6v8Z" />
    </svg>
  );
}

export function ItalicIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  );
}

export function Heading2Icon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
    </svg>
  );
}

export function Heading3Icon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="M17.5 10.5c1.7-1 3.5 0 3.5 2 0 1-.5 2-2 2 1.5 0 2 1 2 2 0 2-1.8 3-3.5 2" />
    </svg>
  );
}

export function QuoteIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
    </svg>
  );
}

export function LinkIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function UnlinkIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
      <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
      <line x1="8" y1="2" x2="8" y2="5" />
      <line x1="2" y1="8" x2="5" y2="8" />
      <line x1="16" y1="19" x2="16" y2="22" />
      <line x1="19" y1="16" x2="22" y2="16" />
    </svg>
  );
}

export function ImageIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

export function CaptionIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <rect width="18" height="14" x="3" y="5" rx="2" ry="2" />
      <path d="M7 15h4" />
      <path d="M15 15h2" />
      <path d="M7 11h2" />
      <path d="M13 11h4" />
    </svg>
  );
}

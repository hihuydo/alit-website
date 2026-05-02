import type { SupporterLogo } from "@/lib/supporter-logos";

const LOGO_HEIGHT = "clamp(24px, 2.64vw, 34px)";

export function AgendaSupporters({
  logos,
  label,
}: {
  logos: SupporterLogo[];
  label: string;
}) {
  if (logos.length === 0) return null;

  return (
    <section
      data-testid="agenda-supporters"
      style={{ padding: "0 var(--spacing-base) var(--spacing-base)" }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-agenda-meta)",
          fontWeight: 300,
          marginBottom: "var(--spacing-half)",
          color: "#000",
        }}
      >
        {label}
      </p>
      <ul
        role="list"
        className="flex flex-wrap items-center gap-3 list-none p-0 m-0"
      >
        {logos.map((logo) => (
          <li key={logo.public_id} className="m-0 p-0">
            <img
              src={`/api/media/${logo.public_id}/`}
              alt={logo.alt ?? ""}
              loading="lazy"
              width={logo.width ?? undefined}
              height={logo.height ?? undefined}
              style={{
                height: LOGO_HEIGHT,
                width: "auto",
                display: "block",
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

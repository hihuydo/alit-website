"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { Dictionary } from "@/i18n/dictionaries";
import { AlitContent } from "./nav-content/AlitContent";
import { NewsletterContent } from "./nav-content/NewsletterContent";
import { MitgliedschaftContent } from "./nav-content/MitgliedschaftContent";

export type NavItem = {
  key: string;
  href: string;
};

export const navItems: readonly NavItem[] = [
  { key: "alit", href: "/alit" },
  { key: "newsletter", href: "/newsletter" },
  { key: "mitgliedschaft", href: "/mitgliedschaft" },
];

const navContent: Record<string, React.ComponentType> = {
  alit: AlitContent,
  newsletter: NewsletterContent,
  mitgliedschaft: MitgliedschaftContent,
};

// Resolve the expanded nav item from the current pathname. Returns null when
// no nav route is active (home, /projekte, etc.).
export function activeNavKey(pathname: string, locale: string): string | null {
  const stripped = pathname.replace(`/${locale}`, "").replace(/\/$/, "");
  const match = navItems.find((item) => item.href === stripped);
  return match?.key ?? null;
}

export function LanguageBar({ locale }: { locale: string }) {
  const pathname = usePathname();
  const pathWithoutLocale = pathname.replace(`/${locale}`, "") || "";

  return (
    <div
      className="language-bar shrink-0 flex items-start justify-end border-b-3 border-black bg-white"
      style={{ height: "var(--logo-height)", paddingRight: "var(--spacing-base)", paddingTop: "var(--spacing-half)" }}
    >
      <ul className="flex list-none" style={{ fontSize: "var(--text-body)", paddingTop: "6.667px" }}>
        <li>
          {locale === "de" ? (
            <span className="text-black">d</span>
          ) : (
            <Link href={`/de${pathWithoutLocale}`} className="text-meta no-underline hover:text-black">d</Link>
          )}
          <span className="text-black mx-2">/</span>
        </li>
        <li>
          {locale === "fr" ? (
            <span className="text-black">f</span>
          ) : (
            <Link href={`/fr${pathWithoutLocale}`} className="text-meta no-underline hover:text-black">f</Link>
          )}
        </li>
      </ul>
    </div>
  );
}

export function NavBars({ locale, dict }: { locale: string; dict: Dictionary }) {
  const pathname = usePathname();
  const expandedKey = activeNavKey(pathname, locale);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // When navigating into a nav item (alit/newsletter/mitgliedschaft), scroll
  // it to the top of panel 3. Without this, an already-scrolled panel keeps
  // its old position and the newly-expanded section sits off-screen.
  useEffect(() => {
    if (!expandedKey) return;
    const el = itemRefs.current[expandedKey];
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [expandedKey]);

  return (
    <>
      {navItems.map((item) => {
        const label = dict.nav[item.key as keyof typeof dict.nav];
        const isExpanded = expandedKey === item.key;
        const Content = navContent[item.key];
        // Toggle by routing: open → go home; closed → go to this route
        const href = isExpanded ? `/${locale}` : `/${locale}${item.href}`;

        return (
          <div
            key={item.key}
            ref={(el) => { itemRefs.current[item.key] = el; }}
            className="border-b-3 border-black hoverable:hover:bg-white transition-all duration-200"
          >
            <Link
              href={href}
              className={`block text-black no-underline ${isExpanded ? "italic" : "hover:italic"}`}
              style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}
            >
              <span style={{ fontFamily: "var(--font-headline)", fontSize: "var(--text-title)", lineHeight: 1.2 }}>
                {label}
              </span>
            </Link>
            <div
              className={`grid transition-[grid-template-rows] duration-[800ms] ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              style={{ fontSize: "var(--text-body)", lineHeight: 1.2 }}
              inert={!isExpanded}
              aria-hidden={!isExpanded}
            >
              <div className="overflow-hidden">
                <div className="nav-content" style={{ padding: "0 var(--spacing-base) var(--spacing-base)" }}>
                  {/* Only mount nav-section bodies when expanded — avoids
                      hydrating all three (prose + two forms) on every route. */}
                  {isExpanded && Content && <Content />}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

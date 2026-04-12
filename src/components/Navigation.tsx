"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export function LanguageBar({ locale }: { locale: string }) {
  const pathname = usePathname();
  const pathWithoutLocale = pathname.replace(`/${locale}`, "") || "";

  return (
    <div
      className="shrink-0 flex items-start justify-end border-b-3 border-black bg-white"
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

export function NavBars({ dict }: { dict: Dictionary }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // On mount, open the nav item referenced by the URL hash (e.g. /de#alit)
  // so that redirects from legacy routes land on the right section.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && navItems.some((item) => item.key === hash)) {
      setExpanded(hash);
    }
  }, []);

  const handleToggle = (key: string) => {
    setExpanded(expanded === key ? null : key);
  };

  return (
    <>
      {navItems.map((item) => {
        const label = dict.nav[item.key as keyof typeof dict.nav];
        const isExpanded = expanded === item.key;
        const Content = navContent[item.key];

        return (
          <div key={item.key} className="border-b-3 border-black hover:bg-white transition-all duration-200">
            <button
              onClick={() => handleToggle(item.key)}
              className={`block w-full text-left text-black cursor-pointer bg-transparent border-none ${isExpanded ? "italic" : "hover:italic"}`}
              style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}
            >
              <span style={{ fontFamily: "var(--font-headline)", fontSize: "var(--text-title)", lineHeight: 1.2 }}>
                {label}
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-[800ms] ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              style={{ fontSize: "var(--text-body)", lineHeight: 1.2 }}
            >
              <div className="overflow-hidden">
                <div style={{ padding: "0 var(--spacing-base) var(--spacing-base)" }}>
                  {Content && <Content />}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}


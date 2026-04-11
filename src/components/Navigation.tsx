"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Dictionary } from "@/i18n/dictionaries";

interface NavigationProps {
  locale: string;
  dict: Dictionary;
}

export type NavItem = {
  key: string;
  href: string;
};

export const navItems: readonly NavItem[] = [
  { key: "alit", href: "/alit" },
  { key: "newsletter", href: "/newsletter" },
  { key: "mitgliedschaft", href: "/mitgliedschaft" },
];

export function Navigation({ locale, dict }: NavigationProps) {
  const pathname = usePathname();
  const pathWithoutLocale = pathname.replace(`/${locale}`, "") || "";

  return (
    <>
      {/* Language bar — d/f only */}
      <div
        className="shrink-0 flex items-start border-b-3 border-black bg-white"
        style={{ height: "var(--logo-height)", paddingLeft: "var(--spacing-base)", paddingTop: "var(--spacing-half)" }}
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

      {/* Nav items as bars — analogous to project rows */}
      {navItems.map((item) => {
        const label = dict.nav[item.key as keyof typeof dict.nav];
        const fullHref = `/${locale}${item.href}`;
        const isActive = pathname === fullHref || pathname === `${fullHref}/`;

        return (
          <div key={item.key} className="border-b-3 border-black hover:bg-white transition-all duration-200">
            <Link
              href={fullHref}
              className={`block text-black no-underline ${isActive ? "italic" : "hover:italic"}`}
              style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}
            >
              <span style={{ fontFamily: "var(--font-headline)", fontSize: "var(--text-title)", lineHeight: 1.2 }}>
                {label}
              </span>
            </Link>
          </div>
        );
      })}
    </>
  );
}

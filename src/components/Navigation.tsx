"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Dictionary } from "@/i18n/dictionaries";

interface NavigationProps {
  locale: string;
  title: string;
  dict: Dictionary;
}

export type NavItem = {
  key: string;
  href: string;
  // When true, the item stays in navItems for title lookups but is not
  // rendered in the burger menu. Used for the agenda landing, which is
  // anchored in panel 1 and never reached via the menu.
  hideFromMenu?: boolean;
};

export const navItems: readonly NavItem[] = [
  { key: "projekte", href: "/projekte" },
  { key: "alit", href: "/alit" },
  { key: "mitgliedschaft", href: "/mitgliedschaft" },
  { key: "newsletter", href: "/newsletter" },
];

export function Navigation({ locale, title, dict }: NavigationProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const otherLocale = locale === "de" ? "fr" : "de";
  const pathWithoutLocale = pathname.replace(`/${locale}`, "") || "";

  // Auto-collapse the burger menu after the route changes — i.e. once the
  // user has clicked a menu item and the new page has mounted.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className={`menu-bar shrink-0 bg-white ${open ? "menu-open" : ""}`}>
      <div className="grid grid-cols-[1fr_80px_80px] items-start border-b-3 border-black" style={{ height: "var(--logo-height)", paddingLeft: "var(--spacing-base)", paddingTop: "var(--spacing-half)" }}>
        <div style={{ fontFamily: "var(--font-headline)", fontSize: "var(--text-title)", lineHeight: 1.2 }}>
          <Link href={`/${locale}${navItems.find((i) => dict.nav[i.key as keyof typeof dict.nav] === title)?.href ?? ""}`} className="text-black no-underline hover:italic">
            {title}
          </Link>
        </div>

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

        <button
          className="w-[60px] h-[50px] relative cursor-pointer bg-transparent border-none p-0 justify-self-end"
          onClick={() => setOpen(!open)}
        >
          <span className={`block w-[40px] h-[4px] absolute left-0 top-[20px] transition-colors duration-300 ${open ? "bg-transparent" : "bg-black"}`}>
            <span className={`block w-[40px] h-[4px] bg-black absolute left-0 ${open ? "top-0 rotate-45 delay-[0s,0.3s]" : "top-[-14px] delay-[0.3s,0s]"}`} style={{ transitionProperty: "top, transform", transitionDuration: "0.3s, 0.3s" }} />
            <span className={`block w-[40px] h-[4px] bg-black absolute left-0 ${open ? "bottom-0 -rotate-45 delay-[0s,0.3s]" : "bottom-[-14px] delay-[0.3s,0s]"}`} style={{ transitionProperty: "bottom, transform", transitionDuration: "0.3s, 0.3s" }} />
          </span>
        </button>
      </div>

      <ul className={`list-none p-0 m-0 overflow-hidden transition-nav ${open ? "max-h-[400px] border-b-3 border-black" : "max-h-0"}`} style={{ paddingLeft: "var(--spacing-base)" }}>
        {navItems.map((item) => {
          const label = dict.nav[item.key as keyof typeof dict.nav];
          const fullHref = `/${locale}${item.href}`;
          const isActive = pathname === fullHref || pathname === `${fullHref}/`;
          if (isActive || item.hideFromMenu) return null;
          return (
            <li key={item.key}>
              <Link
                href={fullHref}
                className="block text-black no-underline hover:italic"
                style={{ fontFamily: "var(--font-headline)", fontSize: "var(--text-title)", lineHeight: "46.5px" }}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

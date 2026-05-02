"use client";

import { dashboardStrings } from "../i18n";
import { LeisteLabelsSection } from "./LeisteLabelsSection";
import { NavLabelsSection } from "./NavLabelsSection";
import type { LeisteLabelsI18n } from "@/lib/leiste-labels-shared";
import type { NavLabelsI18n } from "@/lib/nav-labels-shared";

export function SiteLabelsSection({
  leiste,
  nav,
}: {
  leiste: LeisteLabelsI18n;
  nav: NavLabelsI18n;
}) {
  const t = dashboardStrings.leiste;
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-semibold mb-2">{t.sectionHeading}</h2>
        <p className="text-sm text-gray-600">{t.sectionIntro}</p>
      </div>
      <NavLabelsSection initial={nav} />
      <LeisteLabelsSection initial={leiste} />
    </div>
  );
}

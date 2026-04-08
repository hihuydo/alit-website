import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";
import Link from "next/link";

const projekte = [
  { titel: "essais agités", kategorie: "Publikationsreihe" },
  { titel: "Weltenliteratur", kategorie: "Veranstaltungsreihe" },
  { titel: "Unsere Schweiz", kategorie: "Anthologie" },
  { titel: "Dunkelkammern", kategorie: "Anthologie" },
  { titel: "AUCTOR", kategorie: "Plattform" },
  { titel: "Poetische Schweiz", kategorie: "Lyrikprojekt" },
  { titel: "Zürcher Literaturwerkstatt", kategorie: "Öffentliche Werkstattgespräche" },
];

export default async function ProjektePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.projekte} dict={dict} />
      <div className="flex-1 overflow-y-auto hide-scrollbar text-black" style={{ fontSize: "var(--text-body)", lineHeight: "normal" }}>
        {projekte.map((p) => (
          <div key={p.titel} className="border-b-3 border-black hover:bg-white transition-all duration-200">
            <Link href="#" className="block text-black no-underline hover:!not-italic" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
              <h2 className="font-normal m-0" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-title)", lineHeight: "normal" }}>{p.titel}</h2>
              <span className="italic" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)", lineHeight: "normal" }}>{p.kategorie}</span>
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}

import { notFound } from "next/navigation";
import { locales } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Wrapper } from "@/components/Wrapper";
import { getAgendaItems, getJournalEntries, getProjekte, getAlitSections, getJournalInfo, getLeisteLabels } from "@/lib/queries";
import { getSubmissionFormTexts } from "@/lib/submission-form-texts";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  const baseDict = getDictionary(locale as Locale);

  const [agendaItems, journalEntries, projekte, alitSections, journalInfo, leisteLabels, submissionTexts] = await Promise.all([
    getAgendaItems(locale as Locale),
    getJournalEntries(locale as Locale),
    getProjekte(locale as Locale),
    // Locale-aware: FR sections fall back to DE content via t() inside
    // getAlitSections; the AlitContent renderer marks fallback wrappers
    // with lang="de" for accessibility.
    getAlitSections(locale as Locale),
    getJournalInfo(locale as Locale),
    getLeisteLabels(locale as Locale),
    getSubmissionFormTexts(locale as Locale),
  ]);

  // Override dict.leiste with CMS-stored labels (per-field fallback to defaults
  // is handled inside getLeisteLabels). Single source of truth: the helper.
  // mitgliedschaft / newsletter overlay editable prose only — form-labels
  // (vorname, email, …) stay in baseDict (Sprint M1 DK-5).
  // Cast: the override widens literal-typed keys (e.g. nav.projekte "Projekte"|"Projets")
  // to plain `string`; the Dictionary type union still matches structurally.
  const dict = {
    ...baseDict,
    leiste: leisteLabels,
    mitgliedschaft: { ...baseDict.mitgliedschaft, ...submissionTexts.mitgliedschaft },
    newsletter: { ...baseDict.newsletter, ...submissionTexts.newsletter },
  } as typeof baseDict;

  return (
    <html lang={locale} className="h-full">
      <body className="h-full overflow-hidden">
        <Wrapper locale={locale} agendaItems={agendaItems} journalEntries={journalEntries} projekte={projekte} alitSections={alitSections} journalInfo={journalInfo} dict={dict}>
          {children}
        </Wrapper>
      </body>
    </html>
  );
}

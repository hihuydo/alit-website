import { notFound } from "next/navigation";
import { locales } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Wrapper } from "@/components/Wrapper";
import { getAgendaItems, getJournalEntries, getProjekte, getAlitSections } from "@/lib/queries";

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
  const dict = getDictionary(locale as Locale);

  const [agendaItems, journalEntries, projekte, alitSections] = await Promise.all([
    getAgendaItems(locale as Locale),
    getJournalEntries(),
    getProjekte(locale as Locale),
    // Locale-aware: FR sections fall back to DE content via t() inside
    // getAlitSections; the AlitContent renderer marks fallback wrappers
    // with lang="de" for accessibility.
    getAlitSections(locale as Locale),
  ]);

  return (
    <html lang={locale} className="h-full">
      <body className="h-full overflow-hidden">
        <Wrapper locale={locale} agendaItems={agendaItems} journalEntries={journalEntries} projekte={projekte} alitSections={alitSections} dict={dict}>
          {children}
        </Wrapper>
      </body>
    </html>
  );
}

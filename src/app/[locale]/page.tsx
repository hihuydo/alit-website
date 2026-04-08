import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.aktuell} dict={dict} />
      <div className="page-content hide-scrollbar">
        <div>
          <p style={{ padding: "var(--spacing-content-top) var(--spacing-base) var(--spacing-base)" }}>
            Mit «Exploration du flux» hat Marina Skalova 2018 ein literarisches Experiment vorgelegt. Unter dem Eindruck der «Migrationskrise» und der zahllosen Schiffbrüchigen im Mittelmeer bannte sie die herrschenden Diskurse, die sich in der Öffentlichkeit endemisch ausbreiteten, in einem poetischen Flow. Ihre metaphorische Rede von Migrationsströmen, Finanzhandelsströmen, Körperströmen und Meeresströmen hat bis heute nichts von ihrer Brisanz verloren. Auch in der deutschen Übersetzung «Fliessen und Strömen. Eine Erkundung» deckt sie Widersprüche auf und konfrontiert uns mit gefährlichen Abgründen. Die Aufmerksamkeit hat sich inzwischen auf andere Krisen und Kriege verlagert. Als die russische Armee im Februar 2022 die Ukraine überfiel und einen «Flüchtlingsstrom» in Richtung Westen auslöste, veränderte sich auch das Gesicht der Migration in Europa und in der Schweiz. Für die deutsche Übersetzung «Fliessen und Strömen» hat Marina Skalova zwei weitere Texte sowie ein aktuelles Nachwort hinzugefügt, in denen sie die unterschiedlichen «Krisen» unter der Metapher des Fliessens und Strömens miteinander verbindet. Das Buch erscheint mit Unterstützung von Republik und Kanton Genf sowie der Schweizer Kulturstiftung Pro Helvetia.
          </p>
        </div>
      </div>
    </>
  );
}

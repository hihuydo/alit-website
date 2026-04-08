import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";

export default async function NewsletterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.newsletter} dict={dict} />
      <div className="page-content hide-scrollbar">
        <div>
          <p style={{ padding: "var(--spacing-content-top) var(--spacing-base) var(--spacing-base)" }}>In unserem Newsletter teilen wir in unregelmässigen Abständen Neuigkeiten aus und mit unserem Netzwerk für Literatur. In diesem Jahr wird der Newsletter zudem von der diskursiven Essay-Reihe «Discours Agités» bespielt.</p>
          <p className="border-b-3 border-black" style={{ padding: "0 var(--spacing-base) var(--spacing-base)" }}>
            <a href="https://mailchi.mp/alit/newsletter-und-discoursagites" target="_blank" rel="noopener noreferrer" className="link-dotted">Anmeldung zum Newsletter</a>
          </p>
        </div>
      </div>
    </>
  );
}

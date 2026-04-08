import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";

export default async function NewsletterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.newsletter} dict={dict} />
      <div className="flex-1 overflow-y-auto hide-scrollbar text-black" style={{ fontSize: "var(--text-body)", lineHeight: "normal" }}>
        <div>
          <p style={{ padding: "28px var(--spacing-base) var(--spacing-base)" }}>In unserem Newsletter teilen wir in unregelmässigen Abständen Neuigkeiten aus und mit unserem Netzwerk für Literatur. In diesem Jahr wird der Newsletter zudem von der diskursiven Essay-Reihe «Discours Agités» bespielt.</p>
          <p className="border-b-3 border-black" style={{ padding: "0 var(--spacing-base) var(--spacing-base)" }}>
            <a href="https://mailchi.mp/alit/newsletter-und-discoursagites" target="_blank" rel="noopener noreferrer" className="text-black no-underline border-b-2 border-dotted border-black hover:!not-italic">Anmeldung zum Newsletter</a>
          </p>
        </div>
      </div>
    </>
  );
}

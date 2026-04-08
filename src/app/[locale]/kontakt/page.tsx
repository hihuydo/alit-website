import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";

export default async function KontaktPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.kontakt} dict={dict} />
      <div className="page-content hide-scrollbar">
        <div>
          <p style={{ padding: "var(--spacing-content-top) var(--spacing-base) var(--spacing-base)" }}>
            Alit<br />c/o Museumsgesellschaft<br />Limmatquai 62<br />Postfach<br />8024 Zürich<br /><a href="mailto:info@alit.ch" className="link-dotted">info@alit.ch</a>
          </p>

          <div style={{ padding: "var(--spacing-double) var(--spacing-base) 0" }}>
            <p><em>Impressum</em></p>
            <p>Redaktion und Inhalt Website: © Alit</p>
            <p>Redaktion und Inhalt Journal: © bei den Autor*innen</p>
            <p>Gestaltung und Realisation: Affolter/Savolainen</p>
          </div>

          <div className="border-b-3 border-black" style={{ padding: "var(--spacing-base) var(--spacing-base) calc(var(--spacing-double) * 2)" }}>
            <p><a href="#" className="link-dotted">Datenschutz</a></p>
          </div>
        </div>
      </div>
    </>
  );
}

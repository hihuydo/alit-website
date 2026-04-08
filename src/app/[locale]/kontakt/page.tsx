import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";

export default async function KontaktPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.kontakt} dict={dict} />
      <div className="flex-1 overflow-y-auto hide-scrollbar text-black" style={{ fontSize: "var(--text-body)", lineHeight: "normal" }}>
        <div>
          <p style={{ padding: "28px var(--spacing-base) var(--spacing-base)" }}>
            Alit<br />c/o Museumsgesellschaft<br />Limmatquai 62<br />Postfach<br />8024 Zürich<br /><a href="mailto:info@alit.ch" className="text-black no-underline border-b-2 border-dotted border-black hover:!not-italic">info@alit.ch</a>
          </p>

          <div style={{ padding: "var(--spacing-double) var(--spacing-base) 0" }}>
            <p className="m-0 p-0"><em>Impressum</em></p>
            <p className="m-0 p-0">Redaktion und Inhalt Website: © Alit</p>
            <p className="m-0 p-0">Redaktion und Inhalt Journal: © bei den Autor*innen</p>
            <p className="m-0 p-0">Gestaltung und Realisation: Affolter/Savolainen</p>
          </div>

          <div className="border-b-3 border-black" style={{ padding: "var(--spacing-base) var(--spacing-base) 106.668px" }}>
            <p className="m-0 p-0"><a href="#" className="text-black no-underline border-b-2 border-dotted border-black hover:!not-italic">Datenschutz</a></p>
          </div>
        </div>
      </div>
    </>
  );
}

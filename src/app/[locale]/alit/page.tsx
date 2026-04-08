import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";

export default async function AlitPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.alit} dict={dict} />
      <div className="flex-1 overflow-y-auto hide-scrollbar text-black" style={{ fontSize: "var(--text-body)", lineHeight: "normal" }}>
        <div>
          <p style={{ padding: "28px var(--spacing-base) 0" }}>Alit – Netzwerk für Literatur ist ein selbständiger Verein mit Sitz in Zürich. Der Verein fördert die Produktion und Distribution von Literatur aus der Schweiz und vermittelt das vielfältige literarische Schaffen durch Publikationen, Veranstaltungen, Debatten und Vernetzung einem breiten interessierten Publikum.</p>

          <p style={{ padding: "28px var(--spacing-base) 0" }}>Alit ist eine Autor:inneninitiative, orientiert sich an den Bedürfnissen der Literaturschaffenden und initiiert Projekte. Der Verein engagiert sich für Texte, die von Verlagen aus ökonomischen Gründen nicht publiziert werden, beispielsweise in den Gattungen Lyrik, Dramatik und Essay und von nicht-landessprachigen oder vergessenen Schweizer Autor:innen. Mit seiner Tätigkeit reagiert der Verein auf die derzeitigen Entwicklungen in der Medienlandschaft und auf dem Buchmarkt und versucht, Lücken in der aktuellen Literaturförderung schliessen zu helfen.</p>

          <p style={{ padding: "28px var(--spacing-base) 0" }}>2021 lancierte Alit die Initiative <strong>«Zukunft Literatur Schweiz 1945–2045 | 100 Jahre neuere Schweizer Literaturen».</strong></p>

          <p style={{ padding: "28px var(--spacing-base) 0" }}>Im Rahmen dieser Initiative führte der Verein drei neue Programme ein:</p>

          <p style={{ padding: "28px var(--spacing-base) 0" }}>Erstens das Programm «Sichtbarmachung», in dem zusammen mit Autor:innen neue Fördermöglichkeiten erarbeitet werden, um die Sichtbarkeit heute entstehender Texte zu erhöhen.</p>

          <p style={{ padding: "28px var(--spacing-base) 0" }}>Zweitens das Programm «Kulturelles Gedächtnis», das Texte von herausragender ästhetischer Qualität, die nach 1945 entstanden sind, lieferbar erhalten und zeigen will, dass sie auch wichtige Quellen sind für das Verständnis von Entwicklungen in den Bereichen Kultur, Gesellschaft und Politik.</p>

          <p style={{ padding: "28px var(--spacing-base) var(--spacing-base)" }}>Und drittens das Programm «Vermittlung», das Projekte unterstützt, die die Vernetzung und den Austausch zwischen Literaturen der Schweiz und internationalen Literaturentwicklungen deutlich machen und einer breiteren Öffentlichkeit vermitteln.</p>

          <p style={{ padding: "28px var(--spacing-base) var(--spacing-base)" }}>Alit wirkt in Ergänzung zu Schweizer Institutionen mit verwandtem Zweck. Der Verein kann also bestehende Fördergefässe ergänzen. Er versteht sich als Partner von Literaturveranstaltern, Verlagen, Universitäten, Schulen und Archiven. Alit möchte die Initiative «Zukunft Literatur Schweiz 1945–2045 | 100 Jahre neuere Schweizer Literaturen» langfristig aufbauen und strebt Nachhaltigkeit an.</p>

          {/* Projektpartner */}
          <div className="border-t-3 border-black" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
            <h3 className="font-normal italic m-0 mb-[6.667px]" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)" }}>Projektpartner</h3>
            <p className="m-0 p-0">Projekte von Alit wurden bisher gefördert durch:</p>
            <p className="m-0 p-0">
              Ernst Göhner Stiftung<br />Pro Helvetia<br />Landis&amp;Gyr Stiftung<br />Migros Kulturprozent<br />Aargauer Kuratorium<br />Charlotte Kerr Dürrenmatt-Stiftung<br />Christoph Merian Stiftung<br />Kanton Basel-Stadt<br />Stadt Zürich Kultur<br />Kanton Zürich<br />FUKA-Fonds Luzern<br />Regionalkonferenz Kultur RKK Luzern<br />Däster Schild Stiftung<br />Stadt Solothurn<br />Kanton Solothurn<br />Pro Scientia et Arte<br />Bundesamt für Kultur BAK<br />Autorinnen und Autoren der Schweiz A*dS<br />Zürcher Kantonalbank
            </p>
          </div>

          {/* Vorstand */}
          <div className="border-t-3 border-black" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
            <h3 className="font-normal italic m-0 mb-[6.667px]" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)" }}>Vorstand</h3>
            <p className="m-0 p-0">Guy Krneta, Co-Präsident<br />Anja Schmitter, Co-Präsidentin<br />Donat Blum<br />Rudolf Bussmann<br />Beat Mazenauer<br />Dragica Rajčić Holzner</p>
          </div>

          {/* Ehemalige */}
          <div className="border-t-3 border-black" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
            <h3 className="font-normal italic m-0 mb-[6.667px]" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)" }}>Ehemalige Vorstandsmitglieder</h3>
            <p className="m-0 p-0">Ruth Schweikert<br />Liliane Studer<br />Susanne Schenzle<br />Alexander Estis<br />Bettina Wohlfender<br />Vera Schindler-Wunderlich</p>
          </div>

          {/* Geschäftsstelle */}
          <div className="border-t-3 border-black" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
            <h3 className="font-normal italic m-0 mb-[6.667px]" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)" }}>Geschäftsstelle</h3>
            <p className="m-0 p-0">Alit – Netzwerk für Literatur<br />c/o Museumsgesellschaft<br />Limmatquai 62<br />Postfach<br />8024 Zürich<br /><a href="mailto:info@alit.ch" className="text-black no-underline border-b-2 border-dotted border-black hover:!not-italic">info@alit.ch</a></p>
          </div>

          {/* Kontoverbindung */}
          <div className="border-t-3 border-black" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
            <h3 className="font-normal italic m-0 mb-[6.667px]" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)" }}>Kontoverbindung</h3>
            <p className="m-0 p-0">ZKB Zürich<br />Alit<br />IBAN CH56 0070 0114 8071 6867 1</p>
          </div>
        </div>
      </div>
    </>
  );
}

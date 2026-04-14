import type { JournalBlock } from "@/lib/journal-types";

// Seed source for `alit_sections`. Mirrors the structure that the hardcoded
// `AlitContent.tsx` renders today. Used exclusively by `seed.ts` on an empty DB.
//
// Conventions used below:
//  - Newlines inside a paragraph's text node render as line breaks on the
//    public page thanks to `white-space: pre-line` on `.alit-section-body`.
//    Editor input (JournalEditor/RichTextEditor) never produces `\n` inside
//    text nodes, so this only affects seeded content.
//  - Intro uses spacer blocks between paragraphs to match the previous
//    inline `paddingTop: var(--spacing-content-top)` spacing; every other
//    section stacks paragraphs tight (same as original JSX).
//  - Section title `null` = no heading, no `.content-section` wrapper on the
//    public page (intro-style). Everything else gets a title + wrapper.

export type AlitSectionSeed = {
  title: string | null;
  content: JournalBlock[];
};

const p = (id: string, text: string): JournalBlock => ({
  id,
  type: "paragraph",
  content: [{ text }],
});

const spacer = (id: string): JournalBlock => ({
  id,
  type: "spacer",
  size: "m",
});

export const alitSections: AlitSectionSeed[] = [
  {
    title: null,
    content: [
      p(
        "intro-1",
        "Alit – Netzwerk für Literatur ist ein selbständiger Verein mit Sitz in Zürich. Der Verein fördert die Produktion und Distribution von Literatur aus der Schweiz und vermittelt das vielfältige literarische Schaffen durch Publikationen, Veranstaltungen, Debatten und Vernetzung einem breiten interessierten Publikum.",
      ),
      spacer("intro-s1"),
      p(
        "intro-2",
        "Alit ist eine Autor:inneninitiative, orientiert sich an den Bedürfnissen der Literaturschaffenden und initiiert Projekte. Der Verein engagiert sich für Texte, die von Verlagen aus ökonomischen Gründen nicht publiziert werden, beispielsweise in den Gattungen Lyrik, Dramatik und Essay und von nicht-landessprachigen oder vergessenen Schweizer Autor:innen. Mit seiner Tätigkeit reagiert der Verein auf die derzeitigen Entwicklungen in der Medienlandschaft und auf dem Buchmarkt und versucht, Lücken in der aktuellen Literaturförderung schliessen zu helfen.",
      ),
      spacer("intro-s2"),
      {
        id: "intro-3",
        type: "paragraph",
        content: [
          { text: "2021 lancierte Alit die Initiative " },
          {
            text: "«Zukunft Literatur Schweiz 1945–2045 | 100 Jahre neuere Schweizer Literaturen».",
            marks: [{ type: "bold" }],
          },
        ],
      },
      spacer("intro-s3"),
      p("intro-4", "Im Rahmen dieser Initiative führte der Verein drei neue Programme ein:"),
      spacer("intro-s4"),
      p(
        "intro-5",
        "Erstens das Programm «Sichtbarmachung», in dem zusammen mit Autor:innen neue Fördermöglichkeiten erarbeitet werden, um die Sichtbarkeit heute entstehender Texte zu erhöhen.",
      ),
      spacer("intro-s5"),
      p(
        "intro-6",
        "Zweitens das Programm «Kulturelles Gedächtnis», das Texte von herausragender ästhetischer Qualität, die nach 1945 entstanden sind, lieferbar erhalten und zeigen will, dass sie auch wichtige Quellen sind für das Verständnis von Entwicklungen in den Bereichen Kultur, Gesellschaft und Politik.",
      ),
      spacer("intro-s6"),
      p(
        "intro-7",
        "Und drittens das Programm «Vermittlung», das Projekte unterstützt, die die Vernetzung und den Austausch zwischen Literaturen der Schweiz und internationalen Literaturentwicklungen deutlich machen und einer breiteren Öffentlichkeit vermitteln.",
      ),
      spacer("intro-s7"),
      p(
        "intro-8",
        "Alit wirkt in Ergänzung zu Schweizer Institutionen mit verwandtem Zweck. Der Verein kann also bestehende Fördergefässe ergänzen. Er versteht sich als Partner von Literaturveranstaltern, Verlagen, Universitäten, Schulen und Archiven. Alit möchte die Initiative «Zukunft Literatur Schweiz 1945–2045 | 100 Jahre neuere Schweizer Literaturen» langfristig aufbauen und strebt Nachhaltigkeit an.",
      ),
    ],
  },

  {
    title: "Projektpartner",
    content: [
      p("partner-intro", "Projekte von Alit wurden bisher gefördert durch:"),
      p(
        "partner-list",
        [
          "Ernst Göhner Stiftung",
          "Pro Helvetia",
          "Landis&Gyr Stiftung",
          "Migros Kulturprozent",
          "Aargauer Kuratorium",
          "Charlotte Kerr Dürrenmatt-Stiftung",
          "Christoph Merian Stiftung",
          "Kanton Basel-Stadt",
          "Stadt Zürich Kultur",
          "Kanton Zürich",
          "FUKA-Fonds Luzern",
          "Regionalkonferenz Kultur RKK Luzern",
          "Däster Schild Stiftung",
          "Stadt Solothurn",
          "Kanton Solothurn",
          "Pro Scientia et Arte",
          "Bundesamt für Kultur BAK",
          "Autorinnen und Autoren der Schweiz A*dS",
          "Zürcher Kantonalbank",
        ].join("\n"),
      ),
    ],
  },

  {
    title: "Vorstand",
    content: [
      p(
        "vorstand-list",
        [
          "Guy Krneta, Co-Präsident",
          "Anja Schmitter, Co-Präsidentin",
          "Donat Blum",
          "Rudolf Bussmann",
          "Beat Mazenauer",
          "Dragica Rajčić Holzner",
        ].join("\n"),
      ),
    ],
  },

  {
    title: "Ehemalige Vorstandsmitglieder",
    content: [
      p(
        "ehemalige-list",
        [
          "Ruth Schweikert",
          "Liliane Studer",
          "Susanne Schenzle",
          "Alexander Estis",
          "Bettina Wohlfender",
          "Vera Schindler-Wunderlich",
        ].join("\n"),
      ),
    ],
  },

  {
    title: "Geschäftsstelle",
    content: [
      {
        id: "geschaeft-p",
        type: "paragraph",
        content: [
          {
            text: ["Alit – Netzwerk für Literatur", "c/o Museumsgesellschaft", "Limmatquai 62", "Postfach", "8024 Zürich", ""].join("\n"),
          },
          {
            text: "info@alit.ch",
            marks: [{ type: "link", href: "mailto:info@alit.ch" }],
          },
        ],
      },
    ],
  },

  {
    title: "Kontoverbindung",
    content: [
      p(
        "konto-p",
        ["ZKB Zürich", "Alit", "IBAN CH56 0070 0114 8071 6867 1"].join("\n"),
      ),
    ],
  },

  {
    title: "Logo",
    content: [
      {
        id: "logo-p",
        type: "paragraph",
        content: [
          { text: "Laden Sie hier das Logo von Alit für Druck und Web herunter: " },
          {
            text: "Wortmarke herunterladen.",
            marks: [{ type: "link", href: "/Alit-Logo-GZD-191030_Presse.zip", download: true }],
          },
        ],
      },
    ],
  },

  {
    title: "Impressum",
    content: [
      p("impressum-1", "Redaktion und Inhalt Website: © Alit"),
      p("impressum-2", "Redaktion und Inhalt Journal: © bei den Autor*innen"),
      p("impressum-3", "Gestaltung und Realisation: Affolter/Savolainen"),
      // Datenschutz link with small top-gap. Phase 3 will replace the href="#"
      // with the uploaded PDF URL (driven by site_settings).
      { id: "impressum-spacer", type: "spacer", size: "s" },
      {
        id: "impressum-datenschutz",
        type: "paragraph",
        content: [{ text: "Datenschutz", marks: [{ type: "link", href: "#" }] }],
      },
    ],
  },
];

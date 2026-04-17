import type { JournalContent } from "@/lib/journal-types";

// Seed-input shape — matches the rows that `src/lib/seed.ts` inserts on
// a fresh DB. `slug` becomes both the legacy `slug` column and `slug_de`
// (dual-write); slug_fr is always NULL on seed.
export type ProjektSeed = {
  slug: string;
  titel: string;
  kategorie: string;
  paragraphs: string[];
  content?: JournalContent;
  externalUrl?: string;
  archived?: boolean;
};

// Reader-output shape — returned by `getProjekte(locale)`.
// `slug_de` is the immutable internal identifier (also used as the stable
// key for hashtag references in agenda_items/journal_entries).
// `slug_fr` is the optional locale-specific URL alias.
// `urlSlug` is derived per render: slug_fr ?? slug_de for FR, slug_de for DE.
// Content kommt ausschließlich aus content_i18n (kein paragraphs-Fallback mehr).
export type Projekt = {
  slug_de: string;
  slug_fr: string | null;
  urlSlug: string;
  titel: string;
  kategorie: string;
  content?: JournalContent;
  externalUrl?: string;
  archived?: boolean;
  /** Per-field fallback flags — true when the requested locale had no entry
   *  and we rendered the DE value. Scoped per field so screen-readers only
   *  get lang="de" on the fields that are actually German, not the whole card. */
  titleIsFallback?: boolean;
  kategorieIsFallback?: boolean;
  contentIsFallback?: boolean;
};

// Slugs match the live page on alit.ch so URLs stay portable.
// Inhalte sind Kurzfassungen — vom Live-Stand übernommen, von Hand gepflegt.
export const projekte: ProjektSeed[] = [
  {
    slug: "essais-agites",
    titel: "essais agités",
    kategorie: "Publikationsreihe",
    paragraphs: [
      "essais agités. Edition zu Fragen der Zeit ist eine Reihe, die den kritischen Essay pflegt. Sie führt aktuelle Diskurse zusammen, erschliesst verborgene Themenfelder und versteht sich als Raum für ein bewegliches Nachdenken über Fragen der Zeit.",
      "Kern des Projekts ist eine eigens entwickelte Schreibsoftware, die Texte automatisiert in Buchform umsetzt und damit schnelle, flexible Publikationen in verschiedenen Formaten ermöglicht. Die Bände erscheinen sowohl als Taschenbücher im Verlag Der Gesunde Menschenversand als auch als Chapbooks on demand. Bislang sind sechzehn Bände veröffentlicht — von Analysen zu «Fake News» bis zu experimentellen Formaten.",
      "Die Reihe wird redaktionell betreut von Gina Bucher, Johanna Lier und Beat Mazenauer.",
    ],
    externalUrl: "https://essaisagites.ch",
  },
  {
    slug: "weltenliteratur",
    titel: "Weltenliteratur",
    kategorie: "Veranstaltungsreihe",
    paragraphs: [
      "Weltenliteratur — Made in Switzerland präsentiert Literatur von Autorinnen und Autoren, die in der Schweiz leben, aber keine Landessprache als Muttersprache sprechen und schreiben. Diese Werke werden oft übersehen und haben es schwer, einen Verlag zu finden.",
      "Eingeladene Autor:innen treten in Gesprächen mit Übersetzer:innen und Verlagen auf und machen ihre Texte und Themen einem Publikum zugänglich. Lesungen und Diskussionen finden u. a. im Literaturhaus Gottlieben statt; eine virtuelle literarische Zeitschrift dokumentiert Originalarbeiten und Entstehungsprozesse.",
      "Projektleitung: Annette Hug. Beteiligt sind u. a. Halyna Petrosanyak, Jens Nielsen, Parwana Amiri, Johanna Lier und Elisabeth Wandeler-Deck.",
    ],
  },
  {
    slug: "unsere-schweiz",
    titel: "Unsere Schweiz",
    kategorie: "Anthologie",
    paragraphs: [
      "Unsere Schweiz — Heimatbuch für Weltoffene hinterfragt das traditionelle Bild der Schweiz als Alpenidyll und stellt es einem differenzierten Portrait gegenüber: einer urbanen, lebendigen, weltoffenen Schweiz, geprägt von Mehrsprachigkeit, Vielfalt und Migrationsgeschichte.",
      "50 Schweizer Autorinnen und Autoren aus Kultur und Politik reflektieren ihre eigenen Erfahrungen und kontrastieren sie mit idealisierten Darstellungen. Das Resultat ist ein facettenreiches Buch, das Heimat als Ort des Aufbruchs ebenso wie der Rückkehr beschreibt.",
      "Alit übernimmt die Honorare der beteiligten Schriftsteller:innen.",
      "Erschienen am 13. November 2019 im Zytglogge Verlag, Bern. ISBN 978-3-7296-5029-9.",
    ],
    externalUrl: "https://www.zytglogge.ch/9783729650299/unsere-schweiz",
    archived: true,
  },
  {
    slug: "dunkelkammern",
    titel: "Dunkelkammern",
    kategorie: "Anthologie",
    paragraphs: [
      "Dunkelkammern — Geschichten vom Entstehen und Verschwinden ist eine Anthologie über den literarischen Stoff: darüber, wie Material sich zeigt oder verbirgt, wie Ideen entstehen und oft mit Vorgängen des Verschwindens im realen Leben einhergehen.",
      "Die Herausgeber Reto Sorg und Michel Mettler betonen, dass Stoffe «ausserhalb von Büchern in wenig linearen Entwicklungen» entstehen — in den Ankleideräumen, Maulwurfsbauten und Dunkelkammern der Imagination. Das fertige Buch verbirgt diese Prozesse: Gespräche, Träume, Lektüren, Reisen, Revisionen.",
      "Die siebzehn Originalbeiträge zeigen unterschiedliche Konzeptionen, wie aus Stoffen Werke werden — von Obsessionen und Bildern, die schwer fassbar bleiben, bis sie Form annehmen. Mit Beiträgen von Lukas Bärfuss, Michael Fehr, Christian Haller, Heinz Helle, Katarina Holländer, Hanna Johansen, Tom Kummer, Joël László, Gianna Molinari, Adolf Muschg, Melinda Nadj Abonji, Michail Schischkin, Monique Schwitter, Stefanie Sourlier, Raphael Urweider, Peter Weber und Dieter Zwicky.",
      "Erschienen 2020 im Suhrkamp Verlag, Berlin. ISBN 978-3-518-47072-5.",
    ],
    externalUrl: "https://www.suhrkamp.de/buecher/dunkelkammern-_47072.html",
    archived: true,
  },
  {
    slug: "auctor",
    titel: "AUCTOR",
    kategorie: "Plattform",
    paragraphs: [
      "[Inhalt nachzutragen — die Live-Seite alit.ch/projekte/auctor/ liefert aktuell 404. Bitte Originaltext bereitstellen oder das Projekt aus der Liste entfernen.]",
    ],
    archived: true,
  },
  {
    slug: "poetische-schweiz",
    titel: "Poetische Schweiz",
    kategorie: "Lyrikprojekt",
    paragraphs: [
      "Poetische Schweiz lädt zu Gesprächen über Gedichte ein und macht zeitgenössische Lyrik einem interessierten Publikum zugänglich. Konzipiert wurde das Projekt von Rudolf Bussmann, Dragica Rajčić Holzner, Eva Seck, Anja Nora Schulthess und Marina Skalova; die Projektleitung teilen sich Bussmann und Rajčić Holzner.",
      "Das Projekt umfasst drei Veranstaltungsformate: LyrikTisch (LYT) — ein monatliches Treffen von Lyriker:innen zum Austausch über neue Gedichte und Fragen rund um Schreiben und Veröffentlichung, in der Buchhandlung Paranoia City Zürich, mit weiteren Tischen geplant in Bern, Basel, Biel, Luzern und Genf. Poetischer Diwan — eine öffentliche Lesereihe, in der Schweizer Lyrik auf Weltliteratur trifft. LyrikTalk — drei Lyriker:innen wählen Gedichte der jeweils anderen aus und stellen sie vor.",
      "Beteiligt waren u. a. Sabine Abt, Esther Ackermann, Sarah Altenaichinger, Renata Burckhardt, Franziska Greising, Svenja Hermann, Melanie Katz, Johanna Lier, Ruth Loosli, Asiye Müjgan Güvenli, Anja Nora Schulthess, Ariane Sarbacher, Vera Schindler-Wunderlich, Nathalie Schmid, Walther Schüpbach und Elisabeth Wandeler-Deck.",
    ],
    externalUrl: "https://paranoiacity.ch",
  },
  {
    slug: "zuercher-literaturwerkstatt",
    titel: "Zürcher Literaturwerkstatt",
    kategorie: "Öffentliche Werkstattgespräche",
    paragraphs: [
      "Die Zürcher Literaturwerkstatt bietet Schreibenden einen Austauschort mit Kolleg:innen und fördert die Vernetzung innerhalb der Literaturszene. Sie ermöglicht Leser:innen Einblicke in literarische Produktionsprozesse, indem sie die Arbeit von Autor:innen an entstehenden Texten nachvollziehen können.",
      "Das Format dient zugleich angehenden Autor:innen, um auf niederschwellige Weise verschiedene Akteur:innen der Literaturszene kennenzulernen, und bringt unterschiedliche Gruppen von Literaturinteressierten für kreative Prozesse und Diskussionen zusammen.",
      "Die Werkstatt entsteht in Zusammenarbeit mit dem Literaturhaus Zürich, dem Literaturmuseum Strauhof, dem Jungen Literatur Labor Zürich (JULL) und seiner Fantasy-Schreibgruppe Extramundana, Zürich liest, dem Verband Autor*innen der Schweiz (A*dS) sowie den Alit-Projekten LyrikTisch und LyrikTalk.",
      "Projektleitung: Simon Froehling und Donat Blum.",
    ],
  },
];

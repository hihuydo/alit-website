import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";
import { AgendaItem } from "@/components/AgendaItem";

interface AgendaItemData {
  datum: string;
  zeit: string;
  ort: string;
  ortUrl: string;
  titel: string;
  beschrieb: string[];
}

const agendaItems: AgendaItemData[] = [
  {
    datum: "15.03.2025",
    zeit: "15:00 Uhr",
    ort: "Literaturhaus Zürich",
    ortUrl: "https://literaturhaus.ch/programm/",
    titel: "Zürcher Literaturwerkstatt – mit Stauffer, Rüegger, Bachmann, Gilles, Pichler",
    beschrieb: [
      "Zürcher Literaturwerkstatt mit Michael Stauffer, Julia Rüegger sowie den JULL-Extramundana- Autor*innen Stefan Bachmann, Chris Gilles und Lara Pichler",
      "Seit 2007 diskutieren Schreibende und Lesende im Rahmen der Zürcher Literaturwerkstatt (ehemals «Teppich») in Arbeit befindliche Texte, regelmässig auch im Literaturhaus.",
      "Zu Gast ist dieses Mal Michael Stauffer – er macht Prosa in allen Formen, ist Autor, Regisseur und Produzent von Hörspielen. Seit 2022 gibt es die JULL-Schreibgruppe Extramundana. Gegen 50 junge Fantasy-Schreibende aus der Deutschschweiz und Romandie haben bisher von Extramundana- Mentoraten profitiert und sind an Festivals oder Gruppenlesungen aufgetreten. Zwei von ihnen – Chris Gilles und Lara Pichler – bringen ihre Fantasy-Welten nun an die Zürcher Literaturwerkstatt, begleitet von ihrem Schreibcoach, dem Fantasy-Autor Stefan Bachmann.",
      "Datum: Samstag, 15.3.2025, 15.00 Uhr, mit anschliessendem Apéro.",
      "Ort: Literaturhaus Zürich, Debattierzimmer, 3. Stock, Limmatquai 62, 8001 Zürich.",
      "Eintritt frei, Anmeldung unter info@literaturhaus.ch.",
      "In Kooperation mit Alit – Netzwerk für Literatur und unterstützt durch Pro Litteris sowie Stadt und Kanton Zürich.",
    ],
  },
  {
    datum: "18.03.2025",
    zeit: "19:00 Uhr",
    ort: "Philosophicum, Basel",
    ortUrl: "https://www.philosophicum.ch/programm/2025/veranstaltungen/lyriktalk/",
    titel: "LyrikTalk im Philosophicum Basel",
    beschrieb: [
      "Daniel Henseler (Bern), Christine Langer (Ulm) und Walter Schüpbach (Adligenswil und Luzern) sprechen über ihre Gedichte. Moderation: Vera Schindler-Wunderlich (Allschwil)",
      "Wie liest man eigentlich zeitgenössische Gedichte? Könnten sich bei näherem Hinsehen mehr Welten öffnen als erwartet? Auch in diesem Jahr sprechen bei uns drei Lyrikschaffende über dieses Thema. Sie wählen dazu je ein Gedicht der beiden anderen aus, das sie überrascht hat, fasziniert, provoziert und berichten von ihrer persönlichen Leseerfahrung. Das Publikum ist eingeladen zum Mitlesen (Handout), Mitdenken, Mitsprechen.",
      "Termin: Dienstag, 18.3.2025, 19.00 Uhr",
      "Ort: Philosophicum, St. Johanns-Vorstadt 19/21, 4056 Basel",
      "Eintritt: CHF 15.– / 12.– (AHV/IV/Studierende/KulturLegi)",
    ],
  },
  {
    datum: "17.05.2025",
    zeit: "14:15 Uhr",
    ort: "Literaturmuseum Strauhof",
    ortUrl: "https://strauhof.ch/veranstaltungen/ausblick/",
    titel: "Zürcher Literaturwerkstatt – Queer-Feminismus Special mit Virginia Woolf, Lisa Rothen, Seda Keskinkılıç, Anaïs Meier, Ulrike Ulrich, Liliane Studer, Monique Schwitter, Elisabeth Wandeler-Deck, Donat Blum und Rémi Jaccard",
    beschrieb: [
      "Mit in Arbeit befindlichen Text von Lisa Rothen und Seda Keskinkılıç. Im Gespräch mit Anaïs Meier, Ulrike Ulrich, Liliane Studer, Monique Schwitter und Elisabeth Wandeler-Deck. Sowie einer Führung durch die Ausstellung von Rémi Jaccard",
      "14.15 Uhr: Führung",
      "15 – 17.30 Uhr: Literaturwerkstatt",
      "Eintritt frei",
    ],
  },
];

export default async function AgendaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.agenda} dict={dict} />
      <div className="flex-1 overflow-y-auto hide-scrollbar text-black" style={{ fontSize: "var(--text-body)", lineHeight: "normal" }}>
        {agendaItems.map((item, i) => (
          <AgendaItem key={i} item={item} />
        ))}
      </div>
    </>
  );
}

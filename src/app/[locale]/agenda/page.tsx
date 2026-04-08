"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";

interface AgendaItem {
  datum: string;
  zeit: string;
  ort: string;
  ortUrl: string;
  titel: string;
  beschrieb: string[];
}

const agendaItems: AgendaItem[] = [
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

// SVG icons
const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" className="inline-block w-[14px] h-[14px] align-[-1px] mr-[3px]" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
  </svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" className="inline-block w-[14px] h-[14px] align-[-1px] mr-[3px]" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" className="inline-block w-[14px] h-[14px] align-[-1px] mr-[3px]" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

function AgendaItemComponent({ item }: { item: AgendaItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`grid grid-cols-2 border-b-3 border-black hover:bg-white transition-all duration-200`}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-agenda-meta)", color: "#000", padding: "var(--spacing-half) 0 0 var(--spacing-base)" }}>
        <CalendarIcon /> {item.datum} &nbsp; <ClockIcon /> {item.zeit}
      </span>
      <span className="text-right" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-agenda-meta)", color: "#000", padding: "var(--spacing-half) var(--spacing-base) 0 0" }}>
        <GlobeIcon />
        <a href={item.ortUrl} target="_blank" rel="noopener noreferrer" className="text-black no-underline border-b-2 border-dotted border-black hover:!not-italic">{item.ort}</a>
      </span>
      <h2
        className="col-span-full font-normal m-0 cursor-pointer"
        style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-title)", lineHeight: "normal", padding: "0 var(--spacing-base) var(--spacing-base)" }}
        onClick={() => setExpanded(!expanded)}
      >
        {item.titel}
      </h2>
      <div className={`col-span-full overflow-hidden transition-accordion ${expanded ? "max-h-[1200px]" : "max-h-0"}`} style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-body)", lineHeight: "normal" }}>
        {item.beschrieb.map((text, i) => (
          <p key={i} className="m-0" style={{ padding: `0 var(--spacing-base) var(--spacing-base)` }}>{text}</p>
        ))}
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const params = useParams();
  const locale = params.locale as string;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.agenda} dict={dict} />
      <div className="flex-1 overflow-y-auto hide-scrollbar text-black" style={{ fontSize: "var(--text-body)", lineHeight: "normal" }}>
        {agendaItems.map((item, i) => (
          <AgendaItemComponent key={i} item={item} />
        ))}
      </div>
    </>
  );
}

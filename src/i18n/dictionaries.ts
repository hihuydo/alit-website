import type { Locale } from "./config";

const dictionaries = {
  de: {
    nav: {
      agenda: "Agenda",
      projekte: "Projekte",
      alit: "Über Alit",
      mitgliedschaft: "Mitgliedschaft",
      newsletter: "Newsletter",
    },
    leiste: {
      verein: "Agenda",
      vereinSub: "",
      literatur: "Discours Agités",
      literaturSub: "",
      stiftung: "Netzwerk für Literatur*en",
      stiftungSub: "",
    },
    stiftung: {
      text: "Das Ziel von alit – Verein Literaturstiftung besteht darin, eine Literaturstiftung Schweiz zu gründen, die – losgelöst vom Verein – einzelne Projekte rund um das literarische Schaffen trägt und prägt.",
    },
    journal: {
      info: "Unser virtuelles Journal enthält Texte, die – oft noch unfertig – zu Diskussionen anregen möchten und Reaktionen hervorrufen. Literarische Texte sind ebenso erwünscht wie das Fabulieren ins Offene. Das Journal will weiter dokumentieren, wie Texte, Geschichten entstehen, welche Gedanken einer Idee folgen, wie Autorinnen und Autoren ein einzelnes Thema fokussieren und von verschiedenen Seiten beleuchten und wie Autorinnen und Autoren schreibend aufeinander Bezug nehmen.",
    },
  },
  fr: {
    nav: {
      agenda: "Agenda",
      projekte: "Projets",
      alit: "À propos",
      mitgliedschaft: "Adhésion",
      newsletter: "Newsletter",
    },
    leiste: {
      verein: "Agenda",
      vereinSub: "",
      literatur: "Discours Agités",
      literaturSub: "",
      stiftung: "Netzwerk für Literatur*en",
      stiftungSub: "",
    },
    stiftung: {
      text: "L'objectif d'alit – Association pour une fondation littéraire est de créer une fondation littéraire suisse qui, indépendamment de l'association, porte et façonne des projets autour de la création littéraire.",
    },
    journal: {
      info: "Notre journal virtuel contient des textes qui – souvent encore inachevés – souhaitent susciter des discussions et provoquer des réactions.",
    },
  },
} as const;

export type Dictionary = (typeof dictionaries)[Locale];

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}

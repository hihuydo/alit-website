import type { Locale } from "./config";
import { DEFAULT_LEISTE_LABELS_DE, DEFAULT_LEISTE_LABELS_FR } from "@/lib/leiste-labels-shared";

const dictionaries = {
  de: {
    nav: {
      agenda: "Agenda",
      projekte: "Projekte",
      alit: "Über Alit",
      mitgliedschaft: "Mitgliedschaft",
      newsletter: "Newsletter",
    },
    leiste: DEFAULT_LEISTE_LABELS_DE,
    stiftung: {
      text: "Das Ziel von alit – Verein Literaturstiftung besteht darin, eine Literaturstiftung Schweiz zu gründen, die – losgelöst vom Verein – einzelne Projekte rund um das literarische Schaffen trägt und prägt.",
    },
    journal: {
      info: "Unser virtuelles Journal enthält Texte, die – oft noch unfertig – zu Diskussionen anregen möchten und Reaktionen hervorrufen. Literarische Texte sind ebenso erwünscht wie das Fabulieren ins Offene. Das Journal will weiter dokumentieren, wie Texte, Geschichten entstehen, welche Gedanken einer Idee folgen, wie Autorinnen und Autoren ein einzelnes Thema fokussieren und von verschiedenen Seiten beleuchten und wie Autorinnen und Autoren schreibend aufeinander Bezug nehmen.",
    },
    newsletter: {
      heading: "Bleibe auf dem Laufenden",
      intro: "In unserem Newsletter teilen wir in unregelmässigen Abständen Neuigkeiten aus und mit unserem Netzwerk für Literatur. In diesem Jahr wird der Newsletter zudem von der diskursiven Essay-Reihe «Discours Agités» bespielt.",
      vorname: "Vorname",
      nachname: "Nachname",
      woher: "Woher",
      email: "E-Mail",
      consent: "Ich bestätige, dass ich auf folgendem Kanal über E-Mail kontaktiert werden darf",
      privacy: "Du kannst dich jederzeit abmelden, indem du auf den Link in der Fußzeile unserer E-Mails klickst. Informationen zu unseren Datenschutzpraktiken findest du auf unserer Website.",
      submit: "Anmelden",
      submitting: "Wird gesendet…",
      missing: "Bitte alle Felder ausfüllen.",
      successTitle: "Danke!",
      successBody: "Du erhältst unseren Newsletter ab sofort.",
      errorGeneric: "Etwas ist schiefgelaufen. Bitte später erneut versuchen.",
      errorRate: "Zu viele Versuche. Bitte später erneut.",
    },
    mitgliedschaft: {
      heading: "Mitglied werden",
      intro: "Herzlich willkommen bei alit – Netzwerk für Literatur! Sie werden als neues Mitglied des Vereins registriert, sobald Sie den jährlichen Beitrag von CHF 50.– bezahlt haben.",
      vorname: "Vorname",
      nachname: "Nachname",
      strasse: "Strasse",
      nr: "Nr.",
      plz: "PLZ",
      stadt: "Stadt",
      email: "E-Mail",
      consent: "Ich bestätige hiermit meine Anmeldung",
      newsletterOptIn: "Ich melde mich für den viermal jährlich erscheinenden Newsletter an.",
      submit: "Anmelden",
      submitting: "Wird gesendet…",
      missing: "Bitte alle Felder ausfüllen.",
      successTitle: "Danke für Ihre Anmeldung!",
      successBody: "Wir melden uns mit den Details zur Zahlung.",
      errorGeneric: "Etwas ist schiefgelaufen. Bitte später erneut versuchen.",
      errorRate: "Zu viele Versuche. Bitte später erneut.",
      errorDuplicate: "Diese E-Mail ist bereits registriert. Bitte melden Sie sich bei uns, falls Sie Ihre Daten ändern möchten.",
    },
    agenda: {
      supporters: {
        label: "Mit freundlicher Unterstützung von",
        supporterSlideLabel: "Supporter-Folie",
      },
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
    leiste: DEFAULT_LEISTE_LABELS_FR,
    stiftung: {
      text: "L'objectif d'alit – Association pour une fondation littéraire est de créer une fondation littéraire suisse qui, indépendamment de l'association, porte et façonne des projets autour de la création littéraire.",
    },
    journal: {
      info: "Notre journal virtuel contient des textes qui – souvent encore inachevés – souhaitent susciter des discussions et provoquer des réactions.",
    },
    newsletter: {
      heading: "Restez informé·e",
      intro: "Dans notre newsletter, nous partageons à intervalles irréguliers des nouvelles de notre réseau pour la littérature. Cette année, la newsletter accompagne également la série d'essais «Discours Agités».",
      vorname: "Prénom",
      nachname: "Nom",
      woher: "D'où",
      email: "E-mail",
      consent: "Je confirme accepter d'être contacté·e par e-mail",
      privacy: "Vous pouvez vous désabonner à tout moment en cliquant sur le lien dans le pied de page de nos e-mails. Vous trouverez des informations sur nos pratiques de protection des données sur notre site.",
      submit: "S'inscrire",
      submitting: "Envoi en cours…",
      missing: "Merci de remplir tous les champs.",
      successTitle: "Merci !",
      successBody: "Vous recevrez désormais notre newsletter.",
      errorGeneric: "Une erreur est survenue. Veuillez réessayer plus tard.",
      errorRate: "Trop de tentatives. Veuillez réessayer plus tard.",
    },
    mitgliedschaft: {
      heading: "Devenir membre",
      intro: "Bienvenue à alit – Réseau pour la littérature ! Vous serez enregistré·e comme nouveau·elle membre de l'association dès que vous aurez payé la cotisation annuelle de CHF 50.–.",
      vorname: "Prénom",
      nachname: "Nom",
      strasse: "Rue",
      nr: "Nº",
      plz: "NPA",
      stadt: "Ville",
      email: "E-mail",
      consent: "Je confirme mon adhésion",
      newsletterOptIn: "Je m'inscris à la newsletter trimestrielle.",
      submit: "S'inscrire",
      submitting: "Envoi en cours…",
      missing: "Merci de remplir tous les champs.",
      successTitle: "Merci pour votre inscription !",
      successBody: "Nous vous contacterons avec les détails de paiement.",
      errorGeneric: "Une erreur est survenue. Veuillez réessayer plus tard.",
      errorRate: "Trop de tentatives. Veuillez réessayer plus tard.",
      errorDuplicate: "Cette adresse e-mail est déjà enregistrée. Contactez-nous pour modifier vos données.",
    },
    agenda: {
      supporters: {
        label: "Avec le soutien aimable de",
        supporterSlideLabel: "Slide soutiens",
      },
    },
  },
} as const;

export type Dictionary = (typeof dictionaries)[Locale];

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}

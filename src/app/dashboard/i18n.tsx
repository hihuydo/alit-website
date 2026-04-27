import type { ReactNode } from "react";

// Dashboard-UI strings.
//
// The dashboard is DE-only today. Centralising user-facing strings here
// makes future localization a matter of duplicating this file (e.g. to
// `de`/`fr` keys) and adding a locale-picker — the call sites don't
// change. Keep additions scoped to dashboard chrome (modals, tabs,
// shared buttons). Per-section copy stays in the section component
// unless it's reused across sections.
//
// Body-Strings mit Inline-Markup (<strong>, <em>) sind als ReactNode-
// returning Functions exportiert — XSS-safe by construction (React
// escaped dynamische Argumente automatisch), keine
// dangerouslySetInnerHTML-Komplexität im Caller.
export const dashboardStrings = {
  dirtyConfirm: {
    title: "Ungesicherte Änderungen verwerfen?",
    body: "Deine Änderungen am Editor gehen verloren.",
    stay: "Zurück",
    discard: "Verwerfen",
  },
  modal: {
    close: "Schließen",
  },
  deleteConfirm: {
    title: "Löschen bestätigen",
    body: (label: string): ReactNode => (
      <>Soll <strong>{label}</strong> wirklich gelöscht werden?</>
    ),
    cancel: "Abbrechen",
    confirm: "Löschen",
  },
  bulkDelete: {
    title: "Mehrere Einträge löschen",
    bodyMemberships: (count: number): ReactNode => (
      <>
        Sollen <strong>{count}</strong> Mitgliedschaften wirklich gelöscht werden? Diese
        Aktion kann nicht rückgängig gemacht werden.
      </>
    ),
    bodyNewsletter: (count: number): ReactNode => (
      <>
        Sollen <strong>{count}</strong> Newsletter-Anmeldungen wirklich gelöscht werden?
        Diese Aktion kann nicht rückgängig gemacht werden.
      </>
    ),
    cancel: "Abbrechen",
    confirm: "Löschen",
    confirming: "Lösche…",
  },
  paidUntoggle: {
    title: "Bezahlt-Status entfernen?",
    body: (name: string): ReactNode => (
      <>Bezahlt-Status für <strong>{name}</strong> entfernen?</>
    ),
    preserveHint: (
      <>
        Der Bezahlt-Zeitstempel bleibt erhalten und wird als <em>zuletzt bezahlt</em>{" "}
        geführt. Diese Aktion wird im Verlauf protokolliert.
      </>
    ),
    cancel: "Abbrechen",
    confirm: "Status entfernen",
    confirming: "Entferne…",
  },
  signups: {
    details: "Details",
    detailsExpand: "Details einblenden",
    detailsCollapse: "Details ausblenden",
    address: "Adresse",
    newsletterOptIn: "Newsletter",
    newsletterYes: "Ja",
    newsletterNo: "Nein",
    consentAt: "Zustimmung",
    source: "Quelle",
    sourceForm: "Formular",
    sourceMembership: "aus Mitgliedschaft",
    woher: "Woher",
    paid: "Bezahlt",
    historyLabel: "Verlauf",
    deleteLabel: "Löschen",
    regionLabel: "Auswahl-Aktionen",
    selectedCount: (n: number): string => `${n} ausgewählt`,
    exportCsv: "CSV exportieren",
    deleteSelected: "Ausgewählte löschen",
    deleting: "Lösche…",
  },
  mediaActions: {
    linkInternal: "Link intern",
    linkExternal: "Link extern",
    download: "Download",
    rename: "Umbenennen",
    delete: "Löschen",
    copied: "Kopiert",
    saving: "Speichert…",
    editing: "Wird bearbeitet…",
    menuLabel: "Medien-Aktionen",
  },
  // Sprint Agenda Bilder-Grid 2.0: Mode-Picker, Fit-Toggle, Slot-Editor.
  // Spec verlangte DE+FR — hier nur DE per existierender Dashboard-Convention
  // (DE-only). FR folgt mit globaler Dashboard-Localization.
  // {filled}/{total} Placeholders via .replace() am Call-Site substituiert
  // (Sonnet R2: kein function-call-type-mix).
  agenda: {
    imageMode: {
      label: "Bilder-Modus",
      single: "Einzelbild",
      cols2: "2 Spalten",
      cols3: "3 Spalten",
      cols4: "4 Spalten",
      cols5: "5 Spalten",
    },
    slot: {
      empty: "Bild hinzufügen",
      remove: "Bild entfernen",
    },
    addRow: {
      button: "+ neue Zeile",
    },
    warningLastRow: "Letzte Reihe enthält {filled} von {total} Bildern.",
    warningSingleMode: "Im Modus Einzelbild wird nur das erste Bild vollständig angezeigt.",
    uploadFailed: "Upload fehlgeschlagen — bitte erneut versuchen.",
  },
} as const;

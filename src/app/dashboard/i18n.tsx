import type { ReactNode } from "react";
import type { ErrorBannerKind } from "@/lib/layout-editor-types";

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
    crop: {
      openModal: "Bildausschnitt anpassen",
      modalTitle: "Bildausschnitt",
      xLabel: "Horizontal (%)",
      yLabel: "Vertikal (%)",
      dragHint: "Ziehen oder Pfeiltasten zum Verschieben",
      reset: "Zurücksetzen",
      save: "Übernehmen",
      cancel: "Abbrechen",
      frameLabel: "Sichtbarer Ausschnitt (2:3)",
      fitLabel: "Anzeige:",
      fitCover: "Füllen (Crop)",
      fitContain: "Ganz anzeigen",
      fitContainHint: 'Im Modus „Ganz anzeigen" wird das Bild komplett gezeigt — Position ist nicht relevant.',
    },
  },
  layoutEditor: {
    movePrev: "← Vorherige Slide",
    moveNext: "Nächste Slide →",
    splitHere: "Neue Slide ab hier",
    save: "Speichern",
    resetToAuto: "Auf Auto-Layout zurücksetzen",
    resetOrphan: "Verwaisten Override entfernen",
    retry: "Erneut versuchen",
    loading: "Lädt …",
    slideLabel: "Slide {n}",
    staleTitle: "Inhalt wurde verändert",
    staleBody:
      "Der Beitragstext wurde nach dem Speichern dieses Layouts geändert. Setze auf Auto-Layout zurück, um eine aktuelle Gruppierung zu bekommen.",
    orphanTitle: "Bild-Anzahl überschreitet verfügbare Bilder",
    orphanBody:
      "Dieser Beitrag hat aktuell {n} Bilder. Reduziere die Bild-Anzahl im Export-Modal oder entferne den verwaisten Override.",
    orphanEmptyEditor:
      "Keine Slides — bitte Bild-Anzahl reduzieren oder verwaisten Override entfernen.",
    tooManyBlocksTitle: "Layout zu lang für die Anzeige",
    // Manual: the stored override actually got tail-merged in route.ts —
    // saving persists this merge. (R6 [CONTRACT-FIX])
    tooManyBlocksBodyManual:
      "Das gespeicherte Layout enthielt mehr Slides als jetzt darstellbar — die letzten Slides wurden in die letzte sichtbare Slide zusammengeführt. Speichern setzt den zusammengeführten Stand als neuen Override.",
    // Auto/stale: route.ts slice()d the tail (no merge). Saving from this
    // view would PUT an incomplete block-list and 422 server-side, so
    // save is blocked. User must shorten content via the journal-editor.
    // (Codex R2 [P2])
    tooManyBlocksBodyAuto:
      "Der Beitragsinhalt überschreitet die maximale Slide-Anzahl. Der Renderer kürzt automatisch das Ende — speichern in dieser Ansicht ist nicht möglich, weil die ausgeblendeten Blöcke fehlen würden. Bitte den Beitragsinhalt im Editor kürzen.",
    // Errors — keys MUST 1:1 match ErrorBannerKind union (enforced by
    // `satisfies Record<ErrorBannerKind, string>` below).
    errors: {
      content_changed:
        "Der Beitragsinhalt hat sich geändert. Bitte das Modal schließen und neu öffnen.",
      layout_modified:
        "Das Layout wurde von einem anderen Admin geändert. Bitte zurücksetzen oder Modal neu laden.",
      too_many_slides:
        "Maximal 10 Text-Slides erlaubt. Bitte einige Slides zusammenfügen.",
      too_many_slides_for_grid:
        "Bei aktivem Bild-Grid maximal 9 Text-Slides erlaubt (Slide 1 ist das Bild-Grid).",
      empty_layout: "Mindestens eine Slide muss vorhanden sein.",
      incomplete_layout:
        "Nicht alle Inhalts-Blöcke sind im Layout enthalten. Bitte alle Blöcke einer Slide zuweisen.",
      unknown_block:
        "Layout enthält Block-IDs die nicht zum Beitragsinhalt passen.",
      duplicate_block: "Ein Block ist mehrfach im Layout enthalten.",
      generic: "Speichern fehlgeschlagen. Bitte nochmal versuchen.",
      network: "Netzwerkfehler. Bitte nochmal versuchen.",
      delete_failed: "Zurücksetzen fehlgeschlagen. Bitte nochmal versuchen.",
    } satisfies Record<ErrorBannerKind, string>,
  },
  exportModal: {
    tablistLabel: "Anzeige-Modus",
    tabPreview: "Vorschau",
    tabLayout: "Layout anpassen",
    tabLayoutDisabledLocaleBoth:
      "Layout-Anpassung ist pro Sprache. Bitte DE oder FR wählen.",
    imageCountDisabledLayoutMode:
      "Bild-Anzahl kann im Layout-Modus nicht geändert werden. Bitte zur Vorschau wechseln.",
    confirmDiscardTitle: "Ungesicherte Layout-Änderungen verwerfen?",
    confirmDiscardBodyTabSwitch:
      "Du wechselst den Tab — deine Layout-Änderungen würden verloren gehen.",
    confirmDiscardBodyModalClose:
      "Du schließt das Fenster — deine Layout-Änderungen würden verloren gehen.",
    confirmDiscardBodyLocaleChange:
      "Du wechselst die Sprache — die Layout-Änderungen für die aktuelle Sprache gehen verloren.",
    confirmCancel: "Abbrechen",
    confirmDiscard: "Verwerfen",
  },
  leiste: {
    tabLabel: "Beschriftung",
    heading: "Leisten-Beschriftung",
    intro: "Diese Texte erscheinen als Spalten-Überschriften auf der Website. Leer lassen für Standardwert.",
    defaultHint: "Standard: ",
    localeDeHeading: "Deutsch",
    localeFrHeading: "Französisch",
    fieldVerein: "Panel 1 — Heading",
    fieldLiteratur: "Panel 2 — Heading",
    fieldStiftung: "Panel 3 — Heading",
    save: "Speichern",
    saving: "Speichert…",
    reset: "Zurücksetzen",
    savedToast: "Gespeichert",
  },
} as const;

// Dashboard-UI strings.
//
// The dashboard is DE-only today. Centralising user-facing strings here
// makes future localization a matter of duplicating this file (e.g. to
// `de`/`fr` keys) and adding a locale-picker — the call sites don't
// change. Keep additions scoped to dashboard chrome (modals, tabs,
// shared buttons). Per-section copy stays in the section component
// unless it's reused across sections.
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
} as const;

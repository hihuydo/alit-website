// Shared cap between the POST /api/dashboard/signups/bulk-delete/ route
// and the client-side SignupsSection.tsx. Keeps request-size and
// audit-log volume predictable; beyond this batch, split client-side
// with a visible error so a single "Alle auswählen" on a huge list
// doesn't silently degrade to a generic 400.
export const SIGNUPS_BULK_DELETE_MAX = 500;

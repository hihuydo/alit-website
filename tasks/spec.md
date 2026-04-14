# Spec: Refactor & Simplify Sprint
<!-- Created: 2026-04-14 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Proposed -->

## Summary

Strukturelle Schwächen angehen, die in den letzten Reviews (PR #26, 4 Codex-Runden, Sonnet-Reviews) wiederholt aufgefallen sind — bevor auf dieser Basis weitergebaut wird. Fokus: Daten-Loss-Risiken eliminieren, Code-Duplikation reduzieren, Conventions etablieren gegen wiederkehrende Bug-Klassen.

## Context

PR #26 hat 4 Codex-Runden gebraucht (2× P1 Autosave, 1× P2 Media-Scan). Sonnet-Review listete 1× [Important] + 3× [Suggestion]. Wiederkehrende Muster in den Lessons (2026-04-14, 5 Einträge an einem Tag) zeigen: nicht Einzelbugs, sondern strukturelle Hot-Spots.

Begleitende Evidenz:
- `memory/lessons.md:137-145` — Media-Scan vergaß Agenda-Tabelle → fast Datenverlust
- `memory/lessons.md:117-120` — `CASE WHEN` vs `COALESCE` inkonsistent angewandt
- `memory/lessons.md:142-145` — Autosave-Draft-Logik brauchte 3 Fixes in 4 Tagen
- `tasks/review.md:11` — 3 Sections mit identischem `initial` + reload Pattern
- `memory/todo.md:12` — `isSafeUrl` dupliziert in 3 Files (nicht 2, wie im todo notiert)

## Requirements

### Must Have

1. **Media-Reference-Scan refactoren** (Daten-Loss-Risiko)
   - Registry-Pattern in `src/app/api/dashboard/media/route.ts`
   - `MEDIA_REF_SOURCES: { kind, table, extractRefs(row) }[]`
   - `getMediaUsage()` iteriert die Registry, kein manuelles per-Table SELECT mehr
   - Jede neue Entity mit Media-Refs fügt genau einen Registry-Eintrag hinzu oder vergisst es explizit

2. **Partial-Update-Helper für nullable Felder**
   - Shared Util `src/lib/partial-update.ts` — baut SET-Clause aus `{ field, sent, value }` Specs
   - Alle `*/[id]/route.ts` (agenda, journal, projekte) darauf migrieren
   - Eliminiert Mix aus `CASE WHEN $n::boolean` und `COALESCE($n, col)` im selben Endpoint
   - Contract: `undefined = preserve, null = clear, value = set`

3. **`isSafeUrl` konsolidieren**
   - Single source: `src/lib/url-safety.ts`
   - Alle 3 Callsites migrieren: `RichTextEditor.tsx`, `journal-html-converter.ts`, `journal-validation.ts`
   - Tests für gefährliche URLs (javascript:, data:text/html, vbscript:)

### Nice to Have

4. **Autosave-Hook**
   - `useAutosave<T>({ validate, omitIncomplete, onSave, delay })` in `src/app/dashboard/lib/use-autosave.ts`
   - `JournalEditor.tsx` + `AgendaSection.tsx` darauf migrieren
   - Klarer Contract: Draft-Invalidation führt zu `omit`, nicht zu `[]`/leerem Wert

5. **Section-Data-Hook**
   - `useSectionData(fetcher, initial)` kapselt das `initial`-prop + mount-reload Pattern
   - 3 Sections (Agenda, Journal, Projekte) migrieren
   - Alternative (Review-Empfehlung): `initial` droppen + Skeleton — entscheiden während Implementation

### Out of Scope

- Client/Server-Split als ESLint-Rule (zu viel Infra-Overhead für einmaliges Problem — als Convention in `patterns/nextjs.md` dokumentiert, reicht)
- Architektur-Änderungen (z.B. neue Folder-Struktur, State-Lib einführen)
- Test-Suite-Ausbau über die Must-Haves hinaus
- Performance-Optimierung der DB-Queries (Sonnet flagte `getProjekte()` auf allen Pages als [Important] — separater Sprint, braucht Produkt-Entscheidung ob `<ProjekteList>` conditional wird)

## Technical Approach

### Media-Registry (Must Have #1)

```ts
// src/lib/media-usage.ts
type MediaRefSource = {
  kind: "journal" | "agenda" | "projekte";
  label: string; // for UI used_in display
  query: string; // SELECT id, title, <ref-columns> FROM <table>
  extractRefs: (row: Record<string, unknown>) => string[]; // returns public_ids
};

export const MEDIA_REF_SOURCES: MediaRefSource[];
export async function getMediaUsage(publicId: string): Promise<UsageEntry[]>;
```

Neue Entity mit Media-Refs → genau einen Registry-Eintrag, fertig. Kein SELECT vergessen mehr.

### Partial-Update-Helper (Must Have #2)

```ts
// src/lib/partial-update.ts
type FieldUpdate<T> =
  | { kind: "skip" }         // field not in body → keep DB value
  | { kind: "set"; value: T }; // field sent (null = clear, value = set)

export function buildPartialUpdate(updates: Record<string, FieldUpdate<unknown>>): {
  setClause: string;
  values: unknown[];
};
```

Route handler:
```ts
const updates = {
  title: parseField(body, "title"),
  lead: parseField(body, "lead"),       // nullable
  hashtags: parseField(body, "hashtags"), // nullable array
};
const { setClause, values } = buildPartialUpdate(updates);
await pool.query(`UPDATE agenda_items SET ${setClause} WHERE id = $1`, [id, ...values]);
```

Kein Mix mehr aus CASE-WHEN und COALESCE im selben Endpoint.

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/media-usage.ts` | New | Registry + `getMediaUsage()` |
| `src/app/api/dashboard/media/route.ts` | Modify | Uses registry, removes hand-rolled SELECTs |
| `src/lib/partial-update.ts` | New | `buildPartialUpdate()` |
| `src/app/api/dashboard/agenda/[id]/route.ts` | Modify | Migrate to helper |
| `src/app/api/dashboard/journal/route.ts` | Modify | Migrate to helper |
| `src/app/api/dashboard/projekte/[id]/route.ts` | Modify | Migrate to helper |
| `src/lib/url-safety.ts` | New | Single `isSafeUrl` |
| `src/app/dashboard/components/RichTextEditor.tsx` | Modify | Import from `url-safety.ts` |
| `src/app/dashboard/components/journal-html-converter.ts` | Modify | Import from `url-safety.ts` |
| `src/lib/journal-validation.ts` | Modify | Import from `url-safety.ts` |
| `src/app/dashboard/lib/use-autosave.ts` | New (Nice-to-Have) | Shared autosave hook |
| `src/app/dashboard/components/JournalEditor.tsx` | Modify (Nice) | Migrate to hook |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify (Nice) | Migrate to hook |

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Media referenziert aus mehreren Entities | `used_in` Array enthält Einträge pro Entity, kein Dedup |
| Partial-Update mit `null` auf non-nullable column | Helper wirft früh, bevor SQL läuft |
| `isSafeUrl` bekommt relative URL (`/foo`) | `true` (kein Schema → safe) |
| Autosave während Section-Remount | Hook muss unmount-safe sein (cleanup pendender Timer) |

## Done Criteria

- [ ] `getMediaUsage()` deckt journal + agenda + projekte; Unit-Test für jede Entity
- [ ] Alle 3 `[id]/route.ts` nutzen `buildPartialUpdate`, kein direktes `COALESCE`/`CASE WHEN` mehr im Code
- [ ] `grep -r "function isSafeUrl"` findet nur 1 Treffer (in `url-safety.ts`)
- [ ] `pnpm build` clean, `pnpm lint` clean
- [ ] Sonnet pre-push Review ohne [Critical] oder [Important] auf den Refactor-Diff
- [ ] Manueller Smoke-Test: (1) Journal-Eintrag mit Bild → Bild im Medien-Tab als "used_in" sichtbar; (2) Agenda-lead auf leer setzen → DB-Wert NULL; (3) Agenda-PUT ohne `hashtags` Key → DB-Wert unverändert

## Risks

- **Partial-Update-Helper zu generisch**: Over-Engineering-Gefahr. Mitigation: MVP mit genau den 3 Use-Cases bauen, nicht jetzt schon Sort/Filter/JSON-merge einbauen.
- **Media-Registry-Migration bricht laufende UI**: Response-Shape muss bitgleich bleiben. Mitigation: MediaSection-Type unverändert lassen, Registry nur intern.
- **Autosave-Hook erwischt Edge-Case nicht**: Bereits 3 Fixes in 4 Tagen — Hook-Extraktion könnte subtile Fälle verschieben. Mitigation: als Nice-to-Have markieren, separat mergen, zuerst in AgendaSection (einfacher) dann JournalEditor.
- **Sprint wird zu groß**: Hard-cap auf Must-Have. Nice-to-Have nur angehen wenn Must-Have in <1 Tag durch ist.

## Exit-Strategie

Wenn während Implementation klar wird, dass ein Must-Have deutlich mehr Aufwand ist als gedacht: Sprint auf **nur #1 (Media-Registry) + #3 (isSafeUrl)** reduzieren. Beide sind isoliert und bringen direkten Nutzen. #2 (Partial-Update-Helper) hat höchstes Refactor-Risiko — kann eigenen Sprint bekommen.

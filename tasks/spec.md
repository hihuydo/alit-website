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
   - `MEDIA_REF_SOURCES: { kind, table, extractRefs(row) }[]` — aktuelle Quellen: `journal_entries` + `agenda_items`. `projekte` ist NICHT in Scope (hat keine Media-Refs, nur Text + external_url)
   - `getMediaUsage()` iteriert die Registry, kein manuelles per-Table SELECT mehr
   - Jede neue Entity mit Media-Refs fügt genau einen Registry-Eintrag hinzu oder vergisst es explizit

2. **Dynamic-SET-Pattern auf agenda + projekte angleichen**
   - Referenz-Pattern existiert bereits in `src/app/api/dashboard/journal/[id]/route.ts:67-81` (conditional `setClauses.push` + `values.push` pro gesendetem Feld)
   - `agenda/[id]/route.ts` aktuell: Mix aus `COALESCE` + `CASE WHEN $n::boolean` (dokumentiert in lessons.md 2026-04-14) → auf Journal-Pattern umbauen
   - `projekte/[id]/route.ts` aktuell: pures `COALESCE($n, col)` → kann nullable Felder nicht auf NULL setzen → auf Journal-Pattern umbauen
   - Kein neuer Abstraktions-Helper. Das Pattern ist ausgeschrieben einfach genug; ein generischer `buildPartialUpdate()` müsste Nullability-Metadaten mitführen und zieht Komplexität nur um
   - Contract (durch Pattern selbst garantiert): `undefined = skip clause, null = SET NULL, value = SET value`

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

### Dynamic SET clauses (Must Have #2) — Journal als Blueprint

Bereits in `journal/[id]/route.ts:67-81` implementiert:
```ts
const setClauses: string[] = [];
const values: unknown[] = [];
let paramIndex = 1;

if (date !== undefined) { setClauses.push(`date = $${paramIndex++}`); values.push(date); }
if (author !== undefined) { setClauses.push(`author = $${paramIndex++}`); values.push(author); }
// ... one line per field
if (setClauses.length === 0) return error("No fields to update");
setClauses.push("updated_at = NOW()");
values.push(numId);

await pool.query(`UPDATE journal_entries SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`, values);
```

Agenda + Projekte auf dasselbe Pattern umbauen. Kein Helper — das inline-Pattern ist kurz, lesbar, und jeder Contract (`undefined = skip`, `null = set null`) ist direkt in der Form sichtbar.

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/media-usage.ts` | New | Registry + `getMediaUsage()` (journal + agenda only) |
| `src/app/api/dashboard/media/route.ts` | Modify | Uses registry, removes hand-rolled SELECTs |
| `src/app/api/dashboard/agenda/[id]/route.ts` | Modify | Migrate `COALESCE` + `CASE WHEN` mix to journal-style dynamic SET |
| `src/app/api/dashboard/projekte/[id]/route.ts` | Modify | Migrate pure `COALESCE` to journal-style dynamic SET (enables explicit NULL clearing for nullable cols) |
| `src/app/api/dashboard/journal/[id]/route.ts` | **No change** | Reference implementation — already correct |
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

- [ ] `getMediaUsage()` deckt journal + agenda (projekte hat keine Media-Refs, bewusst nicht in Scope); Unit-Test für beide Entities
- [ ] `agenda/[id]/route.ts` + `projekte/[id]/route.ts` nutzen journal-style dynamic SET; kein `COALESCE`/`CASE WHEN` mehr in diesen beiden Files
- [ ] `grep -r "function isSafeUrl"` findet nur 1 Treffer (in `url-safety.ts`)
- [ ] `pnpm build` clean, `pnpm lint` clean
- [ ] Sonnet pre-push Review ohne [Critical] oder [Important] auf den Refactor-Diff
- [ ] Manueller Smoke-Test: (1) Journal-Eintrag mit Bild → Bild im Medien-Tab als "used_in" sichtbar; (2) Agenda-lead auf leer setzen → DB-Wert NULL; (3) Agenda-PUT ohne `hashtags` Key → DB-Wert unverändert

## Risks

- **Agenda-Migration bricht existierendes Behavior**: Der CASE-WHEN-mit-sent-flag-Trick in agenda für `lead` wurde bewusst eingeführt (lessons 2026-04-14). Bei Umstellung auf dynamic SET muss derselbe Contract (`null = clear, undefined = preserve`) exakt erhalten bleiben. Mitigation: API-Contract-Test vor und nach Migration: PUT mit `lead: null` → NULL, PUT ohne `lead` → unchanged.
- **Media-Registry-Migration bricht laufende UI**: Response-Shape muss bitgleich bleiben. Mitigation: MediaSection-Type unverändert lassen, Registry nur intern.
- **Autosave-Hook erwischt Edge-Case nicht**: Bereits 3 Fixes in 4 Tagen — Hook-Extraktion könnte subtile Fälle verschieben. Mitigation: als Nice-to-Have markieren, separat mergen, zuerst in AgendaSection (einfacher) dann JournalEditor.
- **Sprint wird zu groß**: Hard-cap auf Must-Have. Nice-to-Have nur angehen wenn Must-Have in <1 Tag durch ist.

## Exit-Strategie

Wenn während Implementation klar wird, dass ein Must-Have deutlich mehr Aufwand ist als gedacht: Sprint auf **nur #1 (Media-Registry) + #3 (isSafeUrl)** reduzieren. Beide sind isoliert und bringen direkten Nutzen. #2 (dynamic SET migration) hat höchstes Refactor-Risiko wegen agenda-Contract — kann eigenen Sprint bekommen.

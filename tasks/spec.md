# Spec: external_url Field komplett entfernen
<!-- Created: 2026-04-17 -->
<!-- Author: Planner (Claude Opus 4.7) -->
<!-- Status: v1 implemented — 7 Files geändert, DROP COLUMN idempotent in schema.ts, 165/165 Tests green, build clean. -->

## Summary

Kleiner Cleanup-Sprint: entfernt das `external_url`-Feld komplett aus App-Code + DB. Dead Feature — wird vom Admin pflegbar im Dashboard eingegeben, aber **nirgendwo auf der Website gerendert**. Redundant zu Inline-Links im Rich-Text-Editor (Content-Editor hat Link-Button, kann URLs kontextuell mit Text + pro Locale einbetten).

Scope-Rationale: unabhängig vom großen PR 2 (Legacy-Column-DROP) — dieses Feld ist keine i18n-Replacement-Legacy sondern ein ungenutztes Add-On. Eigene kleine PR.

## Context

- `external_url` existiert seit frühen Sprints als optionales Feld.
- Aktueller Stand Prod-DB: 4 Projekte haben URLs gesetzt (essais-agites, unsere-schweiz, dunkelkammern, poetische-schweiz).
- Grep ergibt null Render-Usage in `src/components/ProjekteList.tsx` oder Detail-Routes. `Projekt.externalUrl` wird vom Reader geladen, aber kein Konsument liest es.
- Rich-Text-Editor für Projekt-Content hat Link-Button (`JournalInlineMark` type: "link" mit href/title/external/download) → gleiche Funktionalität + mehr (Context-Text, mehrere Links, Locale-spezifisch).

## Requirements

### Must Have (Sprint Contract)

1. **`src/app/dashboard/components/ProjekteSection.tsx`**:
   - `external_url` aus `Projekt`-Interface raus
   - `external_url` aus `emptyForm` + Form-State raus
   - `openEdit()` mapping: `external_url`-Zeile raus
   - POST/PUT Submit-Payload: `external_url` aus beiden Aufrufen raus
   - Input-Field im Form-UI raus (`<input value={form.external_url} ...>` und sein Label)

2. **API Routes** `src/app/api/dashboard/projekte/route.ts` + `[id]/route.ts`:
   - POST: `external_url` aus body-Destructure, Validation (`validLength`), INSERT-Columns, VALUES raus
   - PUT: `external_url` aus body-Destructure, Validation, conditional SET-Clause raus

3. **Reader** `src/lib/queries.ts`:
   - `getProjekte()`: `external_url` aus SELECT-Liste + aus output object raus
   - `Projekt`-Type (`src/content/projekte.ts`): `externalUrl`-Feld raus

4. **Seed** `src/lib/seed.ts`:
   - INSERT-Statement: `external_url` aus column-list + values raus
   - **`src/content/projekte.ts`**: `externalUrl`-Einträge aus den 4 Projekt-Seeds raus. Aus `ProjektSeed`-Type raus.

5. **Schema** `src/lib/schema.ts`:
   - Initial-CREATE-TABLE: `external_url TEXT` Spalte raus (wenn nur in CREATE drin — ansonsten über ALTER hinzugefügt)
   - Neue DROP-COLUMN-Zeile: `ALTER TABLE projekte DROP COLUMN IF EXISTS external_url;`
   - Idempotent — auf Prod existiert Spalte, wird einmalig gedroppt. Auf frischer DB nie erst erstellt.

6. **Tests** — bestehende 165 grün. Kein neuer Test nötig (Dead-Feature-Removal, keine neue Logic).

7. **Build** — `pnpm build` grün.

### Nice to Have (Follow-up → memory/todo.md)

- Admin-Hinweis/Migration-Tool: die 4 Prod-URLs als Inline-Link ans Ende der jeweiligen Projekt-Beschreibung anhängen. Manuell im Dashboard (5 Minuten für 4 Rows).

### Out of Scope

- Inline-Link-Migration als SQL `jsonb_set`-Skript — zu invasiv für kleine PR, Risiken bei JSONB-Struktur-Mutation.
- Audit-Logging für den DROP COLUMN — Schema-DDL läuft ohnehin via `ensureSchema` in stdout-Logs.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/dashboard/components/ProjekteSection.tsx` | Modify | `external_url` aus Type, emptyForm, openEdit, 2× Submit, Input-UI raus |
| `src/app/api/dashboard/projekte/route.ts` | Modify | POST body + INSERT raus |
| `src/app/api/dashboard/projekte/[id]/route.ts` | Modify | PUT body + SET-Clause raus |
| `src/lib/queries.ts` | Modify | getProjekte SELECT + output raus |
| `src/content/projekte.ts` | Modify | `Projekt` type: externalUrl raus. `ProjektSeed` type: externalUrl raus. 4 Seed-Einträge: externalUrl-Zeile raus |
| `src/lib/seed.ts` | Modify | INSERT raus |
| `src/lib/schema.ts` | Modify | DROP COLUMN hinzufügen (idempotent, IF EXISTS). Initial CREATE-TABLE Zeile raus wenn da |

### Architecture Decisions

- **DROP COLUMN direkt in PR 1**: `external_url` ist Dead-Data ohne i18n-Replacement. Im Gegensatz zu den 16 Legacy-i18n-Columns braucht es hier keinen Soak-Zyklus — es gibt keine Rollback-Fallback-Semantik, weil das Feld nie gelesen wurde. Direkter DROP ist sicher.
- **URL-Migration als nicht-blockierender Manual-Step**: die 4 URLs in Prod sind kein Funktionsverlust (rendered nie). Falls Admin sie als Inline-Links sichtbar haben will, 5 Min Editor-Arbeit. Falls nicht, verschwinden sie aus dem Admin-UI still.
- **Seed-Source bereinigen**: auch die 4 URLs aus `src/content/projekte.ts` raus, weil `ProjektSeed` type das Feld nicht mehr hat. Git-History preserved alles.

### Dependencies

- Keine externen.
- Keine neuen Tests — Dead-Feature-Removal.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Fresh DB Boot | CREATE TABLE ohne external_url. DROP COLUMN IF EXISTS ist no-op. Seed schreibt ohne Field. |
| Prod DB Boot | CREATE TABLE existiert (legacy form mit external_url), DROP COLUMN entfernt ihn einmalig. Nächster Boot: IF EXISTS no-op. |
| Rolling-Deploy-Window: alte App sendet `external_url` an POST | PUT/POST ignorieren unbekannte Body-Felder (TypeScript Destructure greift nur bekannte Keys). Harmlos. |
| Admin mit stale-Dashboard-UI öffnet Projekt zum Edit | Dashboard-Response enthält kein external_url mehr. Input-Feld existiert nicht mehr in neuer UI. Harmlos. |
| Bestehende Projekte in Prod mit URLs | URLs gehen verloren (nur aus DB, git-history + seed-history haben sie noch). Akzeptabel — waren nie user-visible. |

## Risks

- **P3 — URL-Verlust bei bestehenden 4 Projekten**: Low-risk, weil URLs nie gerendert wurden (kein User-Impact). Git-history + dieses Spec-Dokument als Backup. Falls Admin sie zurück will: manuell via Editor einbetten.
- **P3 — Test-DB-Setup bricht**: Tests berühren `external_url` nicht. Kein Risiko.

## Verification (Smoke Test Plan)

Nach Staging-Deploy:
1. **S1 Dashboard-Projekt-Edit**: Projekt-Edit-Form zeigt kein URL-Input mehr.
2. **S2 DB-Schema**: `SSH + psql "\d projekte"` → keine `external_url`-Spalte.
3. **S3 Public-Routes**: `/de/projekte/essais-agites/` rendert (200, Content sichtbar).
4. **S4 Dashboard POST/PUT**: Neuer Projekt-Eintrag + Edit eines bestehenden — beides geht durch ohne Fehler.
5. **S5 Re-Boot Idempotent**: Container restart → keine Schema-Errors in stdout.

## Deploy & Verify

Nach Merge:
1. CI grün (`gh run watch`)
2. `https://alit.hihuydo.com/api/health/` → 200
3. Homepage + Project-Detail → 200
4. `docker compose logs --tail=30 alit-web` — keine neuen Errors
5. DB-Sanity: `SELECT column_name FROM information_schema.columns WHERE table_name='projekte'` — kein `external_url`

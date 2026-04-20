# Sprint: Agenda Datum + Uhrzeit vereinheitlichen
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-21 -->

## Done-Kriterien (Sprint Contract)

> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] **DK-1 (Canonical-Helper):** `src/lib/agenda-datetime.ts` exportiert 10 Funktionen (parse × 2, format × 2, iso-input-adapter × 2, isCanonical × 2, normalizeLegacy × 2). Edge-safe (keine Node-only imports). Unit-Tests verifizieren jeden Pfad inkl. aller aktuell in Prod gesehenen Legacy-Varianten (`"14:00Uhr"`, `"19.30"`, `"15:00 Uhr"`, `"19:00 Uhr"`).
- [ ] **DK-2 (API POST Format-Check):** `POST /api/dashboard/agenda/` mit `zeit: "14:00Uhr"` (ohne Space) → 400 `"Ungültiges Zeitformat, erwartet HH:MM Uhr"`. Mit `zeit: "14:00 Uhr"` → 201. Analog `datum: "15.3.25"` → 400, `"15.03.2025"` → 201.
- [ ] **DK-3 (API PUT Partial-Safe):** `PUT /api/dashboard/agenda/7/` mit Body `{title_i18n: {de: "x"}}` (ohne `datum`/`zeit`) → 200, kein Format-Check auf unveränderte Felder. Mit Body `{zeit: "invalid"}` → 400 ohne UPDATE.
- [ ] **DK-4 (Schema-Migration):** Nach Container-Restart auf Staging ist die Boot-Log-Line `[agenda-migration] normalized N rows` sichtbar. `SELECT zeit FROM agenda_items` zeigt für alle Prod-5-Rows canonical `HH:MM Uhr`-Format. Idempotent: Zweiter Restart normalisiert 0 Rows.
- [ ] **DK-5 (Dashboard-Form Picker):** `AgendaSection`-Edit-Form zeigt `<input type="date">` + `<input type="time">` (via browser devtools prüfbar). Öffnen einer Canonical-Row befüllt die Picker korrekt. Öffnen einer artificially-off-spec-Row (Test mit gemocktem Value `"99.99.9999"`) zeigt leeren Picker + roten Hinweis-Text.
- [ ] **DK-6 (Dashboard Save-Roundtrip):** Im Edit-Form eine neue Zeit via Picker wählen → Save → PUT-Request-Body enthält `zeit: "HH:MM Uhr"` (Canonical). Re-Open zeigt gespeicherten Wert im Picker. Keine Drift durch Roundtrip.
- [ ] **DK-7 (Build + Tests + Audit):** `pnpm build` ✓ ohne TS-Errors. `pnpm test` ✓ mit mindestens +15 neuen Tests (560 → ≥575). `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] **DK-8 (Staging-Smoke):** Staging-Deploy grün, `/api/health/` ok. Dashboard → Agenda → Eintrag id=6 (war `"19.30"`) öffnen: Picker zeigt `19:30`. Public `/de/` → Agenda-Panel zeigt alle Einträge im konsistenten Canonical-Format. Instagram-Export eines Agenda-Eintrags zeigt das gleiche Format in der PNG-Slide.

## Tasks

### Phase 1 — Canonical-Helper (pure logic)
- [ ] `src/lib/agenda-datetime.ts` anlegen mit allen 10 Funktionen
- [ ] `src/lib/agenda-datetime.test.ts` anlegen mit allen Test-Fällen für Legacy-Varianten

### Phase 2 — API-Layer
- [ ] `src/app/api/dashboard/agenda/route.ts` — POST-Validator erweitert um Format-Checks, 400 bei invalid
- [ ] `src/app/api/dashboard/agenda/[id]/route.ts` — PUT-Validator Partial-safe + Format-Check nur wenn Key im Body
- [ ] API-Tests: POST 400 bei invalid, 201 bei valid; PUT Partial ohne Format-Felder OK, PUT mit invalid 400 ohne UPDATE

### Phase 3 — Schema-Migration
- [ ] `src/lib/schema.ts` — idempotente One-time UPDATE-Schleife für `agenda_items` (nur Rows != canonical), Log-Line für normalisierte Rows + Warn für nicht-parse-bare Rows

### Phase 4 — Dashboard-Form
- [ ] `src/app/dashboard/components/AgendaSection.tsx` — 2 Input-Felder auf `type="date"` / `type="time"` umgestellt, Roundtrip via `xToIsoInput` / `formatCanonicalX`
- [ ] Legacy-Row-Hinweis-UX (leerer Picker + roter Text) bei nicht-parse-barem Wert
- [ ] `src/app/dashboard/components/AgendaSection.test.tsx` — Component-Test: Canonical-Roundtrip, Legacy-Hinweis, Save schickt Canonical-String

### Phase 5 — Verification
- [ ] `pnpm build` lokal grün
- [ ] `pnpm test` lokal grün, mindestens +15 Tests
- [ ] `pnpm audit --prod` 0 HIGH/CRITICAL
- [ ] Commit + Sonnet-Post-Commit-Evaluator clean
- [ ] Push → Sonnet-Pre-Push Gate clean
- [ ] PR + Codex-Review (max 2 Runden)
- [ ] Staging-Deploy + Smoke-Test (siehe DK-8)

## Notes

- **Patterns vor Start lesen:**
  - `patterns/api.md` → Partial-PUT CASE WHEN, Zod-artige Validation (für unseren manuellen Regex-Validator reicht aber simple Format-Check-Funktion)
  - `patterns/database.md` → idempotente UPDATEs via WHERE-Clause
  - `patterns/testing.md` → Vitest Pragma für Component-Tests mit jsdom
- **Re-Use aus bestehendem Code:** `validLength` in API-Helpers, `requireAuth`-Pattern, `pool` Singleton.
- **DB-Realität:** Nur 5 Prod-Rows, davon 2 off-spec. Migration ist sub-millisecond, kein Lock-Risk.
- **iOS Safari:** Native `<input type="time">` zeigt u.U. 12h-Format (User-Preference), aber Output ist immer 24h `HH:MM`. Kein UX-Blocker, kein Code-Workaround nötig.
- **Branch:** `feat/agenda-datetime-canonical` (bereits angelegt).

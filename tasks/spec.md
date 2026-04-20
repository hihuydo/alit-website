# Spec: Agenda Datum + Uhrzeit vereinheitlichen
<!-- Created: 2026-04-21 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft v2 — Codex Spec-R1 findings addressed (9): shared-DB blast-radius acknowledged, DK-4 rewritten to verify final state not count, normalizeLegacyDatum dropped (scope creep), DK-7 audit weakened to sprint-Baseline-Check, civil-date validation upgraded to strict, legacy-edit save-semantics defined, test-fixtures out-of-scope, ensureSchema migration-vehicle justified, DK-5 reformulated as DOM-mechanics -->

## Summary

Agenda-Einträge im Dashboard bekommen statt zwei Freitext-Inputs (`Datum`, `Zeit`) native HTML-Picker (`<input type="date">` + `<input type="time">`). Canonical-Format wird enforced: `DD.MM.YYYY` für Datum, `HH:MM Uhr` (typografisch-korrekt mit Space) für Zeit. Bestehende 5 Prod-Rows werden einmalig via idempotenter Migration auf Canonical normalisiert — aktuell sind 2 Rows off-spec (`"19.30"`, `"14:00Uhr"`).

## Context

- `agenda_items.datum` und `agenda_items.zeit` sind beide `TEXT NOT NULL` (Schema seit Tag 1). Keine DB-Level-Constraints.
- Prod hat 5 Agenda-Rows: 3 bereits canonical (`"15:00 Uhr"`), 2 nicht (`"19.30"`, `"14:00Uhr"`). `datum`-Spalte bei allen 5 im `DD.MM.YYYY`-Format.
- Dashboard-Form (`AgendaSection.tsx:416,420`) ist heute plain `<input>` ohne Typ + Format-Enforcement. Placeholder-Text (`15.03.2025`, `15:00 Uhr`) ist Tipp, keine Validierung.
- API (`src/app/api/dashboard/agenda/route.ts`, `[id]/route.ts`) nimmt jeden String bis 50 chars — validiert nur Länge, nicht Format.
- Public-Renderer (`src/components/AgendaItem.tsx:98`) rendert `{item.datum} &nbsp; {item.zeit}` as-is — keine Parse-Logik in UI. Format-Fix auf DB-Ebene wirkt automatisch.
- Sort ist nach `sort_order DESC`, nicht nach parse-bar-Datum — Migration kann Ordering nicht brechen.
- Instagram-Export (PR #97) konsumiert `datum` + `zeit` als Display-Strings — profitiert ohne Code-Change vom konsistenten Format.
- `journal_entries.date` ist **Out of Scope** (Freitext mit Ort- und Autor-Annotations, siehe Context-Dump in Conversation).

Reference: `CLAUDE.md`, `memory/project.md`, `memory/lessons.md` (ISO-8601 Timestamp API, DE-Locale-Stabilität, Partial-PUT-Falle bei required-Fields).

## Requirements

### Must Have (Sprint Contract)

1. **Canonical-Helper `src/lib/agenda-datetime.ts`** (neu, pure, edge-safe — keine Node-only Imports):
   - `parseIsoDate(iso: string): { day, month, year } | null` — nimmt `"2026-05-02"` aus `<input type="date">`, gibt Komponenten zurück. Strikte Regex + Civil-Date-Check (siehe `isCanonicalDatum` unten).
   - `parseIsoTime(iso: string): { hours, minutes } | null` — nimmt `"14:00"` aus `<input type="time">`. 24h strikt 00:00–23:59.
   - `formatCanonicalDatum({day, month, year}): string` → `"DD.MM.YYYY"` mit Zero-Pad.
   - `formatCanonicalZeit({hours, minutes}): string` → `"HH:MM Uhr"` mit Zero-Pad + Space.
   - `datumToIsoInput(canonical: "DD.MM.YYYY"): string | null` → `"YYYY-MM-DD"` für `<input type="date" value=…>`. Gibt null zurück bei off-spec-Input (defensiv für Legacy-Rows, die durch irgendwas noch nicht migriert wurden).
   - `zeitToIsoInput(canonical: "HH:MM Uhr"): string | null` → `"HH:MM"` für `<input type="time" value=…>`. Auch defensive null.
   - `isCanonicalDatum(s: string): boolean` — Regex `/^\d{2}\.\d{2}\.\d{4}$/` **plus strict civil-date-check** via `Date.UTC(year, month-1, day)` Roundtrip (lehnt `29.02.2025`, `31.02.2025`, `31.04.2025` korrekt ab). Spec-R2-Fix: Eine canonical-Validierung darf keinen impossible civil date durchlassen, weil dieser Gate API-seitig alle Writes schützt.
   - `isCanonicalZeit(s: string): boolean` — Regex `/^\d{2}:\d{2} Uhr$/` + Stunden 0-23 + Minuten 0-59.
   - **Legacy-Normalizer nur für `zeit`** — `normalizeLegacyZeit(s: string): string | null` nimmt `"14:00Uhr"`, `"19.30"`, `"15:00 Uhr"`, etc. und gibt Canonical zurück (oder null wenn nicht parse-bar). Wird NUR in der One-Time-Migration verwendet.
   - **Kein `normalizeLegacyDatum`** — Spec-R1-Scope-Trim: alle 5 Prod-Rows haben bereits canonical `datum` (`DD.MM.YYYY`). Heuristischer Datum-Normalizer für hypothetische Formate (`"2025/03/15"`, `"15.3.25"`) wäre Scope-Creep ohne Evidenz. Migration verifiziert nur `isCanonicalDatum` pro Row; Off-Format-Row (falls überhaupt vorhanden) → `console.warn` + unverändert lassen + Admin muss manuell korrigieren.

2. **API-Validator-Upgrade (`POST + PUT`):**
   - Neuer Validator-Guard: `datum` muss Canonical passen ODER 400 `"Ungültiges Datumsformat, erwartet DD.MM.YYYY"`.
   - Analog `zeit`: Canonical oder 400 `"Ungültiges Zeitformat, erwartet HH:MM Uhr"`.
   - POST: beide required (bleibt wie heute, nur Format zusätzlich). PUT: Partial-PUT bleibt — wenn Key nicht im Body, kein Check.
   - Längen-Check (`validLength(…, 50)`) bleibt als Defense-in-Depth.

3. **Dashboard-Form (`AgendaSection.tsx`):**
   - `<input type="date">` für Datum, `<input type="text">` ersetzend. Value via `datumToIsoInput(form.datum)`, onChange schreibt canonical zurück.
   - `<input type="time">` für Zeit, value via `zeitToIsoInput(form.zeit)`, onChange canonical.
   - Leerer Picker auf Create-Mode: `form.datum = ""`, `form.zeit = ""`. Save-Validierung client-side: beide nicht-leer **und** `isCanonicalDatum`/`isCanonicalZeit` before Submit — sonst Save-Button disabled (gleiches UX-Pattern wie heute, da sie required sind).
   - **Legacy-Row-Save-Semantik (explizit):** Beim Edit-Open einer Off-Spec-Row setzt der Adapter `form.datum`/`form.zeit` auf **leeren String** (nicht den Raw-DB-Wert). Picker bleibt leer. Neben dem Input erscheint ein Hinweis-Element `<p id="…-hint">` mit Text „Alter Eintrag — bitte Datum/Zeit neu wählen", und das `<input>` hat `aria-describedby` auf diese ID. Save-Button ist disabled bis der Admin einen gültigen Wert wählt. Der ursprüngliche DB-String wird **nicht** preserviert — der Admin MUSS korrigieren, ansonsten bleibt der Eintrag uneditiert. Das verhindert sowohl silent-overwrite als auch silent-Server-400.

4. **One-time DB-Migration in `ensureSchema()`:**
   - Für alle Rows in `agenda_items`:
     - `datum`: wenn `!isCanonicalDatum(datum)` → `console.warn("[agenda-migration] row %d datum=%s not canonical, manual fix required", id, value)`. **Kein UPDATE** (kein `normalizeLegacyDatum` — siehe DK-1).
     - `zeit`: wenn `!isCanonicalZeit(zeit)` → `normalizeLegacyZeit(zeit)` versuchen. Bei Erfolg UPDATE, bei Fail `console.warn` + unverändert.
   - Idempotent: WHERE-Clause filtert Rows die bereits canonical sind (zweiter Run UPDATEt 0 Rows).
   - Läuft in der Boot-Sequenz, nach den bestehenden Schema-ALTER, **vor** der Slug-Fix-UPDATE (Konsistenz mit bestehendem Code-Flow).
   - **⚠ Shared-DB Blast-Radius:** Per `CLAUDE.md` teilen Staging und Prod die DB. Der erste Staging-Boot führt die Migration bereits **gegen Prod-Daten** aus, nicht erst beim Prod-Merge. Pre-Deploy-Checks (siehe DK-8): (a) manuelle DB-Backup-Sanity `pg_dump alit > backup-pre-agenda-migration.sql` vor dem ersten Staging-Push, (b) Boot-Log auf Staging explizit auf `[agenda-migration] normalized N rows` prüfen, (c) bei unerwarteten `console.warn`-Zeilen Push stoppen + Rollback via `psql < backup`. Rollback-Plan: Da wir nur `zeit`-Werte UPDATEn und die Original-Werte textuelle Inhaltsvarianten sind (`"19.30"`, `"14:00Uhr"` → `"19:30 Uhr"`, `"14:00 Uhr"`), sind die Änderungen per manueller UPDATE reversibel — Backup ist Belt-and-Suspenders für den Unerwartet-Fall.

5. **Public-Renderer (`AgendaItem.tsx`):** **Keine Änderung**. String-Rendering zeigt automatisch das migrierte Canonical-Format.

6. **Tests:**
   - Unit-Tests für alle 8 Helper-Funktionen in `agenda-datetime.ts`: happy-path, edge-cases (Monatsgrenzen, Uhrzeit-Grenzen), Legacy-Normalizer mit allen aktuell in Prod gesehenen Off-Format-Varianten (`"14:00Uhr"`, `"19.30"`, `"15:00 Uhr"`, `"19:00 Uhr"`).
   - API-Test: POST mit ungültigem Datum → 400, POST mit ungültiger Zeit → 400, POST mit canonical → 201.
   - PUT-Test: Partial-PUT ohne `datum`/`zeit` ändert die Felder nicht; Partial-PUT mit invalidem `zeit` → 400 + kein UPDATE.
   - Dashboard-Component-Test: `<input type="date">` value-Roundtrip (Legacy-Row → leer + Hinweis; Canonical-Row → Picker-befüllt; Save schreibt Canonical-String zurück).

7. **Quality-Gates:** `pnpm build` ✓, `pnpm test` grün (+≥15 neue Tests). `pnpm audit --prod` wird am Sprint-Ende ausgeführt — neue HIGH/CRITICAL aus diesem Sprint sind Blocker, **pre-existing** Findings aus dependency-churn sind Out-of-Sprint-Scope (würden sonst Sprint-Contract kapern für unrelated Supply-Chain-State). Siehe Codex-R1-Triage.

8. **Staging-Smoke:**
   - Staging-Deploy grün; Boot-Logs zeigen Migration-Lines (`[agenda-migration] normalized 2 rows`).
   - DB auf Staging: `SELECT zeit FROM agenda_items` → alle 5 Rows canonical `"HH:MM Uhr"`.
   - Admin öffnet Edit-Form für id=6 (war `"19.30"`) → `<input type="time">` zeigt `19:30`.
   - Admin speichert → DB bleibt canonical.
   - Public `/de/` → Agenda-Panel zeigt konsistent `"DD.MM.YYYY"` + `"HH:MM Uhr"`.

### Nice to Have (explicit follow-up, NOT this sprint)

1. **`journal_entries.date` strukturieren** — Separate-Fields-Approach (`date_iso`, `place`, `author_annotation`). Braucht Spec + Schema-Migration + UI-Refactor. Eigener Sprint.
2. **DB-Level Constraints** — Check-Constraint auf `agenda_items.zeit ~ '^\d{2}:\d{2} Uhr$'`. Defense-in-Depth, aber redundant wenn API-Validator komplett ist.
3. **Lokalisierte Time-Picker-Labels** — iOS Safari zeigt `<input type="time">` mit native Locale; keine Kontrolle über AM/PM vs. 24h ohne Custom-Dropdown. Low-priority UX-Konsistenz.
4. **Batch-Fix-Modus im Dashboard** — "unnormalisiert"-Filter auf der Agenda-Liste, Ein-Klick-„Alle normalisieren"-Button. Mit 2 off-spec Rows ist das Overkill.

### Out of Scope

- `journal_entries.date`-Column (begründet in Conversation: freeform mit Orten + Autor-Annotations).
- Instagram-Export-Format-Änderungen — profitiert passiv vom konsistenten Input.
- Agenda-Ordering-Änderung (bleibt `sort_order DESC`, nicht Datum-basiert).
- Timezone-Handling (`zeit` ist naive local time, kein TZ-Info; Canonical-Format macht keine TZ-Aussage).
- **Test-Fixtures in `src/lib/instagram-post.test.ts`** und ähnlich: Die nutzen Placeholder-Werte (`datum: "2026-05-01"`, `zeit: "19:00"`) für reine Logik-Tests von `instagram-post.ts`, nicht als DB-State-Simulation. Der Canonical-Contract gilt für Storage + API-Input + Dashboard-UI, **nicht** für code-interne Test-Fixtures. Solche Fixtures bleiben unverändert. Siehe Codex-R1-Finding [Correctness] 3.

## Technical Approach

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/agenda-datetime.ts` | Create | 8 Parser/Formatter-Helper + Legacy-Normalizer, pure edge-safe |
| `src/lib/agenda-datetime.test.ts` | Create | Unit-Tests für alle Helper inkl. Prod-Legacy-Varianten |
| `src/lib/schema.ts` | Modify | One-time Migration-Query für `agenda_items` (idempotent) |
| `src/app/api/dashboard/agenda/route.ts` | Modify | POST-Validator erweitert um `isCanonicalDatum`/`isCanonicalZeit` |
| `src/app/api/dashboard/agenda/[id]/route.ts` | Modify | PUT-Validator erweitert (nur wenn Key im Body) |
| `src/app/api/dashboard/agenda/route.test.ts` | Modify/Create | Tests für 400 bei invalidem Format + 201 bei canonical |
| `src/app/api/dashboard/agenda/[id]/route.test.ts` | Modify/Create | Tests für Partial-PUT-Format-Validierung |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | 2 Inputs auf native `type="date"`/`type="time"` umgestellt, mit Roundtrip-Adapter zum Canonical-String |
| `src/app/dashboard/components/AgendaSection.test.tsx` | Modify/Create | Component-Test für Picker-Roundtrip + Legacy-Hinweis |

### Architecture Decisions

- **Storage bleibt TEXT, nicht DATE+TIME-Migration.** Gründe: (a) Minimierung Blast-Radius — der Parser/Validator-Layer fängt Off-Format ab, DB-Schema-Änderung wäre zusätzlicher Migrationsschritt ohne harten ROI. (b) Public-Rendering wäre komplizierter (TIMESTAMP → locale-formatted Display-String statt direkt aus DB). (c) Der Canonical-String ist bereits unambiguous DE-locale. Alternative `DATE + TIME NOT NULL`-Spalten-Refactor: abgelehnt, eigener Sprint falls nötig.
- **Native HTML5-Picker statt Custom-Dropdown.** Begründung: (a) Zero-Code, (b) Native Accessibility + Mobile-Support, (c) Browser-Consensus ist gut (Chrome/Safari/Firefox + iOS/Android liefern alle brauchbare Picker). Nachteile: iOS-Safari-AM/PM-Locale-Override ist nicht kontrollierbar — akzeptiert als Nice-to-Have falls problematisch.
- **Canonical-Format mit Space vor „Uhr".** `"14:00 Uhr"`, nicht `"14:00Uhr"`. Matches DE-Typographie-Konvention. Screenshot-User-Example zeigt die Off-Format-Variante, User hat explizit typografisch-korrekt bestätigt.
- **Parser/Formatter als separater Helper, nicht inline.** Begründung: Parser-Logik in 3 Dateien benötigt (API-Validator, Dashboard-Form-Roundtrip, Migration). Zentrale Location verhindert Drift.
- **One-time Migration in `ensureSchema()`, kein separates Migrations-Tool.** Konsistent mit bestehendem Pattern (Slug-Fix `discours-agits` → `discours-agites`, siehe gerade gemergter PR #100). Idempotent via WHERE-Clause. Kein Marker-Table nötig bei 5 Rows. Alternativen geprüft: (a) separates Migrations-Skript + One-Shot-Deploy-Job — abgelehnt wegen Coordination-Overhead für 2 Datenpunkte; (b) DB-Schema-Migration auf `DATE + TIME`-Spalten — abgelehnt wegen Blast-Radius (Public-Renderer + Instagram-Export müssten alle ihre Parse-Logik umbauen). Partial-Success-Semantik: Migration-Query läuft pro-Row, eine fehlgeschlagene Row (console.warn) blockiert nicht die anderen.
- **Instagram-Export touchiert nichts.** Datum/Zeit fließen als Display-String ins Template (siehe `src/lib/instagram-post.ts`); nach Migration konsistent + weiterhin richtig.
- **Legacy-Row-Display-Fallback: leerer Picker + Hinweis-Text, nicht Crash oder Error.** Defensive UX — auch wenn die Migration alle Prod-Rows normalisiert, kann es in Zukunft (bei Import von irgendwo) nochmal Off-Format-Rows geben.

### Dependencies

- Keine neuen npm-Pakete.
- Keine neuen env-Vars.
- Keine neuen Schema-Spalten oder -Indexes (nur UPDATE).
- Nutzt bestehende Helper: `validLength` (`src/lib/api-helpers.ts`), `pool` (`src/lib/db.ts`), `requireAuth` (`src/lib/api-helpers.ts`).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Admin wählt gültiges Datum + leere Zeit → Save | Client-side-Validation blockt Submit; Tooltip "Beide Felder benötigt" (bestehendes Pattern) |
| Legacy-Row `zeit="19.30"` im Edit-Open | `zeitToIsoInput("19.30")` → null → `<input type="time" value="">` + kleiner roter Hint „Alter Eintrag — bitte Zeit neu wählen". Save danach speichert Canonical. |
| Admin editiert Row mit canonical `zeit="14:00 Uhr"` | `zeitToIsoInput("14:00 Uhr")` → `"14:00"` → Picker zeigt 14:00 → Save ohne Änderung → PUT-Request enthält `zeit: "14:00 Uhr"`. Partial-PUT behandelt keine Änderung korrekt. |
| iOS-Safari zeigt 12h Format (User-Preference) | Browser-Default, akzeptiert. Canonical-Output bleibt 24h (von native-picker-Value `"14:00"` → unser Formatter). |
| Admin kopiert "14.00" (Punkt statt Doppelpunkt) in Picker | Picker rejectet Wert (native Validation), Feld bleibt leer. |
| API bekommt POST mit `zeit: "14:00Uhr"` (off-spec) direkt via curl | 400 „Ungültiges Zeitformat, erwartet HH:MM Uhr" |
| Migration läuft beim Container-Restart erneut | Idempotent: 0 Rows matchen die WHERE-not-canonical-Bedingung, kein UPDATE |
| Migration scheitert auf einer bestimmten Row (z.B. `zeit="TBD"`) | Row bleibt as-is, `console.warn` loggt die Row-ID + den unveränderten Value. Andere Rows migriert. |
| DB-Row Migration UPDATE läuft während Live-Traffic | Einzelne UPDATE-Queries, sub-millisecond, kein lock-wait-Risk bei 5 Rows. |
| Dashboard-Save schickt leeren `datum`-String im PUT | Bestehende Length-Validation rejected das (required-field). Neuer Canonical-Validator läuft nicht bei undefined. |
| Public-Renderer-Timezone (Agenda zeigt 14:00 für Event in Zürich) | Naive local — keine TZ-Info in DB. Explizit out-of-scope. |

## Risks

- **iOS Safari Native Time-Picker Locale:** iOS Safari kann Zeit im 12h-Format anzeigen (je nach System-Preference). Output-Wert in HTML5 ist aber immer `"HH:MM"` 24h. Mitigation: Output-Wert wird unverändert gespeichert; Admin sieht lokales Format. Bei Bedenken: Nice-to-Have Custom-Dropdown.
- **Legacy-Row mit nicht-normalisierbarem Wert nach Migration:** Unwahrscheinlich bei heutigen 5 Rows, aber Future-Import könnte z.B. `"noon"` oder `"am Abend"` liefern. Mitigation: Fallback-UX mit leerem Picker + Hinweis — Admin kann korrigieren. Keine Data-Loss.
- **Partial-PUT-Regression:** Wenn PUT-Validator strict einen Check auf `zeit`-Format macht ohne Partial-Check, würde ein Save der nur `title_i18n` ändert die Canonical-Validation triggern. Mitigation: Test für Partial-PUT ohne `datum`/`zeit` — darf nicht 400 werfen.
- **Instagram-Export-Template:** Template nutzt `datum` + `zeit` als Display-String. Nach Migration sieht das konsistent aus. Kein Risk, nur Upside.
- **Admin-UX-Shift:** Admins die bisher `"19.30"` frei tippen konnten, stoßen jetzt auf einen Picker. Kann Gewöhnung erfordern. Low-Risk — Browser-Picker sind intuitiv, Placeholder-Text weist auf Format hin.
- **Browser-Inkompatibilität:** IE11 hat kein `<input type="date">`. Alit unterstützt moderne Browser, kein explizites IE-Testing-Target.

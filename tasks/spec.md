# Spec: Agenda Datum + Uhrzeit vereinheitlichen
<!-- Created: 2026-04-21 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

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
   - `parseIsoDate(iso: string): { day, month, year } | null` — nimmt `"2026-05-02"` aus `<input type="date">`, gibt Komponenten zurück. Strikte Regex.
   - `parseIsoTime(iso: string): { hours, minutes } | null` — nimmt `"14:00"` aus `<input type="time">`. 24h strikt 00:00–23:59.
   - `formatCanonicalDatum({day, month, year}): string` → `"DD.MM.YYYY"` mit Zero-Pad.
   - `formatCanonicalZeit({hours, minutes}): string` → `"HH:MM Uhr"` mit Zero-Pad + Space.
   - `datumToIsoInput(canonical: "DD.MM.YYYY"): string | null` → `"YYYY-MM-DD"` für `<input type="date" value=…>`. Gibt null zurück bei off-spec-Input (defensiv für Legacy-Rows, die durch irgendwas noch nicht migriert wurden).
   - `zeitToIsoInput(canonical: "HH:MM Uhr"): string | null` → `"HH:MM"` für `<input type="time" value=…>`. Auch defensive null.
   - `isCanonicalDatum(s: string): boolean` — Regex-Check `/^\d{2}\.\d{2}\.\d{4}$/` + plausible-date-sanity (Monat 1-12, Tag 1-31, keine Feb-30; keep simple, keine Leap-Year-Überprüfung).
   - `isCanonicalZeit(s: string): boolean` — Regex `/^\d{2}:\d{2} Uhr$/` + Stunden 0-23 + Minuten 0-59.
   - **Legacy-Normalizer** `normalizeLegacyZeit(s: string): string | null` — nimmt `"14:00Uhr"`, `"19.30"`, `"15:00 Uhr"`, etc. und gibt Canonical zurück (oder null wenn nicht parse-bar). Wird NUR in der One-Time-Migration verwendet.
   - `normalizeLegacyDatum(s: string): string | null` — symmetrisch, für den Fall dass later mal ein Off-Format reinkommt. Für unser aktuelles Prod-Set No-Op (alle schon canonical), aber nimmt defensiv auch `"2025/03/15"`, `"15.3.25"` etc. Falls nicht parse-bar → null.

2. **API-Validator-Upgrade (`POST + PUT`):**
   - Neuer Validator-Guard: `datum` muss Canonical passen ODER 400 `"Ungültiges Datumsformat, erwartet DD.MM.YYYY"`.
   - Analog `zeit`: Canonical oder 400 `"Ungültiges Zeitformat, erwartet HH:MM Uhr"`.
   - POST: beide required (bleibt wie heute, nur Format zusätzlich). PUT: Partial-PUT bleibt — wenn Key nicht im Body, kein Check.
   - Längen-Check (`validLength(…, 50)`) bleibt als Defense-in-Depth.

3. **Dashboard-Form (`AgendaSection.tsx`):**
   - `<input type="date">` für Datum, `<input type="text">` ersetzend. Value via `datumToIsoInput(form.datum)`, onChange schreibt canonical zurück.
   - `<input type="time">` für Zeit, value via `zeitToIsoInput(form.zeit)`, onChange canonical.
   - Leerer Picker auf Create-Mode: `form.datum = ""`, `form.zeit = ""`; browser zeigt "TT.MM.JJJJ" / "--:--" Placeholder. Save-Validierung client-side: beide nicht-leer bevor Submit (gleiches UX-Pattern wie heute, da sie required sind).
   - Edge-Case Legacy-Rows (off-spec): beim Edit-Open versucht `xToIsoInput` zu parsen; Fail → Feld bleibt leer + kleiner Hinweis „Alter Eintrag, bitte neu wählen". Admin kann manuell nachziehen.

4. **One-time DB-Migration in `ensureSchema()`:**
   - Für alle Rows in `agenda_items`: wenn `datum` ≠ canonical, ruft `normalizeLegacyDatum(datum)` auf und UPDATEt wenn Erfolg. Idem für `zeit`.
   - Rows die nicht parse-bar sind: `console.warn("[agenda-migration] row %d zeit=%s could not be normalized, skipping", id, value)` — Admin muss im Dashboard manuell nachziehen.
   - Idempotent: WHERE-Clause filtert Rows die bereits canonical sind (zweiter Run UPDATEt 0 Rows).
   - Läuft in der Boot-Sequenz, nach den bestehenden Schema-ALTER, **vor** der Slug-Fix-UPDATE (Konsistenz mit bestehendem Code-Flow).

5. **Public-Renderer (`AgendaItem.tsx`):** **Keine Änderung**. String-Rendering zeigt automatisch das migrierte Canonical-Format.

6. **Tests:**
   - Unit-Tests für alle 8 Helper-Funktionen in `agenda-datetime.ts`: happy-path, edge-cases (Monatsgrenzen, Uhrzeit-Grenzen), Legacy-Normalizer mit allen aktuell in Prod gesehenen Off-Format-Varianten (`"14:00Uhr"`, `"19.30"`, `"15:00 Uhr"`, `"19:00 Uhr"`).
   - API-Test: POST mit ungültigem Datum → 400, POST mit ungültiger Zeit → 400, POST mit canonical → 201.
   - PUT-Test: Partial-PUT ohne `datum`/`zeit` ändert die Felder nicht; Partial-PUT mit invalidem `zeit` → 400 + kein UPDATE.
   - Dashboard-Component-Test: `<input type="date">` value-Roundtrip (Legacy-Row → leer + Hinweis; Canonical-Row → Picker-befüllt; Save schreibt Canonical-String zurück).

7. **Quality-Gates:** `pnpm build` ✓, `pnpm test` grün (+≥15 neue Tests), `pnpm audit --prod` 0 HIGH/CRITICAL.

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
- **One-time Migration in `ensureSchema()`, kein separates Migrations-Tool.** Konsistent mit bestehendem Pattern (Slug-Fix `discours-agits` → `discours-agites`, siehe gerade gemergter PR #100). Idempotent via WHERE-Clause. Kein Marker-Table nötig bei 5 Rows.
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

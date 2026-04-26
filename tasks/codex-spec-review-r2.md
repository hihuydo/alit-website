# Codex Spec Review — Round 2 — 2026-04-26

## Scope
Spec: tasks/spec.md (Agenda Bilder-Grid 2.0 — Sprint 1)
Sprint Contract: 14 Done-Kriterien (DK-1..DK-14)
Basis: 5 Sonnet rounds (~64 findings incorporated), 1 prior Codex SPLIT-recommendation implemented

## Findings

### [Contract] — Sprint-Contract-Verletzung oder fehlendes Must-Have
[Contract] — `DK-12` referenziert einen API-Pfad, den die aktuelle Codebase nicht hat: `tasks/todo.md:20` fordert `GET /api/agenda/`, aber vorhanden ist nur `GET /api/dashboard/agenda/` (`src/app/api/dashboard/agenda/route.ts:62-89`); der Public-Read-Path läuft über `getAgendaItems()` statt über eine Public-API (`src/lib/queries.ts:76-164`). So ist das DK nicht mechanisch verifizierbar. Suggested fix: DK-12 auf `GET /api/dashboard/agenda/` ändern oder explizit einen separaten Public-Read-Smoke über die echte Public-Render-Route formulieren.

### [Correctness] — Technische Korrektheit / Edge Cases / Race Conditions
[Correctness] — Die echte Public-DB-Read-Integration bleibt ungetestet: der Spec verlangt Änderungen in `getAgendaItems()` (`tasks/spec.md:133`, `tasks/todo.md:28`), aber die Testliste deckt nur `AgendaItem`, `AgendaSection` und die Dashboard-API ab (`tasks/spec.md:95-105`). Wenn `src/lib/queries.ts:76-164` beim Implementieren die neuen Spalten im `SELECT` oder Mapping vergisst, bleiben alle Unit-Tests grün und die Public-Site rendert trotzdem überall Legacy-Defaults. Suggested fix: einen gezielten `queries`-Test ergänzen, der Rows mit `images_grid_columns=3/images_fit='contain'` sowie Legacy-Rows ohne Werte mockt und die Fallback-/Pass-through-Logik assertert.

### [Architecture] — Architektur-Smells mit konkretem Risk (kein Nice-to-have)
[Architecture] — Der geplante Shared-Upload-Helper ist auf den falschen Vertrag getypt: Spec/Todo verlangen `uploadFileToMedia(file): Promise<MediaPickerResult>` in `MediaPicker.tsx` (`tasks/spec.md:100,136,162-163`, `tasks/todo.md:55-56`), aber `AgendaSection` speichert Agenda-Bilder per `public_id` plus Dimensions/Orientation (`src/app/dashboard/components/AgendaSection.tsx:241,272-304,363`), während `MediaPickerResult` nur Embed-Felder wie `type/src/caption/width` trägt (`src/app/dashboard/components/MediaPicker.tsx:15-27,139-149`). Das zwingt den Slot-Editor sonst zu einem fragilen `src`-Parsing oder zu einem zweiten Lookup und koppelt Agenda-JSON an den Rich-Text-Embed-Vertrag. Suggested fix: einen neutralen Upload-Helper extrahieren, der die hochgeladene Media-Row oder mindestens `{ public_id, mime_type }` zurückgibt; `MediaPicker` mappt daraus `MediaPickerResult`, `AgendaSection` mappt daraus `AgendaImage`.

## Verdict
NEEDS WORK

## Summary
3 findings — 1 Contract, 1 Correctness, 0 Security, 1 Architecture, 0 Nice-to-have.

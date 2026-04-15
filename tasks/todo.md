# Sprint 4: Multi-Locale Rollout Journal
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-15 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `pnpm build` clean, `pnpm test` alle 52 Tests grün
- [ ] Migration fügt `title_i18n`/`content_i18n`/`footer_i18n` auf `journal_entries` hinzu + idempotenter JS-Backfill
- [ ] Alle Journal-Einträge nach Backfill mit nicht-leeren `content_i18n.de` (lines oder content derived)
- [ ] Journal-Hashtags migriert zu `{tag_i18n: {de, fr}, projekt_slug}[]` (idempotent, FR=DE default)
- [ ] `GET /api/dashboard/journal/` returnt `*_i18n` + `completion: {de, fr}`
- [ ] `POST /api/dashboard/journal/` akzeptiert i18n-Payload, rejectet `null` mit 400
- [ ] `PUT /api/dashboard/journal/[id]/` partial-update-safe + Dual-Write auf Legacy
- [ ] JournalEditor hat DE/FR-Tabs mit parallel-mounted RichTextEditor + Title-Input + Footer-Textarea pro Locale
- [ ] Inline-Hashtag-Logik in JournalEditor durch `HashtagEditor` mit `showI18n` ersetzt
- [ ] Auto-Save bleibt funktional (keine Datenverlust-Regression bei Draft-States)
- [ ] JournalSection zeigt Completion-Badges DE/FR in der Liste
- [ ] Reader `getJournalEntries(locale)` skipped Entries ohne DE-Content bei DE, transformiert Hashtags zu Legacy-Public-Shape
- [ ] `/de/` Journal rendert visuell identisch zu pre-Sprint
- [ ] `/fr/` Journal rendert mit per-Feld `lang="de"` auf Fallback-Elementen (h2, content-div, p.footer)
- [ ] Seed schreibt Fresh-DB direkt mit `*_i18n` + neuer Hashtag-Shape
- [ ] `memory/lessons.md` + `memory/todo.md` vor Merge aktualisiert

## Tasks

### Phase 1 — Migration
- [ ] `src/lib/schema.ts`: `ALTER TABLE journal_entries ADD COLUMN *_i18n` + JS-Loop-Backfill
- [ ] `src/lib/schema.ts`: Hashtag-Shape-Migration-Helper extrahieren (`migrateHashtagShape(table: string)`) — Code aus Sprint 3 für agenda_items wiederverwenden, jetzt auch für journal_entries
- [ ] `src/lib/seed.ts`: Fresh-Seed schreibt `title_i18n`/`content_i18n`/`footer_i18n` + Hashtags in neuer Shape
- [ ] Lokal verifizieren: DB-Volume weg → frischer Boot

### Phase 2 — API
- [ ] `src/app/api/dashboard/journal/route.ts`: GET + POST auf `*_i18n`, Validator mit null-guard, `validateHashtagsI18n` aus agenda-hashtags.ts
- [ ] `src/app/api/dashboard/journal/[id]/route.ts`: PUT partial-update + Dual-Write (`title`, `content`, `footer`)
- [ ] `src/lib/queries.ts`: `getJournalEntries(locale: Locale)` — liest nur `*_i18n`, `*IsFallback`-Flags, DE-skip, Hashtag-Transform zurück zu Legacy-Shape
- [ ] `src/content/de/journal/entries.ts`: `JournalEntry`-Type um `titleIsFallback`/`contentIsFallback`/`footerIsFallback` erweitern
- [ ] `src/app/dashboard/components/journal-editor-types.ts`: `DashboardJournalEntry` um i18n-Felder + `completion` erweitern
- [ ] `src/app/[locale]/layout.tsx`: `getJournalEntries(locale as Locale)`
- [ ] curl-Smoke: GET shape, POST/PUT mit `*_i18n`, 400 auf `{"title_i18n": null}`

### Phase 3 — Dashboard-UI
- [ ] `src/app/dashboard/components/JournalEditor.tsx`: Form-State auf `{shared, de:{title,footer,html}, fr:{...}}` umstellen
- [ ] Locale-Tabs + parallel-mounted per Locale (Title-Input, Footer-Textarea, RichTextEditor)
- [ ] Inline-Hashtag-Logik durch `<HashtagEditor showI18n />` ersetzen (drop-in nach Sprint-3-Pattern)
- [ ] Auto-Save-Payload auf neuen Shape — volle `{de, fr}`-Objekte immer senden
- [ ] Edit-Open liest `item.*_i18n` statt Legacy
- [ ] `JournalSection.tsx`: Completion-Badges in Listen-Row
- [ ] `JournalPreview.tsx`: per-Feld `lang`-Attribute (soweit relevant)

### Phase 4 — Public Rendering
- [ ] `src/components/Wrapper.tsx` (oder Journal-Rendering-Stelle): `lang={entry.titleIsFallback ? "de" : undefined}` auf `<h2>`, analog für Content-Wrapper + Footer-`<p>`
- [ ] `/de/` + `/fr/` visuell testen

### Phase 5 — Ship
- [ ] Feature-Branch `feat/i18n-journal`, committen, pushen → Staging-Deploy verifizieren (CI + URL + Smoke + Logs)
- [ ] PR eröffnen, Codex-Review einholen (max 2 Runden)
- [ ] Findings gegen Sprint Contract bewerten
- [ ] Nach Merge: Production-Deploy verifizieren
- [ ] `memory/lessons.md` (nur bei neuen Learnings) + `memory/todo.md` updaten
- [ ] **Cleanup-Sprint** als Follow-up in `memory/todo.md` vermerken

## Notes
- Pattern-Referenzen:
  - `AgendaSection.tsx` + `agenda`-API + `getAgendaItems(locale)` aus Sprint 3 sind die direkte Vorlage.
  - `HashtagEditor`-Component mit `showI18n` wiederverwenden, Journal-Inline-Logik ersetzen.
  - `validateHashtagsI18n` aus `src/lib/agenda-hashtags.ts` importieren (gleiche Allowlist).
  - `contentBlocksFromParagraphs` aus Sprint 2 für `lines`-Derivation.
- **`author` bleibt single-locale** — Gast-Autor:innen sind Personennamen, keine Übersetzung.
- **Auto-Save-Vorsicht:** Payload-Shape ändert sich. Bei incomplete Drafts keine Regression gegenüber bestehendem Pattern (siehe `lessons.md` 2026-04-14).
- `journal_entries` hat kein locale-Scope-Problem → einfacher idempotenter Backfill.
- Hashtag-Shape-Migration als Helper-Function in schema.ts, um Sprint-3-Duplikat zu vermeiden.

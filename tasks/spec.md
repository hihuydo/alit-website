# Spec: Multi-Locale Rollout Agenda (Sprint 3 von ~4)
<!-- Created: 2026-04-15 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary
Dritter Schritt der i18n-Migration: `agenda_items` bekommt JSONB-per-field für `titel`, `lead`, `ort` und `content` (legacy `beschrieb` wird in `content_i18n.de` derived). Muster identisch zu Sprint 2 auf `projekte`. Die Codex-Runde-1+2-Lessons aus Sprint 2 werden **präventiv** in diesem Sprint angewandt: Legacy-Spalten sind write-only, Validatoren trennen `undefined` von `null`, `lang`-Attribut per Feld auf dem Frontend.

## Context
- Schema `agenda_items` (`src/lib/schema.ts:13-24`): `datum`, `zeit`, `ort NOT NULL`, `ort_url NOT NULL`, `titel NOT NULL`, `beschrieb JSONB` (legacy plain-text-Array), `lead TEXT` (additive), `content JSONB` (additive Rich-Text), `hashtags JSONB`, `images JSONB`, `sort_order`. **Kein `locale`-Scope** — wie `projekte` eine Zeile pro logischer Entität.
- Reader `getAgendaItems()` (`src/lib/queries.ts:16-40`) returns `AgendaItemData` mit single-locale Feldern. Sortierung: `sort_order DESC` (neueste oben, siehe `lessons.md` 2026-04-14).
- Dashboard `AgendaSection.tsx` + API `/api/dashboard/agenda[/id]` mit Multi-Image-Upload, Hashtag-Editor, MediaPicker, Auto-Save (`lessons.md` 2026-04-14 Autosave-with-optional-Fields).
- Agenda-Items haben **Dependencies** auf andere Felder:
  - `hashtags[].projekt_slug` verweist auf `projekte.slug` (`lessons.md` 2026-04-14 Media-Usage muss Agenda scannen)
  - `images[].public_id` verweist auf `media.public_id`
  - Beides bleibt **single-locale** (Slugs + UUIDs sind sprachneutral).
- Helper `contentBlocksFromParagraphs` existiert bereits aus Sprint 2 → wiederverwenden für `beschrieb`-Derivation.

### Feld-Klassifikation
| Feld | Übersetzbar? | Begründung |
|------|--------------|------------|
| `titel` | ✅ ja | Event-Titel unterscheidet sich DE/FR |
| `lead` | ✅ ja | Plain-Text-Zusammenfassung |
| `ort` | ✅ ja | Werte wie "Literaturhaus Zürich" (nicht übersetzungsbedürftig) ODER "Online via Zoom" (evtl.). Parallel zum kategorie-Pattern aus Sprint 2: übersetzbar, Admin übersetzt manuell. |
| `content` (Rich-Text) | ✅ ja | Hauptinhalt |
| `beschrieb` (legacy) | ❌ DE-only (legacy-Fallback) | String-Array aus Pre-Rich-Text-Ära. Wird bei Migration in `content_i18n.de` via `contentBlocksFromParagraphs` derived. Spalte bleibt unangetastet (Rollback). |
| `datum` | ❌ | ISO-Date, sprachneutral. Anzeige-Formatierung ist client-locale-Sache (`new Intl.DateTimeFormat`). |
| `zeit` | ❌ | "18:30" ist universell. |
| `ort_url` | ❌ | URL pro Event, nicht pro Locale. |
| `images` | ❌ | `public_id` + Metadaten; Alt-Texts könnten übersetzbar sein → **explizit Nice-to-have**, nicht in diesem Sprint. |
| `hashtags` | ⚠️ **teilweise** | `tag` (Anzeige-Label) wird übersetzbar: pro Hashtag-Entry `{tag_i18n: {de, fr}, projekt_slug}`. `projekt_slug` bleibt **single-locale** (URL-stabile Referenz auf `projekte.slug`). Shape-Change des JSONB-Arrays, keine neue DB-Spalte. |
| `archived` (falls implizit, Schema hat keinen Flag) | ❌ | Agenda hat **kein** `archived`-Flag (Projekte hat eins). Sprint anpassen: keine archived-Logik. |

**Hinweis `archived`:** Der User-Prompt nannte `archived` — aber `agenda_items` hat diese Spalte nicht. Der Wert kommt von `projekte`. Ignoriert im Sprint (kein Archiv-Konzept für Events).

## Requirements

### Must Have (Sprint Contract)
1. **DB-Migration `agenda_items` auf JSONB-per-field**
   - Additive `ALTER TABLE`: `title_i18n`, `lead_i18n`, `ort_i18n`, `content_i18n` — alle `JSONB NOT NULL DEFAULT '{}'::jsonb`.
   - Idempotenter JS-Backfill in `schema.ts`: für Rows mit allen vier `*_i18n = '{}'` → `{de: <legacy>}` kopieren. `content_i18n.de` wird aus `content` (falls non-empty) ODER `beschrieb` via `contentBlocksFromParagraphs` abgeleitet.
   - Empty-String-Behandlung: leere legacy-Werte → `{}` (nicht `{de: ""}`), damit `hasLocale()` korrekt false returnt.
   - **Hashtag-Shape-Migration**: bestehendes `hashtags: {tag, projekt_slug}[]` wird bei Migration transformiert zu `{tag_i18n: {de: tag, fr: tag}, projekt_slug}[]`. **Default-FR = Default-DE**: Hashtags sind Brand-/Projektnamen (z.B. `discoursagités`, `lyriktisch`, `netzwerkfuerliteratur*en`, `zürcherliteraturwerkstatt`) und werden typischerweise in beiden Sprachen identisch geschrieben. Admin kann pro Hashtag-Entry im Dashboard pro Locale überschreiben wenn nötig. Idempotent-Check: erkenne alte Shape per `typeof h.tag === "string"` → migriere nur diese. Rows mit bereits neuer Shape bleiben unverändert.
   - Legacy-Spalten bleiben bestehen (Dual-Column-Phase). Hashtags werden **in-place** gepatcht (keine Shadow-Spalte) — kein Rollback-Plan für das Array möglich, aber Schema ist additiv-kompatibel (Reader-Check auf beide Shapes).
2. **API `/api/dashboard/agenda/` akzeptiert multi-locale Payload**
   - POST/PUT empfangen `{title_i18n, lead_i18n, ort_i18n, content_i18n, datum, zeit, ort_url, images, hashtags}`. Alte Felder (`titel`, `lead`, `ort`, `content`, `beschrieb`) werden nicht mehr akzeptiert.
   - **Hashtag-Validator** akzeptiert neue Shape: Array von `{tag_i18n: {de?: string, fr?: string}, projekt_slug: string}`. Mindestens ein locale muss non-empty sein (sonst 400).
   - **Validator-Regel (Sprint-2-Lesson):** `undefined = skip`, `null = 400 invalid`. Niemals `undefined || null` im Validator zusammenfassen.
   - **Dual-Write für Legacy-Spalten:** Server schreibt zusätzlich `titel = pickLegacy(title_i18n)`, `lead = pickLegacy(lead_i18n)`, `ort = pickLegacy(ort_i18n)`, `content = pickLegacyContent(content_i18n)`. `beschrieb` bleibt bei `'[]'::jsonb` bei Insert, unverändert bei Update — Legacy-Read-Fallback ist DE-only. **Reader liest NICHT aus diesen Spalten (Sprint-2-Lesson: Dual-Write ≠ Dual-Read).**
   - GET returnt alle `*_i18n`-Spalten + abgeleitetes `completion: {de, fr}` (content-basiert).
3. **Reader `getAgendaItems(locale)` locale-aufgelöst + per-field Fallback-Flags**
   - Signatur ändert: `getAgendaItems(locale: Locale): Promise<AgendaItemData[]>`.
   - `AgendaItemData` erweitert um `titleIsFallback`, `leadIsFallback`, `ortIsFallback`, `contentIsFallback` (alle optional, default false).
   - DE-Locale-Isolation: wenn DE-Content fehlt → Entry skipped (kein FR→DE Reverse-Fallback, Sprint-2-Lesson P2).
   - Legacy-Spalten (`titel`, `lead`, `ort`, `content`, `beschrieb`) werden **nicht gelesen** — `*_i18n` ist Source-of-Truth post-Migration.
   - **Hashtag-Resolution im Reader (wichtig):** Reader transformiert die DB-Shape `{tag_i18n, projekt_slug}[]` zurück zur bisherigen Public-Shape `{tag: string, projekt_slug: string}[]` — mit `tag = t(h.tag_i18n, locale) ?? ""`. Wenn resolved tag leer → Hashtag aus der Liste filtern. **Public-Komponenten (`AgendaItem.tsx`, `JournalPreview.tsx`, Hashtag-Chip-Renderer) bleiben auf Legacy-Shape unverändert** — das hält den Impact-Radius klein und Journal kann später unabhängig migriert werden. Per-Hashtag `isFallback`-Flag wird **nicht** durchgereicht — Hashtag-Chips sind kurze Inline-Texte, Misspronunciation-Risiko gering; zusätzlich kostet per-Hashtag `lang`-Attribut unverhältnismäßig viel DOM. Pragmatische Entscheidung dokumentiert: Hashtag-Labels erben parent-`lang`, auch wenn sie Fallback sind.
4. **Dashboard `AgendaSection.tsx` mit Locale-Tabs**
   - Tabs `[DE ✓] [FR –]` mit Live-Completion (content-basiert).
   - **Parallel-mounted per Locale:** Titel-Input, Lead-Textarea, Ort-Input, RichTextEditor — alle in beiden Locales parallel gemountet, inaktive via `hidden`.
   - **Hashtag-Editor mit 2 Label-Feldern:** pro Hashtag-Row zwei Text-Inputs (DE/FR-Label) + Projekt-Picker (unverändert, single). Beide Inputs sichtbar (keine Tab-Umschaltung auf Hashtag-Ebene — der Hashtag-Block ist kompakter als Lead/Content, zwei nebeneinander liegende Felder sind OK).
   - Form-State: `{datum, zeit, ort_url, images, hashtags, de: {titel, lead, ort, html}, fr: {...same}}`. `hashtags` ist Array von `{tag_i18n: {de, fr}, projekt_slug}` — **shared zwischen beiden Locale-Tabs** (eine Instanz, enthält beide Sprachen pro Hashtag).
   - Datum, Zeit, Ort-URL, Images sind single-locale (eine Instanz).
   - Listen-Row zeigt Completion-Badges DE/FR (content-basiert), analog `ProjekteSection.tsx`.
5. **Public-Rendering `/fr/`: Per-Feld `lang="de"`-Attribute auf Fallback-Wrappern**
   - `AgendaItem.tsx`: `<h3>` mit `lang={item.titleIsFallback ? "de" : undefined}`; `<p className="lead">` mit `leadIsFallback`; `<div className="ort">` mit `ortIsFallback`; Content-Wrapper mit `contentIsFallback`.
   - Kein card-weites `lang`-Attribut.
6. **Auto-Save kompatibel** mit neuem Payload-Shape
   - Bestehendes Auto-Save-Pattern (siehe `lessons.md` 2026-04-14 "Autosave mit optionalen Feldern gegen Datenverlust") bleibt erhalten: incomplete i18n drafts werden **nicht als leere Objekte gesendet**, sondern als `undefined` (JSON.stringify dropt sie).
7. **Build grün + existierende Routes unverändert**
   - `pnpm build`, `pnpm test` (inkl. existierende 52 Tests) grün.
   - `/de/` (Homepage rendert Agenda) und Agenda-Items auf Panel 1 visuell identisch zum aktuellen Stand.
   - `/fr/` rendert Agenda mit DE-Fallback + korrekten per-Feld `lang`-Attributen.

### Nice to Have (explicit follow-up, NOT this sprint)
1. **`images[].alt` übersetzen** — Alt-Text pro Locale. Separate Spalte oder JSONB-Erweiterung im `images`-Array. Klein genug für Mini-Sprint, aber Scope-Creep in Sprint 3.
2. **Datum-Locale-Formatierung im Client** — Monatsnamen je nach `locale` (April vs. avril). Aktuell Intl.DateTimeFormat mit Browser-Sprache, sollte reichen.
3. **Agenda Reorder entlockalisieren** — `agenda_items` hat keinen locale-Scope-Problem (wie projekte), reorder bleibt unverändert.
4. **Journal-Hashtags auf gleichem Pattern migrieren** — `journal_entries.hashtags` hat dieselbe Shape. Muss in Sprint 4 (Journal) mitgemacht werden (oder als Bonus hier — bewusst rausgelassen, um Scope klein zu halten). Reader muss aber Shape-Check für beide Varianten haben bis Sprint 4.

### Out of Scope
- **Agenda Split in `current/past` basierend auf `datum`** — separates UX-Thema, unabhängig von i18n.
- **FR-Locale-Support für alle anderen Tables** — Sprint 4 ist Journal.
- **URL-Slug-Übersetzung** (`/fr/agenda/...`) — Agenda hat keine Slug-Routes, aber analog out-of-scope.
- **Kategorie-Feld für Agenda** — existiert nicht, kein Change.
- **Paragraphs→Content-Migration rückwirkend mergen** — `beschrieb` wird in `content_i18n.de` gespiegelt bei Migration; danach pflegt der Admin nur `content_i18n`.

## Technical Approach

### Migration (in `src/lib/schema.ts` nach projekte-Block)

```sql
ALTER TABLE agenda_items
  ADD COLUMN IF NOT EXISTS title_i18n   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lead_i18n    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ort_i18n     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;
```

JS-Loop-Backfill (idempotent, identisch zu projekte-Pattern):
```ts
const { rows: toMigrate } = await pool.query(`
  SELECT id, titel, lead, ort, beschrieb, content FROM agenda_items
  WHERE title_i18n='{}'::jsonb AND lead_i18n='{}'::jsonb
    AND ort_i18n='{}'::jsonb AND content_i18n='{}'::jsonb
`);
for (const row of toMigrate) {
  const contentBlocks = hasRichContent(row.content)
    ? row.content
    : contentBlocksFromParagraphs(row.beschrieb ?? []);
  await pool.query(`
    UPDATE agenda_items
       SET title_i18n = $1::jsonb,
           lead_i18n  = $2::jsonb,
           ort_i18n   = $3::jsonb,
           content_i18n = $4::jsonb
     WHERE id = $5
  `, [
    JSON.stringify(row.titel ? {de: row.titel} : {}),
    JSON.stringify(row.lead ? {de: row.lead} : {}),
    JSON.stringify(row.ort ? {de: row.ort} : {}),
    JSON.stringify({de: contentBlocks}),
    row.id,
  ]);
}
```

### Files to Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/schema.ts` | Modify | `ALTER TABLE agenda_items` + JS-Backfill-Loop |
| `src/lib/queries.ts` | Modify | `getAgendaItems(locale)` liest `*_i18n`, resolved via `t()`, returnt `*IsFallback`-Flags, filtert DE-locale-Entries ohne DE-Content |
| `src/components/AgendaItem.tsx` | Modify | `AgendaItemData`-Interface erweitern (`titleIsFallback`, `leadIsFallback`, `ortIsFallback`, `contentIsFallback`). Per-Feld `lang="de"`-Attribute. |
| `src/app/api/dashboard/agenda/route.ts` | Modify | POST/GET-Payload auf `*_i18n`. Validator mit null≠undefined-Trennung. Dual-Write Legacy. |
| `src/app/api/dashboard/agenda/[id]/route.ts` | Modify | PUT auf `*_i18n`. Validator null≠undefined. Dual-Write. Partial-update via dynamic SET. |
| `src/app/dashboard/components/AgendaSection.tsx` | Modify | Locale-Tabs, parallel-mounted Inputs (titel + lead + ort + RichTextEditor) per Locale, Completion-Badges in Liste, Auto-Save mit i18n-Shape. |
| `src/app/[locale]/layout.tsx` | Modify | `getAgendaItems(locale)` statt `()`. |
| `src/lib/seed.ts` | Modify | Fresh-Seed schreibt direkt `*_i18n` (verhindert leere JSONB-Spalten nach Seed). |

### Architecture Decisions

- **Einheitliches JSONB-per-field-Pattern** (Sprint 1+2 bewährt).
- **Sprint-2-Lessons präventiv anwenden**:
  1. Reader liest NUR `*_i18n` (Dual-Write Read-Isolation, `database.md`).
  2. Validator: `undefined = skip`, `null = 400` (api.md, neu).
  3. Per-Feld-Fallback-Flags + lang-Attribute per-Element (seo.md, neu).
- **`ort` als übersetzbar eingestuft** (nicht `ort_url`). Semantisch konsistent mit `kategorie` aus Sprint 2.
- **Auto-Save bleibt**: incomplete-i18n-drafts via `undefined` ausgelassen, nicht als leeres Objekt gesendet. Sonst würde Auto-Save den gerade editierten Entry leeren — siehe `lessons.md` 2026-04-14.

### Dependencies
- Kein neues Package, keine neuen Env-Vars.
- `contentBlocksFromParagraphs` aus Sprint 2 wiederverwendet.
- `t()`, `isEmptyField()`, `hasLocale()` aus `i18n-field.ts` wiederverwendet.
- Pattern-Referenzen: `patterns/database.md` (Dual-Write Read-Isolation), `patterns/api.md` (Partial-PUT undefined/null), `patterns/seo.md` (per-field lang).

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Event nur in DE, `/fr/` | Per-Feld-Fallback: `titel` erbt `<html lang="fr">`, aber `<h3 lang="de">` rendert mit korrektem Screen-Reader-Tag |
| Event mit leerem DE + gefülltem FR, `/de/` | Entry wird **nicht** gerendert (Sprint-2-Lesson P2: keine FR→DE Reverse-Fallback, sonst leakt FR auf DE-Seite) |
| Event mit DE-Titel, FR-Titel leer, FR-Lead gefüllt | `/fr/` rendert: `titel` mit `lang="de"`, `lead` ohne lang-Attribut (erbt fr). Mixed state, korrekt |
| Payload `{"title_i18n": null}` | 400 Invalid (Sprint-2-Lesson P1: Validator rejectet null) |
| Payload `{"title_i18n": {}}` | Gültig, Feld wird auf leer gesetzt (explicit clear) |
| Payload ohne `title_i18n` key | Skip, DB-Wert bleibt (partial PUT) |
| Auto-Save mit partiellem FR-Draft | `undefined`-Feld → nicht gesendet, DB-DE-Wert bleibt erhalten |
| Migration läuft zweimal | Idempotent (`WHERE *_i18n = '{}'` Check) |
| Event mit leerem `beschrieb` UND leerem `content` | `content_i18n.de = []`. Entry wird nicht gerendert (auch auf DE), weil `hasLocale(content_i18n, "de")` false |
| Event hat `content` mit length > 0 bei Migration | `content_i18n.de = content`, `beschrieb` ignoriert |
| Hashtag verweist auf archiviertes Projekt | Unverändert — Sprint-3-Scope ist i18n, nicht Hashtag-Lifecycle |

## Risks
- **Auto-Save-Regression:** Parallel-mounted RichTextEditor × 2 × Auto-Save kann State-Races produzieren. Mitigation: identisches Pattern wie AlitSection + ProjekteSection (bereits produktiv), Auto-Save nur auf aktivem Tab.
- **Images/Hashtags im Form-State beim Locale-Switch:** Diese sind single-locale — dürfen beim Tab-Wechsel nicht resettet werden. Form-State klar trennen: `{shared: {images, hashtags, datum, ...}, de: {...}, fr: {...}}`.
- **`seed.ts` schreibt Legacy-Felder** und muss i18n-mitziehen (Sprint-2 hatte selben Punkt). Verifizieren bei Fresh-DB-Bootstrap.
- **`ort` als übersetzbar** — falls der User das später doch single-locale haben möchte, ist das ein schneller Revert. Flag im PR als offene Scope-Frage wenn nötig.
- **Dashboard-Auto-Save sendet Agenda-Item via PUT**: bei i18n-Shape muss Autosave-Code den neuen Payload bauen — bei undefined-Feldern nicht leer senden.
- **Test-Coverage**: bestehende 52 Tests prüfen nicht Agenda-Payloads. Kein neuer Test erforderlich (Sprint-Contract definiert nur `pnpm test` grün), aber beim nächsten Sprint-Review empfehlenswert.

## Phasen-Roadmap (Info, nicht Teil des Sprint Contracts)
- **Sprint 4 (Journal)** — letzter Entity-Sprint. Felder: `title`, `lines` (legacy string[]), `content`, `footer`, evtl. `author`. Datum/Author-Slug/Hashtags bleiben.
- **Nach Sprint 4**: Cleanup-Sprint — Legacy-Spalten droppen, optional `images[].alt` / Hashtag-Label-Übersetzung, Translation-Progress-Dashboard.

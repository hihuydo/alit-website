# Spec: Dashboard "Über Alit" Tab + Datenschutz-PDF
<!-- Created: 2026-04-14 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Proposed -->

## Summary

Admin-editable Content für die öffentliche `/alit` Seite. Aktuell ist `src/components/nav-content/AlitContent.tsx` hardcoded JSX. Wird ersetzt durch strukturierte, DB-backed Sektionen mit eigenem Dashboard-Tab "Über Alit". Zusätzlich: dedizierter Datenschutz-PDF-Upload-Slot, der den bisherigen `<a href="#">Datenschutz</a>`-Platzhalter im Impressum verdrahtet.

## Context

- Aktuell: `AlitContent.tsx` enthält ~9 Sektionen als statisches JSX (Intro + Projektpartner, Vorstand, Ehemalige Vorstandsmitglieder, Geschäftsstelle, Kontoverbindung, Logo, Impressum, Datenschutz-Platzhalter)
- Alle anderen Content-Tabs (Agenda, Journal, Projekte) sind bereits DB-backed mit Dashboard-Editor
- Rich-Text-Infrastruktur (`RichTextEditor`, `JournalBlockRenderer`, `validateContent`) ist etabliert und wird wiederverwendet
- Medien-Tab akzeptiert bisher nur Image + Video (JPEG/PNG/GIF/WebP/MP4/WebM), kein PDF

## Requirements

### Must Have

1. **Datenmodell: strukturierte Sektionen**
   - Neue Tabelle `alit_sections(id, title nullable, content jsonb, sort_order, created_at, updated_at)`
   - `title` nullable (Intro-Block hat keine Überschrift)
   - `content` = Rich-Text im Journal-Schema (wiederverwendet `validateContent`)
   - `sort_order` für Drag & Drop, **ASC-read** (anders als agenda/journal "neueste oben"). Grund: die Anzeige-Reihenfolge ist inhaltlich kuratiert vom Admin, nicht chronologisch. Die Intro-Sonderbehandlung hängt NICHT an Position 1 (siehe Must-Have #5: Rendering-Regel per leerem `title`), der Admin kann frei reordern.

2. **Site-Settings-Tabelle für Datenschutz-PDF**
   - Neue Tabelle `site_settings(key text PRIMARY KEY, value text, updated_at)`
   - Erster Eintrag: `key="datenschutz_pdf_public_id"`, `value=<media.public_id>` oder NULL
   - Generisch gehalten für zukünftige site-level Config-Werte

3. **PDF-Upload im Medien-Tab**
   - `application/pdf` zu `ALLOWED_*_TYPES` ergänzen (eigene Kategorie oder zusammen mit Video-Limit)
   - Media-Delivery-Route (`/api/media/[id]`) für PDFs: `Content-Disposition: inline` + korrekter `Content-Type` (browser rendert Inline statt Download-Zwang)
   - MediaSection zeigt PDF-Thumbnails/Labels (kein `<img>` für PDFs — Fallback-Icon oder "PDF" Label + Filename)

4. **Dashboard-Tab "Über Alit"**
   - Neuer Tab neben Agenda/Journal/Projekte/Medien/Account
   - Liste der Sektionen mit Title (oder "(ohne Titel)"), Drag-Handle für Reorder
   - Add/Edit/Delete pro Sektion (Title + Rich-Text-Editor)
   - Unterhalb der Sektionsliste: separater Block "Datenschutz-PDF" mit: aktuellem PDF (Link + Filename), "Ändern" (öffnet MediaPicker gefiltert auf PDFs), "Entfernen"

5. **Public Page: Alit-Content aus DB**
   - `AlitContent.tsx` wird Server Component (oder gefüttert aus Server-Component-Parent), liest aus DB via `getAlitSections()`
   - **Rendering-Regel ist position-unabhängig:** Sektion mit `title` → `.content-section` Wrapper + `<h3 class="section-title">` + `<JournalBlockRenderer>`. Sektion **ohne** `title` → nur `<JournalBlockRenderer>` ohne Wrapper (wie der Intro-Block heute).
   - Drag & Drop kann damit frei sortieren, die Sonderbehandlung hängt nicht an Position 1 sondern am leeren `title`-Feld. Admin kann den Intro-Block beliebig verschieben oder duplizieren; die visuelle Konsistenz bleibt erhalten.
   - Datenschutz-Link: `<a href="/api/media/<pdf_public_id>">Datenschutz</a>` wenn PDF gesetzt, sonst **kein Link** (kein "#"-Fallback, kein kaputter Link)

6. **Seed-Migration für Bestandscontent**
   - Bei leerem `alit_sections` bootstrap die 9 Sektionen aus dem aktuellen AlitContent.tsx
   - Bestehende `<br>`-Listen (Projektpartner, Vorstand, etc.) als Rich-Text-Paragraphen mit Linebreak-Marks migrieren (oder als einzelne `<p>` pro Name — einfacher und besser editierbar)
   - Bestehende `<a>`-Links (info@alit.ch Mailto, Logo-Download) als Rich-Text-Link-Marks übernehmen

### Nice to Have

7. **Bilingual-Ready**: `locale` Spalte auf `alit_sections` (default `"de"`) vorbereiten, falls später Französisch dazukommt. UI bleibt zunächst single-locale.

### Out of Scope

- Multi-Locale Editor-UI (Spalte anlegen, aber nur `de` bearbeitbar)
- Section-Templates (vorgefertigte Layouts)
- Versioning/Undo für Sektionen
- Bildeinbettung innerhalb Sektionen (Rich-Text unterstützt es technisch, aber UI-Use-Case unklar; kein Block)
- Logo-Download-Asset-Migration (`public/Alit-Logo-GZD-...zip` bleibt static für diesen Sprint)

## Technical Approach

### Schema

```sql
CREATE TABLE IF NOT EXISTS alit_sections (
  id SERIAL PRIMARY KEY,
  title TEXT,
  content JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  locale TEXT NOT NULL DEFAULT 'de',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alit_sections_sort ON alit_sections(locale, sort_order);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/dashboard/alit` | GET | list all sections sorted ASC |
| `/api/dashboard/alit` | POST | create section |
| `/api/dashboard/alit/[id]` | PUT | update section (dynamic SET pattern, cf. journal blueprint) |
| `/api/dashboard/alit/[id]` | DELETE | delete section |
| `/api/dashboard/alit/reorder` | POST | same pattern as agenda/journal reorder |
| `/api/dashboard/settings/[key]` | GET | read site setting (auth required) |
| `/api/dashboard/settings/[key]` | PUT | write site setting |
| `/api/alit` (public, unauthenticated) | GET | list sections + datenschutz_pdf_public_id for public rendering |

Alternativ: public page reads DB direct via Server Component (no public API endpoint needed). **Bevorzugt**: Server Component direkt, vermeidet unnötigen API-Layer.

### Dashboard Tab

`src/app/dashboard/components/AlitSection.tsx`:
- Liste-View (wie JournalSection): drag-handle + title-preview + Bearbeiten/Löschen
- Detail-Editor: Title-Input (optional) + `RichTextEditor` mit `mediaEnabled={false}` (siehe RichTextEditor-Anpassung unten) + Save/Cancel + Autosave (Pattern aus JournalEditor übernehmen)
- Unter der Sektionsliste: "Datenschutz-Dokument" Card mit:
  - Aktueller Filename + Link (öffnet PDF)
  - "Ändern" → MediaPicker mit `accept="pdf"` prop
  - "Entfernen" → setzt Setting auf NULL

### RichTextEditor-Anpassung

Bildeinbettung in Alit-Sektionen ist explizit out of scope (s.o.). Der Editor exponiert heute Media-Insertion (Bild/Video/Embed). Umsetzung der Scope-Grenze:

- Neuer optionaler Prop `mediaEnabled?: boolean` (default `true` — kein Breaking-Change für JournalEditor / AgendaEditor)
- Wenn `false`: Toolbar-Buttons für Bild/Video/Embed nicht rendern; `insertHtml`-Pfade für Media-Insertion ignorieren
- `AlitSection` übergibt `mediaEnabled={false}` explizit. So bleibt die Grenze auch dann durchgesetzt, wenn Admin per Keyboard-Shortcut o.ä. Media einfügen will.
- Rich-Text-Links (inkl. `mailto:`) bleiben verfügbar — das ist keine Bildeinbettung im Sinne der Out-of-Scope-Regel.

### MediaPicker-Erweiterung

- Optional `accept?: "image" | "video" | "pdf"` prop (default: alle Typen sichtbar)
- Wenn `accept="pdf"`: Grid zeigt nur PDF-Dateien + PDF-Icon statt `<img>`
- Upload-Flow bleibt gleich, Backend validiert mime-type
- Einheitlicher Prop-Name `accept` — kein `filter`-Alias

### Files to Change

| File | Change | Description |
|------|--------|-------------|
| `src/lib/schema.ts` | Modify | Add alit_sections + site_settings tables |
| `src/lib/seed.ts` | Modify | Bootstrap alit_sections from legacy content |
| `src/content/de/alit.ts` | New | Static source for seed (mirrors AlitContent.tsx structure) |
| `src/lib/queries.ts` | Modify | `getAlitSections()`, `getSiteSetting(key)` |
| `src/components/nav-content/AlitContent.tsx` | Rewrite | Server Component reading from DB |
| `src/app/api/dashboard/media/route.ts` | Modify | Allow application/pdf |
| `src/app/api/media/[id]/route.ts` | Modify | PDF delivery with Content-Disposition |
| `src/app/api/dashboard/alit/route.ts` | New | GET (list) + POST (create) |
| `src/app/api/dashboard/alit/[id]/route.ts` | New | PUT + DELETE, journal-style dynamic SET |
| `src/app/api/dashboard/alit/reorder/route.ts` | New | Reorder endpoint |
| `src/app/api/dashboard/settings/[key]/route.ts` | New | GET + PUT |
| `src/app/dashboard/components/AlitSection.tsx` | New | Dashboard tab component |
| `src/lib/media-usage.ts` | Modify | Extend registry with `site_settings` source so the shared `buildUsageIndex()` also blocks deletion of a PDF that is referenced as Datenschutz |
| `src/app/dashboard/components/MediaPicker.tsx` | Modify | `accept` prop filter |
| `src/app/dashboard/components/RichTextEditor.tsx` | Modify | `mediaEnabled` prop (default true); hide media toolbar + skip media insertion when false |
| `src/app/dashboard/components/MediaSection.tsx` | Modify | Render PDF-items (icon + filename, no `<img>`) |
| `src/app/dashboard/page.tsx` (or tab registry) | Modify | Add "Über Alit" tab |

### Rich-Text-Body Validation

Reuse `validateContent` from `src/lib/journal-validation.ts` — it validates block types, mark types, image widths. No new validator needed.

### Autosave

JournalEditor's autosave pattern is well-tested (4 review rounds fixed edge cases). **Reuse its hook logic** — possibly extract to shared util if easy, else duplicate and reference. Don't reinvent.

## Edge Cases

| Case | Expected |
|------|----------|
| Leere `alit_sections` Tabelle (erste Migration) | Seed aus `src/content/de/alit.ts`; public page rendert normal |
| Kein Datenschutz-PDF gesetzt | Link im Impressum komplett weggelassen (keine "#"-Fallback-URLs) |
| PDF in Medien-Tab löschen, während als Datenschutz referenziert | DELETE blockt mit 409 (wie Journal/Agenda via Registry) — Registry um site_settings-Check erweitern |
| Sektion ohne Title (z.B. Intro) | Kein `<h3>` UND kein `.content-section` Wrapper (Rendering hängt am Title, nicht an Position — reorder-safe) |
| Sektion-Content leer `[]` | Sektion trotzdem gerendert (Admin-Intent) |
| Reorder während anderer User editiert | Standard optimistic-Update; bei Konflikt letzter Write gewinnt (gleich wie journal) |

## Done Criteria

- [ ] `alit_sections` + `site_settings` Tabellen per `ensureAppSchema()` idempotent angelegt
- [ ] `seed.ts` bootstrapped 9 Sektionen aus `src/content/de/alit.ts` wenn leer
- [ ] Public `/alit` Seite rendert vollständig aus DB, Layout visuell identisch zum Ist-Stand (screenshot-diff akzeptabel bis auf dynamische Inhalte)
- [ ] Dashboard-Tab "Über Alit" verfügbar: List + Add + Edit (Rich-Text) + Delete + Reorder funktioniert
- [ ] MediaPicker akzeptiert `accept="pdf"` Filter; Upload von PDF funktioniert
- [ ] Datenschutz-Slot im Alit-Tab: PDF setzen/ändern/entfernen
- [ ] Datenschutz-Link im Impressum zeigt auf `/api/media/<uuid>` wenn gesetzt, sonst kein Link
- [ ] PDF-URL in Browser öffnet Inline (Content-Disposition: inline, Content-Type: application/pdf)
- [ ] Media-Registry (PR #27) um site_settings-Scan erweitert: PDF, das als Datenschutz referenziert ist, kann nicht gelöscht werden (409)
- [ ] `pnpm build` clean, `pnpm lint` clean, `pnpm test` 26/26 passend (keine Test-Regression)
- [ ] Sonnet pre-push Review ohne [Critical]/[Important]

## Risks

- **Content-Migration verliert Nuancen**: Bestehende `<br>`-Listen (Vorstand-Namen als Zeilenumbrüche im selben `<p>`) vs. einzelne `<p>`s. Mitigation: Seed-Vorlage im Code mit beiden Entscheidungen durchgespielt, bevor Seed läuft. Admin kann nachträglich korrigieren.
- **PDF Content-Disposition** in nginx vs. Next.js: Reverse-Proxy könnte Content-Disposition überschreiben. Mitigation: erst in Staging testen (`curl -I` auf die URL), bevor Production-Deploy.
- **Sprint-Scope groß**: 13 Files Change/New + Schema-Migration + Content-Migration + 3 neue API-Routes + neuer Dashboard-Tab. Mitigation: klare Phase-Trennung (siehe Exit-Strategie).
- **Media-Registry-Erweiterung**: `site_settings` ist keine "Tabelle mit Rich-Text"; der bisherige Scanner matched nur refText-Substrings. Site-Settings-Check ist ein simpler SELECT nach `value = <public_id>` — anderer Lookup-Typ. Mitigation: Registry um zweiten Source-Typ erweitern (`lookupByPublicId` neben `refText`-Scan), oder site_settings synthetisch als refText-Row behandeln.

## Exit-Strategie

Sprint in 3 Phasen aufteilbar, jede mergeable für sich:

**Phase 1 — Read-Only-Migration** (2-3 Commits)
- Schema + Seed + public Page liest aus DB
- Keine Dashboard-Änderung, keine PDF-Features
- Sofortige Ship-Fähigkeit: entspricht Ist-Zustand, nur DB-backed

**Phase 2 — Dashboard-Editor** (3-4 Commits)
- Dashboard-Tab + API-Routes + CRUD + Reorder
- Ship: Admin kann Content editieren, Datenschutz bleibt "#"-Placeholder

**Phase 3 — PDF-Support** (2-3 Commits)
- Media PDF-Upload + MediaPicker-Filter + Datenschutz-Slot + Public-Link-Wiring
- Ship: Datenschutz-Link geht, Todo-Item erledigt

Wenn während Phase 1 oder 2 ein Blocker auftaucht: Phase abschließen, mergen, Restphase in neuen Sprint verschieben.

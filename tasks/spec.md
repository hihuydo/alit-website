# Spec: Medien-Tab + Medien-Upload im Journal-Editor
<!-- Created: 2026-04-11 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary
Neuer "Medien"-Tab im Dashboard für Medien-Upload und -Verwaltung. Bilder, GIFs und Videos werden in PostgreSQL gespeichert und über eine API-Route ausgeliefert. Im Rich-Text-Editor kann man Medien aus der Medienbibliothek an beliebiger Stelle im Text einfügen.

## Context
- Dashboard hat 4 Tabs: Agenda, Journal, Projekte, Konto
- Bilder liegen aktuell als statische Dateien in `public/journal/` (3 Bilder: `trobadora-buch.png`, `trobadora-lesung.png`, `kanon-aktion.png`)
- Docker-Container hat keine Volumes/Bind-Mounts — Filesystem-Uploads gehen bei Rebuild verloren
- Benutzer hat explizit DB-Speicherung gewünscht
- Für die kleine Menge Bilder (Admin-only, <100 erwartet) ist PostgreSQL `bytea` praktikabel und eliminiert Volume-Management
- Kein bestehendes Upload-Mechanism im Projekt

## Requirements

### Must Have
1. **DB-Tabelle `media`** — speichert Medien als `bytea`, mit Metadaten (filename, mime_type, size, created_at)
2. **API: Upload** — `POST /api/dashboard/media/` akzeptiert `multipart/form-data`, max 5 MB für Bilder/GIFs, max 50 MB für Videos
3. **API: Ausliefern** — `GET /api/media/[id]/` liefert die Datei mit korrektem Content-Type und Cache-Headern (kein Auth — Medien sind öffentlich)
4. **API: Liste** — `GET /api/dashboard/media/` gibt Metadaten aller Medien zurück (ohne Binärdaten)
5. **API: Löschen** — `DELETE /api/dashboard/media/[id]/` löscht ein Medium
6. **Dashboard: Medien-Tab** — Grid-Ansicht aller Medien mit Upload-Button und Löschen. Bilder/GIFs zeigen Thumbnail, Videos zeigen Platzhalter-Icon
7. **Editor: Medien-einfügen** — Toolbar-Button "Medien" öffnet MediaPicker-Modal. Nach Auswahl: Caption-Feld (optional). Bilder/GIFs als `<figure><img></figure>`, Videos als `<figure><video controls><source></video></figure>` einfügen
8. **Migration** — Button im Medien-Tab: bestehende Bilder aus `public/journal/` in DB migrieren
9. **Block-Typ `video`** — neuer JournalBlock-Typ für selbst-gehostete Videos, mit `src`, `caption`, `mime_type`
10. **Block-Typ `embed`** — neuer JournalBlock-Typ für externe Videos (YouTube, Vimeo). Speichert nur die URL, rendert als `<iframe>` mit `caption`
11. **Public Rendering** — `JournalBlockRenderer` rendert `video`-Blöcke als `<video controls>`, `embed`-Blöcke als responsive `<iframe>`
12. **Editor: Embed-einfügen** — Toolbar-Button "Embed" öffnet URL-Input. Akzeptiert YouTube/Vimeo-URLs, extrahiert automatisch die Embed-URL

### Nice to Have
- Alt-Text beim Einfügen editierbar
- Drag & Drop Upload

### Out of Scope
- Bildbearbeitung (Crop, Resize)
- Ordner/Kategorien
- Mehrfach-Upload
- CDN/externe Hosting

## Technical Approach

### Files to Change/Create

| File | Type | Description |
|------|------|-------------|
| `src/lib/schema.ts` | Modify | `media`-Tabelle hinzufügen |
| `src/app/api/dashboard/media/route.ts` | Create | GET (Liste) + POST (Upload) |
| `src/app/api/dashboard/media/[id]/route.ts` | Create | DELETE |
| `src/app/api/media/[id]/route.ts` | Create | GET (öffentlich, Bild ausliefern mit Cache-Headern) |
| `src/app/dashboard/components/MediaSection.tsx` | Create | Medien-Tab UI (Grid + Upload) |
| `src/app/dashboard/components/MediaPicker.tsx` | Create | Modal für Bildauswahl im Editor |
| `src/app/dashboard/page.tsx` | Modify | 5. Tab "Medien" hinzufügen + Daten laden |
| `src/app/dashboard/components/RichTextEditor.tsx` | Modify | Bild-Button in Toolbar + MediaPicker-Anbindung |
| `src/app/dashboard/components/JournalEditor.tsx` | Modify | MediaPicker-State durchreichen |

### DB Schema

```sql
CREATE TABLE IF NOT EXISTS media (
  id         SERIAL PRIMARY KEY,
  filename   TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  size       INT NOT NULL,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Architecture Decisions

1. **PostgreSQL `bytea` statt Filesystem** — kein Volume-Management, kein nginx-Config, Backup in pg_dump inkludiert. Bei <100 Bildern und Admin-only kein Performance-Problem.

2. **Öffentliche Auslieferung ohne Auth** (`/api/media/[id]/`) — Bilder sind Website-Content. Cache: `public, max-age=31536000, immutable` (ID ist stabil, kein Update-Endpoint).

3. **MediaPicker als Modal** — öffnet sich über dem Editor, zeigt Grid, Klick wählt aus und fügt ein. Erlaubt auch direkten Upload aus dem Modal.

4. **Bild im Editor als `<figure>`** — passt zum bestehenden `blocksToHtml`/`htmlToBlocks` Roundtrip.

5. **Bild-src wird `/api/media/[id]/`** — statt `/journal/filename.png`. Bestehende `/journal/`-Pfade funktionieren weiterhin (static files in `public/`).

### Constraints
- Max Upload: 5 MB für Bilder/GIFs, 50 MB für Videos (server-side check)
- Erlaubte MIME-Typen: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `video/mp4`, `video/webm`
- Next.js `bodyParser: false` für die Upload-Route (FormData Handling)

### Neue Block Types
```ts
| { id: string; type: "video"; src: string; mime_type: string; caption?: string }
| { id: string; type: "embed"; url: string; caption?: string }
```
- `video` — selbst-gehostete Datei aus der Medienbibliothek
- `embed` — externe URL (YouTube/Vimeo), gespeichert als Watch-URL, zur Render-Zeit in Embed-URL konvertiert
- Erlaubte Embed-Hosts: `youtube.com`, `youtu.be`, `vimeo.com`
- URL-Parsing: `youtube.com/watch?v=ID` → `youtube.com/embed/ID`, `vimeo.com/ID` → `player.vimeo.com/video/ID`

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Bild > 5 MB | 413 mit Fehlermeldung |
| Video > 50 MB | 413 mit Fehlermeldung |
| Nicht erlaubter Dateityp | 400 mit Fehlermeldung |
| Bild löschen das im Journal verwendet wird | Erlaubt (User-Verantwortung) |
| Medien-Tab leer | Leerer State mit Upload-Hinweis |
| Cursor nicht im Editor bei Bild-Einfügen | Bild ans Ende anhängen |
| Migration: Bild aus public/journal/ existiert nicht | Überspringen mit Warnung |

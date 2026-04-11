# Spec: Medien-Tab + Bild-Upload im Journal-Editor
<!-- Created: 2026-04-11 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Draft -->

## Summary
Neuer "Medien"-Tab im Dashboard für Bild-Upload und -Verwaltung. Bilder werden in PostgreSQL gespeichert und über eine API-Route ausgeliefert. Im Rich-Text-Editor kann man Bilder aus der Medienbibliothek an beliebiger Stelle im Text einfügen.

## Context
- Dashboard hat 4 Tabs: Agenda, Journal, Projekte, Konto
- Bilder liegen aktuell als statische Dateien in `public/journal/` (3 Bilder: `trobadora-buch.png`, `trobadora-lesung.png`, `kanon-aktion.png`)
- Docker-Container hat keine Volumes/Bind-Mounts — Filesystem-Uploads gehen bei Rebuild verloren
- Benutzer hat explizit DB-Speicherung gewünscht
- Für die kleine Menge Bilder (Admin-only, <100 erwartet) ist PostgreSQL `bytea` praktikabel und eliminiert Volume-Management
- Kein bestehendes Upload-Mechanism im Projekt

## Requirements

### Must Have
1. **DB-Tabelle `media`** — speichert Bilder als `bytea`, mit Metadaten (filename, mime_type, size, created_at)
2. **API: Upload** — `POST /api/dashboard/media/` akzeptiert `multipart/form-data`, max 5 MB pro Bild, nur Bildtypen (jpeg, png, gif, webp)
3. **API: Ausliefern** — `GET /api/media/[id]/route.ts` liefert das Bild mit korrektem Content-Type und Cache-Headern (kein Auth — Bilder sind öffentlich)
4. **API: Liste** — `GET /api/dashboard/media/` gibt Metadaten + Thumbnail-URL aller Bilder zurück (ohne Binärdaten)
5. **API: Löschen** — `DELETE /api/dashboard/media/[id]/` löscht ein Bild
6. **Dashboard: Medien-Tab** — Grid-Ansicht aller Bilder mit Upload-Button und Löschen pro Bild
7. **Editor: Bild-einfügen** — Toolbar-Button "Bild" öffnet MediaPicker-Modal mit Medienbibliothek, Klick fügt `<figure><img></figure>` an der Cursorposition ein
8. **Migration** — Button im Medien-Tab: bestehende Bilder aus `public/journal/` in DB migrieren

### Nice to Have
- Alt-Text und Caption beim Einfügen editierbar
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
- Max Upload: 5 MB (server-side check)
- Erlaubte MIME-Typen: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Next.js `bodyParser: false` für die Upload-Route (FormData Handling)

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Upload > 5 MB | 413 mit Fehlermeldung |
| Nicht-Bild-Datei | 400 mit Fehlermeldung |
| Bild löschen das im Journal verwendet wird | Erlaubt (User-Verantwortung) |
| Medien-Tab leer | Leerer State mit Upload-Hinweis |
| Cursor nicht im Editor bei Bild-Einfügen | Bild ans Ende anhängen |
| Migration: Bild aus public/journal/ existiert nicht | Überspringen mit Warnung |

# Sprint: Medien-Tab + Bild-Upload
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-11 -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] `pnpm build` ohne TypeScript-Fehler
- [ ] `POST /api/dashboard/media/` akzeptiert JPEG-Upload und gibt `{ success: true, id: N }` zurück
- [ ] `POST /api/dashboard/media/` lehnt Datei > 5 MB mit 413 ab
- [ ] `POST /api/dashboard/media/` lehnt Nicht-Bild mit 400 ab
- [ ] `GET /api/media/[id]/` liefert Bild mit korrektem Content-Type und Cache-Headern
- [ ] `GET /api/dashboard/media/` gibt Liste aller Medien mit Metadaten zurück
- [ ] `DELETE /api/dashboard/media/[id]/` löscht Bild und gibt 200 zurück
- [ ] Dashboard zeigt 5. Tab "Medien" mit Grid aller hochgeladenen Bilder
- [ ] Upload-Button im Medien-Tab funktioniert (Datei auswählen → Upload → Bild erscheint im Grid)
- [ ] Bild-Button in der Editor-Toolbar öffnet MediaPicker-Modal
- [ ] Klick auf Bild im MediaPicker fügt `<figure><img></figure>` in den Editor ein
- [ ] Eingefügtes Bild wird nach Save/Reload korrekt als image-Block persistiert
- [ ] Eingefügtes Bild wird im Public Journal korrekt gerendert

## Tasks

### Phase 1: DB + API
- [ ] `media`-Tabelle in `schema.ts` hinzufügen
- [ ] `POST /api/dashboard/media/` — Upload mit Validierung
- [ ] `GET /api/dashboard/media/` — Liste (Metadaten only)
- [ ] `DELETE /api/dashboard/media/[id]/` — Löschen
- [ ] `GET /api/media/[id]/` — Öffentliche Auslieferung mit Cache

### Phase 2: Dashboard Medien-Tab
- [ ] `MediaSection.tsx` — Grid + Upload-UI + Löschen
- [ ] `page.tsx` — 5. Tab "Medien" einbinden + Daten laden

### Phase 3: Editor-Integration
- [ ] `MediaPicker.tsx` — Modal mit Medienbibliothek + Upload-Option
- [ ] `RichTextEditor.tsx` — Bild-Button in Toolbar + Picker-Anbindung
- [ ] `JournalEditor.tsx` — MediaPicker-State durchreichen

### Phase 4: Migration (Nice to Have)
- [ ] Migration-Button: `public/journal/`-Bilder in DB importieren

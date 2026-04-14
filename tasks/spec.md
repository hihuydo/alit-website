# Spec: Phase 3 — PDF + ZIP Uploads im Medien-Tab
<!-- Created: 2026-04-14 -->
<!-- Author: Planner (Claude) -->
<!-- Status: Proposed -->
<!-- Supersedes earlier Datenschutz-Slot concept per user change-request -->

## Summary

Der Medien-Tab akzeptiert neben Bildern und Videos auch PDF- und ZIP-Dateien. Admin kann Dateien hochladen, URL kopieren und in beliebigen Rich-Text-Editor (Journal, Agenda, Alit) als Link einfügen. Keine dedizierte Datenschutz-UI — der Datenschutz-Link wird vom Admin manuell in die Impressum-Sektion eingefügt (kopiere Media-URL, editiere Sektion, setze `href`).

## Context

Ursprüngliche Phase-3-Planung sah einen dedizierten Datenschutz-Slot im Alit-Tab vor + `site_settings.datenschutz_pdf_public_id`. Per User-Änderungswunsch am 2026-04-14: Slot entfällt, PDF-Link wird wie jeder andere Link im Content gepflegt. Konsistent mit existierendem Workflow für Bild-/Video-Links.

Phases 1 + 2 bereits live (PR #29, #30). Diese Spec deckt ausschließlich Phase 3.

## Requirements

### Must Have

1. **Upload akzeptiert PDF + ZIP**
   - `application/pdf` und `application/zip` (plus `application/x-zip-compressed` als Alias) zu den erlaubten Mime-Types im Upload-Endpoint (`POST /api/dashboard/media`)
   - Größen-Limit: gleiches Limit wie Video (`MAX_VIDEO_SIZE = 50 MB`) — PDF/ZIP können groß werden, Bilder-Limit (5 MB) wäre zu eng
   - Client-seitige Vorab-Check in MediaSection analog zu existierenden Image/Video-Flows

2. **Media-Delivery mit passender Content-Disposition**
   - `GET /api/media/[id]` setzt `Content-Disposition` abhängig vom Mime-Type:
     - `application/pdf` → `inline; filename="<sanitized>.pdf"` (Browser rendert inline)
     - `application/zip` → `attachment; filename="<sanitized>.zip"` (Browser lädt herunter)
     - Bilder/Videos → bisheriges Verhalten (kein Content-Disposition oder `inline`)
   - `Content-Type` entspricht der DB-Spalte `media.mime_type`

3. **MediaSection zeigt Non-Image-Tiles**
   - PDF-Kacheln: rotes "PDF"-Label + Filename (kein `<img>`-Thumbnail — gibt's nicht)
   - ZIP-Kacheln: graues "ZIP"-Label + Filename
   - URL-kopieren-Button funktioniert identisch zu Image/Video-Kacheln
   - Einbettungen in den Editor (Toolbar-Button "Medien") sind für PDF/ZIP NICHT sinnvoll (das sind keine einzubettenden Media-Objekte, sondern Download-Links). Im MediaPicker bleiben PDF/ZIP sichtbar, werden aber beim Auswählen als Block nicht eingefügt — nur die URL wird kopierbar gemacht

4. **Media-Usage-Registry deckt alit_sections ab**
   - `src/lib/media-usage.ts` um eine dritte `MediaRefSource` erweitern: scanne `alit_sections.content::text` nach `/api/media/<uuid>` Substring (identisch zum Journal/Agenda-Pattern)
   - `MediaUsage.kind` Typ-Union erweitert um `"alit"`
   - Wirkung: ein PDF, das als Link in einer Alit-Sektion (z.B. Datenschutz) eingebettet ist, kann nicht gelöscht werden (409 mit Hinweis auf den referenzierten Abschnitt) — gleicher Schutz wie für Bilder in Journal/Agenda

### Nice to Have

5. **Logo-ZIP-Migration** (optional)
   - Das existierende `/public/Alit-Logo-GZD-191030_Presse.zip` in den Medien-Tab hochladen, URL im `content/de/alit.ts` Seed ersetzen
   - Vorteil: alles admin-managed, kein verwaister Static-Asset
   - Migration: DB-Update der Logo-Sektion per SQL nach Upload (admin manuell, einmalig)

### Out of Scope

- Dediziertes Datenschutz-Feld im Alit-Tab (ursprünglich geplant, verworfen)
- `site_settings.datenschutz_pdf_public_id` (die Tabelle aus Phase 1 bleibt leer stehen für spätere generische Use-Cases)
- MediaPicker `accept="pdf"` Filter (ursprünglich geplant, nicht nötig — Admin kopiert URL manuell, kein Picker-Flow)
- `mediaEnabled={false}` RichTextEditor-Prop (ursprünglich geplant, nicht nötig — das Omit-onOpenMediaPicker-Pattern hat die gleiche Wirkung)
- Versioning, Access-Control pro Datei, Thumbnail-Generation für PDFs

## Technical Approach

### Mime-Type-Handling

```ts
// src/app/api/dashboard/media/route.ts
const ALLOWED_IMAGE_TYPES = new Set([...]); // unchanged
const ALLOWED_VIDEO_TYPES = new Set([...]); // unchanged
const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed", // legacy Windows IE/Edge alias
]);
```

Validierung:
- `isImage`, `isVideo`, `isDocument` berechnen
- Akzeptieren wenn einer davon true
- Size-Limit: 5 MB für Image, 50 MB sonst

### Content-Disposition-Logik

```ts
// src/app/api/media/[id]/route.ts
function dispositionFor(mimeType: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (mimeType === "application/pdf") return `inline; filename="${safeName}"`;
  if (mimeType.startsWith("application/")) return `attachment; filename="${safeName}"`;
  return ""; // default for image/video — browser handles inline
}
```

Response-Header `Content-Disposition` nur setzen wenn nicht-empty.

### MediaSection Tile-Rendering

Komponente bekommt ein neues `<MediaTile>` für Nicht-Bild/Video-Typen:
```tsx
function isDocument(m: MediaItem) {
  return m.mime_type === "application/pdf" ||
         m.mime_type === "application/zip" ||
         m.mime_type === "application/x-zip-compressed";
}

// In render:
{isImage(m) ? <img ... /> :
 isVideo(m) ? <video ... /> :
 isDocument(m) ? <DocumentTile mimeType={m.mime_type} filename={m.filename} /> :
 <FallbackTile />}
```

`DocumentTile` rendert ein CSS-Badge (`bg-red-100 text-red-700` für PDF, `bg-gray-200 text-gray-700` für ZIP) + Filename.

### Registry-Erweiterung

```ts
// src/lib/media-usage.ts
export const MEDIA_REF_SOURCES: readonly MediaRefSource[] = Object.freeze([
  { kind: "journal", ... },
  { kind: "agenda", ... },
  {
    kind: "alit",
    fetch: async () => {
      const { rows } = await pool.query<{ id: number; title: string | null; content_text: string | null }>(
        "SELECT id, title, content::text as content_text FROM alit_sections WHERE locale = 'de'"
      );
      return rows.map((r) => ({
        id: r.id,
        label: r.title ?? "(Intro)",
        refText: r.content_text ?? "",
      }));
    },
  },
]);

// Und:
export type MediaUsage = {
  kind: "journal" | "agenda" | "alit";
  id: number;
  label: string;
};
```

### Files to Change

| File | Change | Description |
|------|--------|-------------|
| `src/app/api/dashboard/media/route.ts` | Modify | Add ALLOWED_DOCUMENT_TYPES + size-limit branch |
| `src/app/api/media/[id]/route.ts` | Modify | Content-Disposition per mime-type |
| `src/app/dashboard/components/MediaSection.tsx` | Modify | DocumentTile for PDF/ZIP, isDocument guard |
| `src/app/dashboard/components/MediaPicker.tsx` | Modify | Show PDF/ZIP in grid; insertion behavior unchanged or suppressed (TBD during implementation) |
| `src/lib/media-usage.ts` | Modify | Third registry entry for `alit_sections`; extend `MediaUsage.kind` union |

## Edge Cases

| Case | Expected |
|------|----------|
| Upload einer 48 MB PDF | Erfolgreich (unter 50 MB) |
| Upload einer 52 MB ZIP | 413 (über MAX_VIDEO_SIZE) |
| GET einer PDF via Browser | Zeigt inline im Viewer |
| GET einer ZIP via Browser | Löst Download aus |
| DELETE einer PDF, die in einer Alit-Sektion verlinkt ist | 409 mit `used_in: [{ kind: "alit", id, label }]` |
| Unbekannter Mime-Type im DB-Datensatz (z.B. `application/octet-stream` von legacy Upload) | Content-Disposition nicht gesetzt; Browser entscheidet basierend auf Content-Type |
| Windows-IE-Zip (`application/x-zip-compressed`) | Akzeptiert beim Upload + treated wie `application/zip` beim Disposition |

## Done Criteria

- [ ] PDF-Upload via Dashboard funktioniert (success response, file in media tabel)
- [ ] ZIP-Upload via Dashboard funktioniert
- [ ] PDF-URL im Browser öffnet inline (Browser-Viewer)
- [ ] ZIP-URL im Browser löst Download aus
- [ ] MediaSection zeigt hochgeladene PDFs/ZIPs mit Filename (keine broken `<img>`)
- [ ] URL-kopieren-Button funktioniert für PDF/ZIP
- [ ] Registry blockt DELETE eines PDFs, das in einer Alit-Sektion verlinkt ist (manuell getestet)
- [ ] `pnpm build` clean, `pnpm lint` clean, `pnpm test` (26/26)
- [ ] Sonnet pre-push CLEAN
- [ ] Codex Review CLEAN (oder Findings behoben)

## Risks

- **MediaPicker-Integration unklar**: Der MediaPicker zeigt heute Bilder/Videos zum Einbetten-als-Block in den Rich-Text. PDF/ZIP sind als Block nicht sinnvoll (Browser kann kein `<pdf>`-Tag einbetten, Download-Links gehören in normalen Rich-Text-Link-Flow). Zwei Optionen:
  1. PDFs/ZIPs im Picker zeigen, aber Auswahl fügt einen Link-Block ein statt einer `<img>`/`<video>` Embed-Box — Admin wählt direkt im Picker und fertig
  2. PDFs/ZIPs im Picker nicht anzeigen; Admin kopiert URL aus MediaSection und fügt Link manuell via Toolbar-"Link"-Button ein
  
  Option 2 ist einfacher (kein neuer Block-Type, weniger UI-Änderungen) und konsistent mit dem User-Wunsch ("URL kopieren, Link einfügen"). Empfehlung: Option 2. Während Implementation überprüfen, ob sich das als usable anfühlt.

- **Content-Disposition `inline` vs `attachment` Edge-Case**: Einige Browser ignorieren `inline` bei bestimmten Mime-Types oder fragen User. Test auf Safari + Chrome + Firefox nach Deploy.

- **Media-Usage-Registry hat Phase-1-/2-Commits überlebt**: Wenn Phase 3 die Registry erweitert, müssen wir achten dass bestehende Tests (`media-usage.test.ts`, 26 Tests grün) nicht brechen. Neue Tests für `alit`-Kind dazu.

- **Logo-ZIP (Nice-to-Have) vs. Must-Have-Interaktion**: Das statische Logo-ZIP bleibt bestehen, wenn das Nice-to-Have nicht gemacht wird. Kein Blocker.

## Done für Phase 3 = abgeschlossen für gesamte "Über Alit" Spec

Phase 1 (read-only DB-migration) und Phase 2 (dashboard editor + CRUD) sind live. Nach Phase 3 ist die gesamte Über-Alit-Spec geschlossen.

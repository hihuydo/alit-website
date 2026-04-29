# Instagram Layout Overrides — Plan

## Ziel

Der Instagram-Export soll weiterhin automatisch aus Agenda-Einträgen generiert
werden, aber Redakteur:innen sollen im Export-Modal die Textverteilung pro
Slide manuell korrigieren können.

Use cases:

- Text bewusst auf die nächste Slide schieben.
- Text von einer späteren Slide zurückholen.
- Ab einem bestimmten Textblock eine neue Slide beginnen.
- Manuelles Layout zurücksetzen und wieder automatisch verteilen.

Der aktuelle Auto-Split bleibt der Default und erzeugt den ersten Vorschlag.
Manuelle Eingriffe sind ein Override, kein Ersatz für Auto-Layout.

## Empfehlung

Direkt mit persistierten Overrides bauen, nicht als rein clientseitiges MVP.

Grund: Die PNG-Preview und Downloads werden serverseitig über einzelne
`instagram-slide/[slideIdx]` URLs gerendert. Ein rein temporärer Client-State
wäre schwer konsistent an alle Slide-URLs und ZIP-Downloads zu übergeben.
Persistenz passt besser zur bestehenden Architektur und macht Preview,
Download und Reload konsistent.

## Datenmodell

Neue optionale JSONB-Spalte auf `agenda_items`:

```sql
instagram_layout_i18n JSONB NULL
```

Vorgeschlagener Shape:

```ts
type InstagramLayoutOverrides = {
  de?: InstagramLayoutOverride | null;
  fr?: InstagramLayoutOverride | null;
};

type InstagramLayoutOverride = {
  contentHash: string;
  imageCount: number;
  slides: InstagramLayoutSlide[];
};

type InstagramLayoutSlide = {
  blocks: string[];
};
```

`blocks` referenziert stabile exportierbare Textblock-IDs.

Für originale RichText-Blöcke:

```ts
block:<journalBlockId>
```

Für automatisch gesplittete Segmente langer Absätze:

```ts
block:<journalBlockId>:segment:<index>
```

Falls ein exportierbarer Block keine stabile ID hat, defensive Fallback-ID nur
aus Hash + Position generieren und als nicht ideal kommentieren. Das bestehende
RichText-Modell hat aber bereits `id`.

## Content Hash

Der Override muss erkennen, ob er veraltet ist.

Hash-Eingaben:

- `title_i18n[locale]`
- `lead_i18n[locale]`
- `content_i18n[locale]`
- `hashtags`
- `images`
- `images_grid_columns`
- `imageCount`

Wenn `contentHash` nicht mehr passt:

- Modal zeigt Hinweis `Layout ist veraltet`.
- Aktionen: `Automatisch neu verteilen`, optional `Trotzdem verwenden`.
- Default sollte Auto-Layout sein, wenn Override stale ist.

## Pure Logic

`src/lib/instagram-post.ts` erweitern:

1. Exportierbare Blocks mit stabiler ID erzeugen.

```ts
type ExportBlock = SlideBlock & {
  id: string;
  sourceBlockId: string;
  segmentIndex?: number;
};
```

2. Auto-Splitting erzeugt weiterhin `Slide[]`, aber intern aus `ExportBlock[]`.

3. Neue optionale Eingabe für Overrides:

```ts
splitAgendaIntoSlides(item, locale, imageCount, layoutOverride?)
```

4. Wenn Override gültig ist:

- Slide-Gruppen aus `override.slides[].blocks` bauen.
- Unbekannte Block-IDs ignorieren oder als stale behandeln.
- Nicht referenzierte aktuelle Blocks automatisch anhängen oder stale behandeln.

Empfehlung: streng starten. Wenn IDs fehlen oder neue Blocks nicht referenziert
sind, Override als stale markieren und Auto-Layout nutzen.

5. Wenn kein Override oder stale:

- aktueller Auto-Algorithmus bleibt aktiv.

## API

Neue Dashboard-API:

```txt
GET    /api/dashboard/agenda/:id/instagram-layout?locale=de&images=0
PUT    /api/dashboard/agenda/:id/instagram-layout
DELETE /api/dashboard/agenda/:id/instagram-layout?locale=de&images=0
```

`GET` gibt zurück:

```ts
{
  success: true,
  mode: "auto" | "manual" | "stale";
  contentHash: string;
  imageCount: number;
  slides: Array<{
    index: number;
    blocks: Array<{
      id: string;
      text: string;
      isHeading: boolean;
    }>;
  }>;
}
```

`PUT` speichert:

```ts
{
  locale: "de" | "fr";
  imageCount: number;
  contentHash: string;
  slides: Array<{ blocks: string[] }>;
}
```

`DELETE` entfernt den Override für diese Locale und diesen Image-State.

Alle Mutationen laufen durch bestehende Dashboard-Auth + CSRF via
`dashboardFetch`.

## Slide Rendering

Bestehende Routen erweitern:

- `GET /api/dashboard/agenda/:id/instagram`
- `GET /api/dashboard/agenda/:id/instagram-slide/:slideIdx`

Beide müssen denselben Layout-Resolver verwenden:

```ts
resolveInstagramSlides(item, locale, imageCount)
```

Der Resolver entscheidet:

- gültiger Override vorhanden -> manuelles Layout
- kein Override -> Auto-Layout
- stale Override -> Auto-Layout + Warning `layout_stale`

Metadata-Route sollte `warnings` um `layout_stale` erweitern.

## Modal UX

`InstagramExportModal` bekommt einen zweiten Modus:

```txt
Vorschau | Layout anpassen
```

Layout-Modus:

- Zeigt Slides als einfache Listen von Textblöcken.
- Jeder Block hat gekürzten Textauszug und Controls.
- Controls:
  - `Zur vorherigen Slide`
  - `Zur nächsten Slide`
  - `Neue Slide ab hier`
- Footer-Aktionen:
  - `Speichern`
  - `Automatisch neu verteilen`
  - `Abbrechen`

Kein Drag-and-drop im ersten Sprint. Buttons sind stabiler, leichter testbar und
reichen für den Workflow.

Nach `Speichern`:

- Metadata neu laden.
- Preview-URLs mit neuem `cacheBust` aktualisieren.

## Tests

Pure Tests in `src/lib/instagram-post.test.ts`:

- Auto-Fallback ohne Override.
- Gültiger Override verändert Slide-Gruppen.
- Stale `contentHash` nutzt Auto-Layout.
- Unknown block id macht Override stale.
- Nicht referenzierte aktuelle Blocks machen Override stale.
- Grid-Pfad: Grid-Slide bleibt Slide 1, Override wirkt nur auf Text-Slides.
- No-image-Pfad: Override wirkt ab Slide 1.

API-Tests:

- `GET instagram-layout` liefert Auto-Layout.
- `PUT instagram-layout` speichert Locale-spezifisch.
- `DELETE instagram-layout` resetet Locale-spezifisch.
- Bestehende `instagram` Metadata-Route gibt bei gültigem Override passende
  `slideCount`.
- Slide-Route rendert anhand Override.

UI-Tests:

- Layout-Modus öffnet.
- Block kann auf nächste Slide verschoben werden.
- Block kann auf vorherige Slide verschoben werden.
- `Neue Slide ab hier` erzeugt zusätzliche Gruppe.
- Reset ruft DELETE und lädt Preview neu.
- Stale-Hinweis wird angezeigt, wenn API `mode: "stale"` liefert.

## Umsetzungsschritte

1. DB-Spalte + Schema-Migration in `ensureSchema`.
2. Types + Hash Helper in `src/lib/instagram-post.ts` oder eigenem Helper.
3. Pure Resolver: Auto vs Override.
4. Layout API-Routen.
5. Bestehende Metadata- und Slide-Routen auf Resolver umstellen.
6. Modal Layout-Modus mit Button-basiertem Block-Move.
7. Tests.
8. Staging-Smoke mit:
   - `imageCount=0`
   - `imageCount=max`
   - stale nach Body-Edit
   - Reset auf Auto

## Nicht Im Ersten Sprint

- Drag-and-drop.
- Pixelgenauer Canvas-Editor.
- Freie Textbearbeitung im Export-Modal.
- Font-size Slider.
- Per-Slide manuelles Padding/Spacing.

Diese Features würden den Scope Richtung Mini-Canva verschieben. Für den
aktuellen Bedarf reicht blockbasierte redaktionelle Kontrolle.

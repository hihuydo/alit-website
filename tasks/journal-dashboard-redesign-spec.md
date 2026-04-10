# Spec: Redesign des bestehenden Dashboard-Journals

## Ziel

Das bestehende Dashboard unter `/dashboard/` soll so überarbeitet werden, dass Redaktion und Autor:innen literarische Texte deutlich einfacher eingeben, strukturieren und pflegen können.

Der Schwerpunkt liegt auf dem bestehenden Journal-Bereich. Das aktuelle Formular ist technisch funktional, aber editorisch zu roh: Inhalte werden als `lines: string[]` gespeichert und in einem einzelnen `textarea` bearbeitet. Das reicht für einfache Absätze, aber nicht für literarische Texte mit Hervorhebungen, Zitaten, Links und typografischer Struktur.

Diese Spec definiert den Umbau des bestehenden Dashboards, nicht den Bau eines neuen CMS.

## Ausgangslage im Code

### Bestehende Dashboard-Struktur

- Dashboard-Shell: `src/app/dashboard/page.tsx`
- Journal-Editor: `src/app/dashboard/components/JournalSection.tsx`
- Journal-API:
  - `src/app/api/dashboard/journal/route.ts`
  - `src/app/api/dashboard/journal/[id]/route.ts`
- Public Rendering:
  - `src/components/JournalSidebar.tsx`
- DB-Schema:
  - `src/lib/schema.ts`
- Public Query Mapping:
  - `src/lib/queries.ts`

### Derzeitiges Datenmodell

`journal_entries` speichert aktuell:

- `date TEXT NOT NULL`
- `author TEXT`
- `title TEXT`
- `title_border BOOLEAN`
- `lines JSONB NOT NULL DEFAULT '[]'`
- `images JSONB`
- `footer TEXT`
- `sort_order INT`

### Derzeitige Schwächen

1. Inhalte werden als rohe Zeilenliste gepflegt.
2. Es gibt keine Formatierung auf Inline-Ebene.
3. Links sind nur als nackter URL-Text im Fließtext möglich.
4. Es gibt keine editorischen Blöcke wie Zitat, Zwischenüberschrift oder Hervorhebung.
5. Die Bearbeitung entspricht nicht dem tatsächlichen Render-Modell der Website.
6. Es gibt keine Live-Vorschau.
7. Das aktuelle Modell erschwert spätere Erweiterungen stark.

## Produktziel

Der Journal-Bereich im Dashboard soll ein redaktionstauglicher Eingabebereich werden, mit dem Nutzer:innen:

- Texte blockweise statt zeilenweise erfassen können
- wichtige Stellen hervorheben können
- Links sauber hinterlegen können
- Texte typografisch besser strukturieren können
- die spätere Ausgabe direkt im Dashboard nachvollziehen können

Das System soll dabei die bestehende Website-Gestaltung respektieren und keine generische Blog- oder WYSIWYG-Optik einführen.

## Nicht-Ziele

Diese Phase umfasst nicht:

- vollständige CMS-Funktionalität mit Rollen/Rechten
- kollaboratives Editing
- komplexe Versionshistorie
- vollwertigen externen Rich-Text-Editor mit beliebigen HTML-Funktionen
- Umbau von Agenda und Projekte auf das gleiche Blockmodell

## Lösungsansatz

### Kernentscheidung

Das bisherige `lines[]`-Modell wird nicht weiter ausgebaut, sondern durch ein neues blockbasiertes Inhaltsmodell ergänzt.

Das neue Modell wird in einem zusätzlichen Feld `content JSONB` gespeichert. `lines` bleibt vorerst bestehen, damit bestehende Inhalte weiter funktionieren und schrittweise migriert werden können.

### Zielarchitektur

Ein Journal-Eintrag besteht künftig aus:

1. Metadaten
- Datum
- Autor
- Titel
- Titel mit Trennlinie
- Footer

2. Inhalt
- Liste aus strukturierten Blöcken

3. Rendering
- Public Frontend rendert bevorzugt `content`
- Fallback auf `lines`, falls `content` noch nicht vorhanden ist

## Datenmodell

### DB-Änderung

Tabelle `journal_entries` erweitern um:

```sql
ALTER TABLE journal_entries
ADD COLUMN IF NOT EXISTS content JSONB;
```

Optional in einer späteren Phase:

- `images` langfristig in `content` integrieren
- `lines` nach erfolgreicher Migration entfernen

### TypeScript-Modell

Neues Zielmodell:

```ts
type JournalInlineMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "highlight" }
  | { type: "link"; href: string; title?: string; external?: boolean };

type JournalTextNode = {
  text: string;
  marks?: JournalInlineMark[];
};

type JournalBlock =
  | { id: string; type: "paragraph"; content: JournalTextNode[] }
  | { id: string; type: "quote"; content: JournalTextNode[]; attribution?: string }
  | { id: string; type: "heading"; level: 2 | 3; content: JournalTextNode[] }
  | { id: string; type: "highlight"; content: JournalTextNode[] }
  | { id: string; type: "image"; src: string; alt?: string; caption?: string; width?: "full" | "half" }
  | { id: string; type: "spacer"; size?: "s" | "m" | "l" };

type JournalContent = JournalBlock[];
```

### Begründung

- Blöcke bilden literarische Strukturen besser ab als rohe Zeilen.
- Inline-Marks erlauben Hervorhebungen und Links ohne HTML-Speicherung.
- Das Modell bleibt kontrolliert und renderbar, ohne beliebiges Markup zuzulassen.

## UX-Anforderungen

### Dashboard-Journal neu strukturieren

Die bestehende `JournalSection` bleibt die Einstiegskomponente, wird intern aber in klarere Unterbereiche aufgeteilt:

- Eintragsliste
- Metadatenformular
- Inhaltseditor
- Live-Vorschau

### Zielzustand im Editor

Statt eines einzigen `textarea` soll der Editor folgende Arbeitsweise unterstützen:

1. Eintrag öffnen oder neu anlegen
2. Metadaten ausfüllen
3. Blöcke hinzufügen
4. Pro Block Inhalt bearbeiten
5. Inline-Formatierungen anwenden
6. Vorschau direkt daneben oder darunter prüfen

### Mindestfunktionen im MVP

#### Blocktypen

- Absatz
- Zitat
- Zwischenüberschrift
- Hervorhebung
- Bild
- Abstand/Trenner

#### Inline-Funktionen

- Fett
- Kursiv
- Link setzen
- Link entfernen
- Hervorhebung

#### Editor-Hilfen

- "Block hinzufügen"-Aktion
- Block löschen
- Block nach oben/unten verschieben
- klar erkennbare Blocktypen
- schlanke Bedienoberfläche ohne versteckte Format-Menüs

### Live-Vorschau

Es soll eine Vorschau geben, die sich eng an `JournalSidebar.tsx` orientiert.

Ziel:

- Redakteur:innen sehen während der Eingabe, wie der Inhalt auf der Website erscheint
- die Vorschau muss nicht pixelperfekt sein, soll aber Struktur, Hierarchie und Stil realistisch abbilden

## Rendering-Anforderungen

### Public Frontend

`src/components/JournalSidebar.tsx` wird erweitert:

1. Wenn `entry.content` vorhanden ist:
- rendern über neue Block-Renderer

2. Wenn `entry.content` nicht vorhanden ist:
- bestehendes `lines[]`-Rendering unverändert nutzen

### Link-Verhalten

- interne Links bleiben normale App-Links
- externe Links werden als externe Links behandelt
- `href` muss serverseitig validiert werden

### Hervorhebungen

Hervorhebungen sollen typografisch und visuell zur Website passen:

- kein generischer gelber Marker-Look
- bevorzugt subtile Hervorhebung über Gewichtung, Hintergrund oder Unterstreichung im Stil des Layouts

## API-Anforderungen

### POST `/api/dashboard/journal/`

Erweitern um:

- `content?: JournalContent`

Validierung:

- `date` weiterhin Pflicht
- mindestens eine der beiden Quellen muss vorhanden sein:
  - `content` mit mindestens einem sinnvollen Block
  - oder `lines[]` für Altkompatibilität

### PUT `/api/dashboard/journal/[id]/`

Erweitern um:

- `content?: JournalContent | null`

Verhalten:

- bestehende Felder bleiben updatebar
- `content` darf gesetzt, aktualisiert oder explizit geleert werden

### Serverseitige Validierung

Pflichtprüfungen:

- nur erlaubte Blocktypen zulassen
- nur erlaubte Inline-Mark-Typen zulassen
- `href` nur als gültige URL oder definierte interne Route zulassen
- Textlängen begrenzen
- Bilder nur mit erlaubten relativen Pfaden oder definierten Quellen zulassen

Nicht zulassen:

- rohe HTML-Fragmente
- beliebige JSON-Strukturen ohne Typprüfung

## Migrationsstrategie

### Ziel

Bestehende Journal-Einträge sollen ohne Datenverlust weiter funktionieren und schrittweise in das neue Modell überführt werden.

### Strategie

1. Schema erweitern
- `content` hinzufügen

2. Renderer kompatibel machen
- `content` bevorzugen, sonst `lines`

3. Dashboard-Editor auf neues Modell umstellen
- bestehende Einträge beim Öffnen automatisch in Editor-State transformieren

4. Migration vorbereiten
- Script, das vorhandene `lines[]` in einfache Absatz- und Spacer-Blöcke konvertiert

### Mindestregeln für initiale Migration

- leere Zeilen werden zu `spacer` oder Absatztrennung
- normale Textzeilen werden zu `paragraph`
- bestehende Bilder aus `images` werden an geeigneter Stelle in Bildblöcke überführt
- URLs in Klammern wie `(https://...)` werden, wenn eindeutig, in Link-Marks überführt

### Wichtige Entscheidung

Die erste Produktivversion darf mit Fallback arbeiten. Eine Vollmigration aller Altinhalte ist nicht Blocker für den UI-Umbau.

## Implementierungsplan

### Phase 1: Modell und Kompatibilität

- `journal_entries.content` ergänzen
- Typen für `JournalBlock`, `JournalTextNode`, `JournalInlineMark` anlegen
- Query-Mapping in `src/lib/queries.ts` erweitern
- Public Renderer in `JournalSidebar.tsx` auf `content` + Fallback umbauen

### Phase 2: Dashboard-Editor

- `JournalSection.tsx` zerlegen oder intern modularisieren
- Metadatenbereich erhalten, aber klarer strukturieren
- Blockbasierten Inhaltseditor einführen
- Blockverwaltung und einfache Reorder-Funktionen einbauen

### Phase 3: Vorschau

- Preview-Komponente erstellen
- dieselbe Renderlogik wie im Public Journal verwenden oder eng daran anbinden

### Phase 4: Migration

- Transform-Funktionen `lines[] -> content[]`
- optionales Migrationsscript für Bestandsdaten

### Phase 5: Feinschliff

- bessere Link-UX
- Tastaturkürzel
- optional Auto-Save

## Komponenten-Schnitt

### Empfohlene neue Komponenten

Unter `src/app/dashboard/components/`:

- `JournalEditor.tsx`
- `JournalMetaForm.tsx`
- `JournalBlocksEditor.tsx`
- `JournalBlockCard.tsx`
- `JournalPreview.tsx`
- `journal-editor-types.ts`
- `journal-editor-utils.ts`

### Begründung

Die aktuelle `JournalSection.tsx` bündelt Liste, Formular, API-Orchestrierung und Rendering-State in einer Datei. Für den Umbau wird das schnell unübersichtlich. Die neue Struktur trennt:

- Datenverwaltung
- Metadaten
- Blockeditor
- Vorschau

## Akzeptanzkriterien

Das Feature gilt als erfüllt, wenn:

1. Ein Journal-Eintrag im Dashboard ohne `textarea`-Zeilenlogik gepflegt werden kann.
2. Nutzer:innen Absätze, Zitate, Zwischenüberschriften und Hervorhebungen anlegen können.
3. Links im Editor gesetzt und im Frontend korrekt ausgegeben werden.
4. Bestehende Einträge ohne `content` weiterhin korrekt angezeigt werden.
5. Neue Einträge mit `content` im Public Journal korrekt dargestellt werden.
6. Das Dashboard eine Vorschau bietet, die die spätere Ausgabe nachvollziehbar macht.
7. Die Lösung ohne rohes HTML auskommt.

## Offene Entscheidungen

Diese Punkte müssen vor Umsetzung final entschieden werden:

1. Sollen Bilder im MVP schon voll in `content` aufgehen oder vorerst parallel in `images` bleiben?
2. Soll Hervorhebung als eigener Block und als Inline-Mark unterstützt werden, oder zunächst nur als Inline-Mark?
3. Sollen interne Links bereits auf Projekte und statische Seiten verweisen können, oder zunächst nur externe Links?
4. Reicht für Block-Reihenfolge zunächst "hoch/runter", oder wird direkt Drag-and-drop benötigt?

## Empfehlung für die Umsetzung

Für diese Codebase ist der pragmatischste Weg:

1. `content JSONB` ergänzen
2. Rendering kompatibel machen
3. neuen Journal-Editor bauen
4. Altinhalte per Transformationslogik unterstützen

Nicht empfohlen ist, das bestehende `lines[]`-Modell weiter mit Sondersyntax zu überladen. Das würde kurzfristig schnell wirken, aber mittelfristig die Wartung und jede weitere Ausbaustufe erschweren.

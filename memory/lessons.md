---
name: Lessons alit-website
description: Wiederverwendbare Learnings aus dem alit-website Projekt
type: project
---

## Next.js / Routing
- `trailingSlash: true` → API-Routes bekommen 308 Redirect ohne Trailing Slash. Monitoring-URLs immer mit `/` am Ende konfigurieren.
- "Cannot read properties of undefined" + "Failed to find Server Action" bei laufender App = stale Build, kein Code-Bug. `docker compose up --build -d` fixt es.
- Client Components dürfen NICHT `async function` sein. Beim Refactor von async server function → client component die `async` weg, sonst kompiliert es nicht.
- Hooks wie `useState`/`useEffect` müssen VOR jeder Berechnung stehen, die ihre Werte liest. TDZ-Bug bei `secondary === "3"` direkt nach der Title-Computation, weil `secondary` erst weiter unten deklariert war.

## CSS / Tailwind v4
- **Box-sizing border-box quirk**: Ein Element mit `flex-basis: 0%` und `border-right: 3px` rendert trotzdem 3px breit (die Border kollabiert nicht in die 0 Breite). Mit `opacity: 0` wird das zu einem transparenten Strip, durch den der Body-Background scheint. Fix: `border-width: 0` im hidden state explizit setzen.
- **Turbopack CSS Dedup faltet Compound-Selectors**: `.panel.panel-hidden { border-width: 0 }` wird bei der Kompilierung in den `.panel-hidden { ... }` Block einkassiert und verliert die Specificity-Erhöhung von (0,2,0) zurück auf (0,1,0). Workaround: Selectors über mehrere distinkte Compound-Klassen schreiben (`.panel-1.panel-hidden, .panel-2.panel-hidden, .panel-3.panel-hidden { ... }`) — die kann der Optimizer nicht zusammenfassen.
- **Hot-Reload-Falle bei Edit-Tool**: Manchmal pickt Turbopack Schreibvorgänge vom Edit-Tool nicht als Change-Event auf. `touch` reicht auch nicht. Echter Content-Edit (auch nur ein Kommentar) triggert den Recompile. Bei "CSS-Änderung wirkt nicht": erst über `curl _next/static/chunks/<hash>.css` prüfen, was wirklich serviert wird, bevor man an Specificity oder Source-Order zweifelt.
- Inline `style={{ background: ... }}` schlägt jede CSS-Klasse, auch `:hover` mit höherer Specificity ist nichts gegen Inline. Für hover-fähigen Background besser via Klasse mit arbitrary value (`bg-[var(--color-meta)]`) lösen.

## React / Forms
- **Checkboxen brauchen `onChange`, nicht `onClick`** — sonst fängt man nur Mausklicks ab und verpasst die Tastatur-Aktivierung via Space. Gilt analog für andere native form controls.
- **Form-Validation ohne Submit-Roundtrip**: `formRef.current.checkValidity()` gegen `required` Attributes ist die billigste Variante, um den Form-State punktuell zu prüfen (z.B. beim Klick auf eine Bestätigungs-Checkbox). Kein State-Mirroring jeder einzelnen Input nötig.
- HTML5 `<form>` ohne `onSubmit` Handler macht beim Submit ein GET-Reload mit den Form-Daten in der URL. Bis der Backend-Endpoint da ist immer `e.preventDefault()` setzen oder `<form>` durch `<div>` ersetzen.

## Fonts
- Vor Production-Deploy **immer von TTF auf woff2 (+ woff Fallback) umstellen** — TTF ist 2-3x größer und wird unkomprimiert geladen. Multi-Cut-Familien: Light/Regular/ExtraBold + jeweilige Italics als separate `@font-face` Blöcke mit gleicher `font-family`, unterschieden durch `font-weight` + `font-style`.
- Wenn nur Regular geladen ist und CSS `font-weight: 700` setzt, synthesisiert der Browser ein "fake bold" — sieht oft hässlich aus. Entweder echten Bold-Cut laden oder Weight auf Regular setzen.

## Design / Naming
- Bei generischen Naming-Konventionen (panel-1, panel-2, panel-3 statt panel-verein, panel-journal, panel-stiftung): Beim Refactor ALLE Stellen anfassen — CSS-Klassen, TS-Types, State-Werte, data-attributes. Sonst entstehen Magic Strings, die später schwer zu finden sind.
- Magic-String-Filter (`if (item.key === "agenda") return null`) bei der zweiten Wiederholung in einen typed Flag (`hideFromMenu?: boolean`) refactoren. Spart das nächste Mal die Suche nach allen Stellen, wo gefiltert wird.

## 2026-04-10 — Rich-Text Editor Round-Trip
- Issue: contentEditable + HTML round-trip verliert Metadata (quote.attribution, image.width, spacer.size)
- Fix: Metadata als data-Attribute auf HTML-Elementen kodieren (data-attribution, data-width, data-size)
- Rule: Jedes Block-Feld das über HTML transportiert wird braucht ein data-Attribut + Sanitizer-Allowlist-Eintrag

## 2026-04-10 — Auto-Save schließt Editor
- Issue: handleSave nach Auto-Save rief setEditing(null) auf → Editor unmounted
- Fix: Auto-Save übergibt { autoSave: true }, Parent überspringt setEditing(null) und reload()
- Rule: Bei Auto-Save nie den Editor-State zurücksetzen — nur bei manuellem Speichern

## 2026-04-11 — Media in PostgreSQL bytea
- Issue: Docker-Container hat keine Volumes → Filesystem-Uploads gehen bei Rebuild verloren
- Fix: Bilder/Videos als bytea in PostgreSQL speichern, Auslieferung via API-Route
- Rule: Bei kleinen CMS ohne Volume-Management ist DB-Storage für Medien pragmatisch. Trade-off: Full blob für jeden Range-Request.

## 2026-04-11 — UUID statt Sequential IDs für öffentliche URLs
- Issue: /api/media/1/, /api/media/2/ erlaubt Enumeration aller Uploads
- Fix: public_id UUID-Spalte, öffentliche URLs über UUID statt numeric ID
- Rule: Öffentlich zugängliche Ressourcen nie über vorhersagbare IDs exponieren

## 2026-04-11 — nginx client_max_body_size
- Issue: Upload scheitert mit "Verbindungsfehler" — Request kommt gar nicht beim Container an
- Fix: `client_max_body_size 55m;` im nginx Server-Block
- Rule: Bei File-Upload-Features immer nginx body size limit prüfen — Default ist 1 MB

## 2026-04-11 — contentEditable collapsiert leere Paragraphen
- Issue: Leere <p><br></p> am Textanfang werden vom Browser collapsiert/entfernt
- Fix: data-block="spacer" Attribut auf leere Paragraphen setzen
- Rule: Browser-eigenes contentEditable-Verhalten ist unzuverlässig für leere Elemente — immer explizit markieren

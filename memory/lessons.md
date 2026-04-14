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

## 2026-04-12 — Staging-Environment aufgesetzt
- Issue: Kein Preview vor Merge — ambitious UI-Änderungen mussten lokal oder direkt in Prod getestet werden.
- Fix: Zweiter Docker-Container `alit-staging` auf Port 3102, separater Git-Checkout `/opt/apps/alit-website-staging`, nginx vhost `staging.alit.hihuydo.com` mit Let's-Encrypt, GitHub Action `deploy-staging.yml` baut bei Push auf jedem Non-Main Branch.
- Rule: Nicht-Main Push → Staging, Main-Merge → Production. Workflow: Branch → Staging testen → PR → Codex Review → Merge.

## 2026-04-12 — Accordion mit grid-template-rows statt max-height
- Issue: `max-h-[4000px]` als Cap clippt langen Content, besonders auf Mobile/small viewports mit größeren Schriften.
- Fix: Grid-Pattern `grid-rows-[0fr]` ↔ `grid-rows-[1fr]` mit `transition-[grid-template-rows]` + inner wrapper `overflow-hidden`. Content kann beliebig hoch werden.
- Rule: Für Accordions mit variablem Content immer grid-template-rows Pattern nutzen, nie fixen max-h Cap.

## 2026-04-12 — Safe-area-inset dynamisch platzieren
- Issue: iPhone Home-Indicator braucht `env(safe-area-inset-bottom)`, aber auf welchem Element? Hängt vom Layout-State ab.
- Fix: Standard auf `.leiste-3` (wenn Panel 1/2 primary, Leiste 3 am Boden). Bei `[data-primary="3"]` wird Inset auf Panel 3's inner scroll container verschoben (Panel 3 ist dann am Boden).
- Rule: Safe-Area-Inset gehört auf das ELEMENT, das im aktuellen State am unteren Rand sitzt — nicht statisch auf ein element. Dynamisch via data-attribute switchen.

## 2026-04-12 — Hover-Affordanzen nur für pointer-fine
- Issue: `.leiste:hover { background: #fff }` triggerte auf Touch-Geräten, wenn der Finger beim Scrollen über die Leiste streifte → weißes Flackern.
- Fix: `@media (hover: hover) and (pointer: fine) { ... }` um alle Hover-Regeln, die sichtbare State-Änderungen produzieren.
- Rule: CSS `:hover` Regeln grundsätzlich in `@media (hover: hover) and (pointer: fine)` wrappen — nur pointing devices haben echten Hover.

## 2026-04-12 — iOS auto-zoom on input focus
- Issue: iOS Safari zoomt auf inputs fokussiert mit font-size < 16px rein. Viewport-Meta allein reicht nicht.
- Fix: `input, select, textarea { font-size: max(16px, 1rem) }` im mobile media query.
- Rule: Form-Input Font immer ≥ 16px auf Mobile, sonst zoomt iOS beim Fokus rein.

## 2026-04-12 — React adjust state during render pattern
- Issue: `useEffect` mit `setState` auf navActive-Transition löste `react-hooks/set-state-in-effect` Lint-Error aus.
- Fix: `const [prevX, setPrevX] = useState(x); if (x !== prevX) { setPrevX(x); setY(...); }` — React re-rendert ohne Intermediate Paint.
- Rule: Wenn State sich auf Prop/Derived-Value Änderung anpassen muss, NICHT useEffect + setState. Verwendet das "adjust state during render" Pattern aus React Docs.

## 2026-04-12 — overflow-lock nur für spezifischen Layout scopen
- Issue: Mobile media query `html, body { overflow: hidden }` für Accordion-Pin brach das Dashboard auf Mobile (scrollte nicht mehr).
- Fix: `html:has(.wrapper-root), body:has(.wrapper-root) { ... }` — nur öffentliche Seiten locken das Scroll, Dashboard unberührt.
- Rule: Globale html/body overflow-Overrides IMMER mit `:has()` auf den spezifischen Layout-Container scopen.

## 2026-04-12 — Fluid Typography clamp() Grenzen
- Issue: Fixe px-Schriften (26.667px Body) auf 320px-Phones zu groß, auf 1920px+ zu klein.
- Fix: `clamp(17px, 1rem + 0.9vw, 26.667px)` für body. Mobile-Min 17px lesbar, Desktop-Max wie bisher.
- Rule: Alle Text-Tokens (body, title, leiste, journal, meta) + Spacing-Tokens als `clamp(min, preferred, max)` — nie fixe px für responsive Sites.

## 2026-04-12 — viewport-fit=cover braucht top safe-area
- Issue: `viewportFit: "cover"` lässt iOS Content unter die Notch/Status-Bar extenden. Mobile-Top-Bar saß halb verdeckt.
- Fix: `padding-top: env(safe-area-inset-top)` + entsprechend `height: calc(var(--leiste-mobile-height) + env(safe-area-inset-top))` auf dem top-most Element.
- Rule: Bei `viewport-fit=cover` IMMER auch `env(safe-area-inset-top)` auf top-most UI einsetzen, sonst versteckt sich das Element unter der Notch.

## 2026-04-14 — Sort-Order DESC + inverted Reorder
- Issue: "neueste oben" ohne Datenmigration. Sort_order war ASC-encoded (0 = oben).
- Fix: `ORDER BY sort_order DESC` in Reads + Reorder-Endpoint schreibt `sort_order = (length - 1 - index)` statt `= index`. Insert mit `MAX+1` landet automatisch oben.
- Rule: Bei Flip der Sort-Richtung muss Read, Insert und Reorder konsistent umgedreht werden — ASC/DESC allein in Read reicht nicht, sonst wird Drag & Drop invers.

## 2026-04-14 — Client Component + pg-Import via Shared-Split
- Issue: Client Component importierte Konstante aus einer Datei, die auch `pool from './db'` importierte → `pg` landete im Client-Bundle, Build failt mit `Can't resolve 'dns'/'fs'/'net'/'tls'`.
- Fix: Shared-Konstanten (Typen, Allowlist-Arrays) in eigene `*-shared.ts` auslagern ohne Server-Imports. Server-Module (Validator mit DB-Lookup) importieren die Shared-Konstanten weiter.
- Rule: Jeder Module der `pool`/`pg`/Node-native Deps importiert, darf NIE Konstanten exportieren, die eine Client Component importiert. Bei Mischbetrieb: Split in `<name>-shared.ts` (pure types/consts) + `<name>.ts` (server-only Logic).

## 2026-04-14 — CASE WHEN für nullable partial updates
- Issue: `lead` kann gezielt auf NULL gesetzt werden. `COALESCE($7, lead)` würde "null = keep current" interpretieren — kein Weg mehr, ein Lead zu leeren.
- Fix: Zweites Bool-Parameter: `lead = CASE WHEN $6::boolean THEN $7 ELSE lead END` mit `$6 = field !== undefined`. Send `null` als Wert wenn gelöscht werden soll.
- Rule: Bei nullable Feldern in partial PUTs: `CASE WHEN sent-flag THEN value ELSE col END`. NIE `COALESCE($x, col)` für nullable Fields, das verhindert explizites Löschen.

## 2026-04-14 — Section refetch on mount vs stale initial prop
- Issue: Dashboard-Parent fetcht `initial` einmalig beim Mount und reicht als Prop durch. Section re-mountet beim Tab-Wechsel mit OLD initial → frisch gespeicherte Felder "verschwanden".
- Fix: Jede Section macht `useEffect(() => { reload() }, [reload])` beim Mount. `initial` dient nur als First-Paint-Fallback und wird sofort überschrieben.
- Rule: Wenn Parent State einmal fetcht und Children unmounten/remounten (conditional render), MUSS die Child einen eigenen Mount-Fetch haben. Sonst zeigt sie stale Daten trotz korrektem DB-State.

## 2026-04-14 — Client-side Image-Orientation + CLS-Fix
- Issue: Server-seitige Bild-Analyse (sharp etc.) wollte ich vermeiden. Ohne `width`/`height` am `<img>` → CLS beim Laden.
- Fix: `new Image()` + `naturalWidth`/`naturalHeight` beim Upload im Browser auslesen. Orientation ableiten + width/height in DB speichern. Auf der Website `<img width={w} height={h}>` setzen → Browser reserviert den Platz.
- Rule: Orientation/Dimensions sind client-side gratis via Image Probe. Lieber bei Upload erfassen als später server-side zu analysieren.

## 2026-04-14 — link-dotted mit currentColor
- Issue: `.link-dotted { color: #000; border-bottom-color: var(--color-border) }` brach auf dark backgrounds (Panel 2 ist schwarz).
- Fix: `color: inherit; border-bottom: 2px dotted currentColor` — passt sich an Parent-Text-Color an.
- Rule: Utility-Link-Klassen, die auf verschiedenen Backgrounds leben, sollten `currentColor` statt hardcoded Farben nutzen.

## 2026-04-14 — Media-Usage-Scan muss alle Tabellen mit Media-Refs decken
- Issue: Media-GET scannte nur `journal_entries.content/images`. Nach Hinzufügen von Agenda-Images (JSONB mit public_ids) + Agenda-Content (Rich-Text-Figuren) wurde Media als "unused" angezeigt obwohl in Agenda-Einträgen referenziert → Admin konnte es löschen → broken images.
- Fix: Parallel `SELECT` auf journal_entries UND agenda_items in der Media-GET. Rich-Text über `/api/media/<uuid>/`-Path-Match, Bild-Attachments über `public_id`-Substring-Match in stringified JSON.
- Rule: Bei jedem neuen Feature das Media referenziert: Media-Usage-Check erweitern. Sonst Datenverlust durch "false unused"-Deletes.

## 2026-04-14 — Autosave mit optionalen Feldern gegen Datenverlust
- Issue: 3s-Autosave filterte incomplete Hashtag-Rows raus und sendete "keine Hashtags" → DB-Wert wurde während User-Edit gelöscht.
- Fix: Autosave erkennt incomplete drafts und LÄSST das Feld im Payload komplett weg (`{ ...payload, hashtags: undefined }`). JSON.stringify dropt undefined. Server-PUT skippt die SET-Clause bei undefined → DB-Wert bleibt erhalten.
- Rule: Bei Autosave mit Draft-Validation NIE "filtered empty" senden — ausschließen heißt Feld weglassen, nicht leeres Array senden.

## 2026-04-14 — Ref-Mutation during render → use Effect
- Issue: `doAutoSave.current = handleAutoSave` im Render-Body triggerte `react-hooks/refs` in strict-Lint-Configs.
- Fix: `useEffect(() => { doAutoSave.current = handleAutoSave; })` ohne deps — läuft nach jedem Render, hat denselben Effekt, ist lint-clean.
- Rule: Ref-Mutationen gehören in useEffect, nie in den Render-Body — auch wenn "es funktioniert".

## 2026-04-14 — HTML-Attribute brauchen "-Escaping
- Issue: `<iframe src="${result.src}">` interpoliert User-Input direkt. Ein `"` in YouTube/Vimeo Query-Param zerschießt den Tag + potentielles XSS-Vehicle.
- Fix: esc-Helper um `.replace(/"/g, "&quot;")` erweitern und auch auf `src`/`data-mime`/`data-width` anwenden, nicht nur auf sichtbaren Text.
- Rule: Jede String-Interpolation in HTML-Attribute (auch vermeintlich "safe" wie URLs): escape `"`. Tag-Text braucht `< > &`, Attribut-Wert braucht zusätzlich `"`.

## 2026-04-14 — scrollIntoView block: "nearest" statt "start"
- Issue: `block: "start"` scrollt auch wenn Element schon im Viewport → Jitter bei Re-Click.
- Fix: `block: "nearest"` — scrollt nur wenn nötig.
- Rule: Bei Route-Change-getriggerte scrollIntoView lieber "nearest", verhindert unnötige Sprünge wenn User die Position manuell angepasst hat.

## 2026-04-14 — Section-Rendering auf Content keyen, nicht auf Position
- Issue: Intro-Block einer strukturierten Content-Liste sollte ohne Wrapper rendern. Erster Spec-Vorschlag: "erster Eintrag nach sort_order ist die Intro". Sobald Admin reordert, rendert plötzlich eine andere Sektion wrapperlos.
- Fix: Rendering-Regel an inhaltliches Feld hängen, z.B. `title === null` → kein Wrapper, sonst `<h3>` + `.content-section`. Position-unabhängig.
- Rule: Wenn eine Sonderbehandlung für "ersten" Eintrag o.ä. gewünscht ist, diese nicht an `sort_order === 0` hängen. Admin-Reorder bricht das Invariant sonst still. Besser ein Content-Flag (nullable title, explicit `is_intro` column, etc.) — reorder-safe by design.

## 2026-04-14 — sort_order-Namespace muss per-locale sein
- Issue: `alit_sections` hat `locale` + `sort_order`. Reorder, POST-MAX-Lookup und GET scopten anfangs nicht nach locale → DE-Reorder würde FR-Reihenfolge verändern, FR-INSERT übernimmt DE's max. Codex fand 3 Varianten der gleichen Klasse.
- Fix: Jeder Read/Write mit `sort_order` muss WHERE locale einschließen: `ORDER BY sort_order WHERE locale = $1`, `MAX(sort_order) WHERE locale = $3`, `UPDATE ... WHERE id = $n AND locale = $m`. Reorder-Payload trägt `locale`. PUT akzeptiert kein `locale` (sonst orphan + ordinal-collision).
- Rule: Sobald eine Tabelle locale + sort_order hat, ist locale Teil des `sort_order`-Namespace. Jeder Touchpoint (SELECT/INSERT-MAX/UPDATE/reorder) muss scopen. PUT darf locale nicht mutieren.

## 2026-04-14 — Dashboard GET muss single-locale filtern, nicht nur die UI
- Issue: Admin-UI ist single-locale (DE). GET-Endpoint returnte alle Rows inkl. FR. Reorder-Client schickte `locale: "de"` hardcoded → sobald eine FR-Row in der Liste auftaucht, bricht Drag-Drop mit `rowCount !== 1`.
- Fix: Filter serverseitig an der Quelle. `GET /api/dashboard/alit?locale=de` (default). Dashboard-UI ist dann end-to-end single-locale — kein Mixed-Row-Unfall möglich.
- Rule: Wenn UI einen Scope annimmt (hier: locale), muss auch der Backend-GET diesen Scope durchsetzen. Client-seitige Filter allein reichen nicht, weil Tests/API-Clients die Annahme bypassen können.

## 2026-04-14 — Rich-Text HTML-Converter muss ALLE Mark/Block-Attribute round-trippen
- Issue: `journal-html-converter.ts` emittierte `<a>` ohne `download`-Attribut (obwohl `mark.download` im Schema), und spacer ohne `data-size`. Round-trip (Edit → Save) stripte silently. Aufgefallen weil seeded Alit-Content Download-Link + Small-Spacer hatte.
- Fix: Schema-Feld → HTML-Attribut emittieren (`download=""`, `data-size="s|m|l"`) UND beim Parsen zurücklesen (`hasAttribute("download")`, `parseSpacerSize(data-size)`). RichTextEditor-Sanitizer-Allowlist um die Attribute erweitern.
- Rule: Jedes Feld im Rich-Text-Schema braucht drei Punkte in Sync: (1) typed in journal-types.ts, (2) validiert in journal-validation.ts, (3) lossless round-trip in journal-html-converter.ts (emit + parse) + RichTextEditor-sanitizer-allowlist. Sonst editiert der Admin Content und verliert Attribute ohne Fehlermeldung.

## 2026-04-14 — Immutable Cache vs. mutable Response-Header
- Issue: `/api/media/[id]` servte `Cache-Control: public, max-age=31536000, immutable` auf JEDE Response. Rename-Feature änderte `media.filename`, der im `Content-Disposition`-Header eingebettet ist — Browser/CDN cachten den alten Namen bis zu einem Jahr.
- Fix: Cache-Policy nach Response-Shape splitten. Wenn `Content-Disposition` gesetzt wird (PDF/ZIP, oder `?download=1`): `public, max-age=300, must-revalidate`. Sonst (image/video ohne Disposition, bytes content-addressed by public_id): weiter `immutable`.
- Rule: `immutable` nur für Responses wo sowohl Body als auch Headers am public-key ewig stabil sind. Sobald ein Header mutable DB-Feld referenziert (filename, acl, etc.): kurze max-age + must-revalidate.

## 2026-04-14 — Rename muss Datei-Extension preservieren (+ Mime-Fallback)
- Issue: Rename-Endpoint überschrieb `media.filename` verbatim. Admin tippt "privacy-policy" als neuen Namen für `policy.pdf` → Content-Disposition download speichert extensionless → OS kann Datei nicht öffnen. Zweiter Bug: Upload ohne Suffix (z.B. "my-document" als PDF) hatte gar keine Extension zum Preservieren.
- Fix: `applyRename(original, mimeType, userInput)`: sanitize userInput, hänge Extension von Original an (oder fallback via `extensionFromMime(mime)` → .pdf/.zip). Wenn User eine andere Extension tippt, verwerfen und authoritative anhängen.
- Rule: Sobald ein Datei-Attribut (filename) sowohl im HTTP-Header (Content-Disposition) als auch im Admin-Flow editierbar ist, muss die Rename-Logik die file-type-bedeutsamen Teile (Extension, mime alignment) erzwingen. Plain "overwrite whatever admin typed" bricht Downstream-Consumer (Browser-Save, OS-Open).

## 2026-04-14 — Media-Registry muss jede Tabelle scannen die Media-URLs einbetten kann
- Issue: Nach Phase 2 (Alit-Sektionen mit Rich-Text) konnte Admin einen Media-Link in eine Alit-Sektion setzen. Die Registry scannte aber nur `journal_entries` + `agenda_items` → Medium zeigte "unused", Admin löschte → Alit-Sektion hatte dann einen toten Link.
- Fix: Neue MediaRefSource für `alit_sections` im Registry (`src/lib/media-usage.ts`). Pattern ist bewährt (gleiche Klasse wie der Agenda-Fix aus letzter Woche).
- Rule: Jedes neue Feature, das Rich-Text oder einen Medien-bezogenen JSON-Blob speichert, erweitert die Media-Usage-Registry. Als Checkliste in der Spec fest verankern. Sonst Datenloss-Bug bei nächstem Admin-Delete.

## 2026-04-14 — File-Picker `accept` muss MIME-Aliase + Extensions decken
- Issue: `accept="application/zip"` filterte auf manchen Browsern .zip-Dateien raus, weil der Browser sie als `application/x-zip-compressed` (legacy Windows MIME) taggt. Backend akzeptierte beide, aber der Admin konnte die Datei erst gar nicht auswählen.
- Fix: `accept="application/zip,application/x-zip-compressed,.zip,.pdf"` — MIME-Aliase UND Extension-Patterns zusammen. Extension-Match greift wenn der MIME-Match fehlschlägt.
- Rule: Bei File-Input `accept` immer sowohl alle bekannten MIME-Varianten als auch die Extension(s) angeben. Browser + OS machen das MIME-Mapping unvorhersehbar — Extensions sind die robuste Fallback-Ebene.

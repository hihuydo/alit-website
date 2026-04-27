# Codex Spec Review — 2026-04-26

## Scope
Spec: tasks/spec.md (Agenda Bilder-Grid 2.0)
Sprint Contract: 12 Done-Kriterien (DK-1..DK-12)
Basis: qa-report.md is stale (from revert sprint), Sonnet hook not yet run on this spec

## Findings

### [Contract] — Sprint-Contract-Verletzung oder fehlendes Must-Have
[Contract] — `DK-10` widerspricht dem Spec: `tasks/spec.md:50,57` deferiert Touch-Support explizit aus dem Sprint, aber `tasks/todo.md:17` verlangt einen Mobile-Smoke, in dem Drag auf Mobile funktioniert. So ist das DK nicht erfüllbar. Suggested fix: `DK-10` auf „Modal rendert ≤768px korrekt, zeigt Maus-only-Hinweis, Save/Cancel funktionieren" ändern oder Touch-Support in Must-Have hochziehen.

[Contract] — `DK-12` ist kein testbares Produktkriterium, sondern ein Prozess-Gate: `tasks/todo.md:19` hängt Sprint-Definition an einen externen Review-Lauf statt an Systemverhalten. Das ist weder im Repo mechanisch verifizierbar noch stabil reproduzierbar. Suggested fix: `DK-12` aus den Done-Kriterien entfernen und als Workflow-Note neben pre-push/post-commit Hooks dokumentieren.

[Contract] — Die Staging-Smokes schreiben gegen eine shared Prod+Staging DB: `tasks/todo.md:12-18` fordert Edit/Create/API-Smokes auf Staging, während `CLAUDE.md:137` und `../patterns/deployment-staging.md:118-126` klar sagen, dass Staging-Push der DB-Deploy auf dieselbe Datenbank ist. Diese DKs mutieren reale Public-Daten. Suggested fix: Write-Smokes lokal/dev ausführen oder auf einen explizit temporären Hidden-Testdatensatz mit Cleanup-Skript beschränken; Staging nur für DDL-, Log- und Public-Render-Smokes verwenden.

[Contract] — Die Grid-Select-Anforderung ist intern widersprüchlich: `tasks/spec.md:48` sagt „bei images.length >= 2 ein <select>", im selben Satz aber „bei images.length < 2 disabled mit Hint". Das beschreibt gleichzeitig „nur sichtbar ab 2" und „sichtbar aber disabled unter 2". Suggested fix: eine Variante fest entscheiden und in Spec + DK konsistent machen; ich würde „immer sichtbar, unter 2 disabled mit Hint" wählen, weil das Verhalten erklärbar und testbar ist.

### [Correctness] — Technische Korrektheit / Edge Cases / Race Conditions
[Correctness] — Der Single-Image-Branch fordert „native Aspect Ratio", definiert aber keinen Fallback für Legacy-Rows ohne `width`/`height`: `tasks/spec.md:38-40,52`. Die aktuelle Codebasis hat solche Fallbacks explizit (`src/components/AgendaItem.tsx:171-175`, `src/app/dashboard/components/AgendaSection.tsx:156-162`). Ohne Spec-Contract für `width/height === null` wird derselbe Datensatz je nach Implementierung verzerrt oder layout-instabil. Suggested fix: im Spec festschreiben: `width/height` verwenden wenn vorhanden, sonst orientation-basiert auf `4:3` bzw. `3:4` zurückfallen, plus expliziter Testfall.

[Correctness] — Das Crop-Modal spezifiziert „Pan-Drag → cropX/cropY", aber nicht die Rechenregel für Clamp und Grenzfälle: `tasks/spec.md:50,126-128`. Bei einem 2:3-Frame über Bildern mit sehr anderem Seitenverhältnis ist nicht definiert, wann Drag gestoppt wird, wie Offsets in Prozent umgerechnet werden und was bei undersized axis passiert. Das führt schnell zu springendem Drag oder unsteten gespeicherten Werten. Suggested fix: einen präzisen Mapping-Contract ergänzen: gespeicherte Werte sind Prozent des sichtbaren Bildmittelpunkts, beide Achsen auf `0..100` geklemmt, Achsen ohne Bewegungsraum bleiben auf dem ursprünglichen Wert.

[Correctness] — Die Spec verlässt sich darauf, dass `Abbrechen` im Crop-Modal keine Parent-Dirty-Nebenwirkungen hinterlässt (`tasks/spec.md:21,50,105`), aber der Todo-Plan hält nur `cropImage: AgendaImage | null` vor (`tasks/todo.md:46,63`). Ohne expliziten Draft-State im Modal ist der naheliegende Implementierungsfehler, direkt `form.images[i]` während des Draggens zu mutieren und erst bei Cancel „zurückzurollen". Suggested fix: im Spec festschreiben, dass das Modal ausschließlich auf einem lokalen Draft arbeitet und `form.images` erst auf `Speichern` aktualisiert wird.

[Correctness] — Das Crop-Feature ist als Must-Have rein mausgetrieben spezifiziert (`tasks/spec.md:50`), obwohl der bestehende Modal-Primitive Tastaturfokus sauber trappt (`src/app/dashboard/components/Modal.tsx:45-72`). Damit entsteht eine fokussierbare UI ohne bedienbare Primäraktion für Keyboard-only-Admins. Suggested fix: für MVP entweder numerische `cropX/cropY` Inputs oder Arrow-Key-Nudging als Must-Have aufnehmen; wenn das nicht gewollt ist, das Crop-Modal in Sprint 2 verschieben.

### [Security] — Security / Auth / Data Integrity
[Security] — Der größte Data-Integrity-Risiko-Punkt ist nicht im Schema, sondern im Abnahmeplan: `tasks/todo.md:12-18` verlangt reale Create/Edit-Smokes auf Staging, obwohl Staging und Prod dieselbe DB teilen (`CLAUDE.md:137`, `../patterns/deployment-staging.md:118-126`). Ein fehlgeschlagener Smoke oder vergessener Cleanup veröffentlicht Testcontent live. Suggested fix: Staging-Smokes auf read-only/public checks begrenzen und für Write-Flows ein isoliertes lokales DB-Setup oder eine klar benannte temporäre Test-Row mit scripted teardown vorschreiben.

### [Architecture] — Architektur-Smells mit konkretem Risk (kein Nice-to-have)
[Architecture] — Die Spec routet dashboard-only Copy in die Public-Dictionaries: `tasks/spec.md:88`. Das widerspricht der aktuellen Architektur, in der Dashboard-Chrome zentral in `src/app/dashboard/i18n.tsx:3-10` lebt und die Public-Dictionaries für site-locale Content gedacht sind. Das mischt zwei i18n-Systeme und zieht Admin-Strings unnötig in den Public-Pfad. Suggested fix: Crop-/Grid-/Fit-Labels in ein dashboard-lokales String-Modul legen; nur Public-Renderer-Text gehört in `src/i18n/dictionaries.ts`.

[Architecture] — „Crop-Modal als nested Modal, existing Modal reused" ist mit der aktuellen Modal-Primitive nicht ausreichend spezifiziert: `tasks/spec.md:20-21,85,105` vs. `src/app/dashboard/components/Modal.tsx:40-83`. Der Primitive bindet global `keydown`, trappt Fokus und stellt Fokus beim Cleanup zurück. Zwei gleichzeitig offene Modals können dadurch doppelte Escape-Handler und falsches Focus-Return erzeugen. Suggested fix: entweder Modal-Stack-Verhalten explizit als Must-Have definieren (nur topmost reagiert auf Escape, Parent `disableClose` solange Child offen, deterministisches Focus-Return) oder das Crop-UI inline im bestehenden Edit-Modal statt als zweites Modal bauen.

[Architecture] — Die Spec verlängert die bestehende Typ-Duplikation statt sie zu beseitigen: `tasks/spec.md:37,81,83`. Aktuell existiert `AgendaImage` bereits doppelt in `src/lib/agenda-images.ts:3-9` und `src/components/AgendaItem.tsx:13-19`. Noch zwei Felder auf beide Interfaces zu kopieren erhöht Drift-Risiko im wichtigsten JSONB-Shape. Suggested fix: ein shared Type-Modul verwenden und `AgendaItem.tsx` den Typ importieren lassen statt lokal zu redefinieren.

[Architecture] — Das ist ein Big-Bang-Rollout ohne Schutzrail: `tasks/spec.md:8,41-52,137-143` ersetzt den Public-Renderer für alle Agenda-Einträge, erweitert den Editor, ändert das persistierte Datenmodell und führt ein neues Modal ein, aber ohne Flag oder Soak-Pfad. Bei einem Fehler ist der Blast Radius sofort alle Multi-Image-Entries im Public Panel. Suggested fix: Sprint splitten und den Renderer-Flip erst nach einem Datenmodell/API-Soak ausrollen; alternativ temporär hinter ein env-Flag oder per-entry opt-in stellen.

### [Nice-to-have] — Out-of-Scope, gehört nach memory/todo.md
[Nice-to-have] — Ein echter „transparent background / panel red shines through"-Visual-Contract (`tasks/todo.md:15`) ist ohne visuelle Regressionstests schwer belastbar und gehört nicht in denselben Sprint wie Schema + Renderer + Modal. Wenn die Letterbox-Optik pixelgenau wichtig ist, als separates Polish-Follow-up mit Screenshot-Baseline definieren.

## Verdict
SPLIT RECOMMENDED

**Sprint 1 — Grid + Fit (no crop):**
Additive Schema (`images_grid_columns`, `images_fit`), shared `AgendaImage` type-modul, `validateImages()`-Erweiterung NUR für Grid-/Fit-Felder, POST/PUT/GET/queries pass-through, Dashboard Grid-Select + Fit-Toggle, Public Renderer für Single-Image (orientation-aware) + Multi-Image (Cover/Letterbox, default 50/50). KEINE Crop-Funktion. Abnahme: local write-smokes, staging nur DDL/log/public-render read-smokes.

**Sprint 2 — Crop-Modal:**
`cropX/cropY` in `images` JSONB + `validateImages()` range-check. Crop-Modal nur für `fit='cover'`. Voraussetzungen die hier addressiert werden müssen:
- Stack-safe Modal-Verhalten (nur topmost handled Escape, deterministic focus-return) ODER inline-Crop im Edit-Modal statt nested
- Lokaler Draft-State im Modal (form.images erst on-Save mutiert)
- Präziser clamp/mapping-Contract (Pixel→%, Achsen ohne Bewegungsraum bleiben am alten Wert)
- Keyboard-Fallback (numerische Inputs ODER Arrow-Key-Nudging)
Abnahme: Modal interaction tests + targeted browser smoke.

## Summary
13 findings — 4 Contract, 4 Correctness, 1 Security, 4 Architecture, 1 Nice-to-have.

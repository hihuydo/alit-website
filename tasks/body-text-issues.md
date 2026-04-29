# Body-Text Layout-Issues — Staging Smoke 2026-04-28

Beobachtet auf Staging-Deploy `a5ee3b4` (lead-bold), Test-Eintrag
"Zürcher Literaturwerkstatt 2-26", `imageCount=0` (legacy text-only Pfad),
locale=DE → 6-Slide-Carousel.

---

## Beobachtete Probleme

### Problem 1 — Body-Text klebt am oberen Slide-Rand

Auf Slides 2, 4 und 6 (und teils 1) sitzt der Body-Block am oberen Rand,
danach ~50–75% leerer Raum bis zum unteren Slide-Ende.

**Vermutung:** Der Slide-Container nutzt `justify-content: flex-start`
(default `display: flex; flexDirection: column`) statt den Text vertikal
zu verteilen oder bis zum unteren Rand zu strecken.

### Problem 2 — Slide-Verteilung unbalanciert

| Slide | Inhalt | Füllung |
|---|---|---|
| 1/6 | Title + Lead (bold), KEIN Body | ~50% leer unten |
| 2/6 | 1 Absatz ("An den Zürcher Literaturwerkstätten…") | ~70% leer unten |
| 3/6 | 2 lange Absätze (Am 2.5. + Sabine Haupt Bio) | gut gefüllt |
| 4/6 | 2 mittlere Absätze (Lionel + Eric Bios) | ~50% leer |
| 5/6 | 2 lange Absätze (Tatjana + Anja Bios) | gut gefüllt |
| 6/6 | 1 kurzer Absatz (Maria Lusie Bio) | ~75% leer |

→ Slide 6 ist visuell verschenkt. Marias Absatz hätte mit Slide 5
zusammengepackt werden können, oder der Balance-Pass hätte aggressiver
verteilen sollen (5 statt 6 Slides).

### Problem 3 — Slide 1 ohne Body

Der erste Body-Absatz ("An den Zürcher Literaturwerkstätten…") ist zu
groß für `SLIDE1_BUDGET` (intro-Phase mit reduziertem Budget wegen
Title+Lead). Der Algorithmus seedet daraufhin eine leere intro-Slide
und schiebt den Body komplett auf Slide 2.

Resultat: Slide 1 wirkt halb-leer, Slide 2 hat auch nur einen Absatz
→ zwei aufeinanderfolgende halb-leere Slides.

**Code-Stelle:** `src/lib/instagram-post.ts:301-320` — der `cost > budget &&
phase === "intro"` Guard im for-loop.

---

## Mögliche Lösungen

### Variante A — Body vertikal zentrieren

**Was:** Body-Block bekommt `justifyContent: center` im Slide-Container.
Der Body-Block sitzt dann optisch in der Mitte zwischen Header und Slide-
Boden.

**Aufwand:** ~30min. Single-Style-Property-Change in
`slide-template.tsx`. Tests bleiben grün (rein visueller Effekt).

**Trade-off:**
- ✅ Schnellster Fix gegen Whitespace-Problem
- ✅ Keine Algorithmus-Änderung → kein Regression-Risiko bei DK-22 Hard-Gate
- ❌ Ändert nichts an Slide-Anzahl/Verteilung (Slide 6 bleibt fast leer)
- ❌ Bei nur 1 Absatz wirkt zentrierter Text seltsam isoliert

### Variante B — Body am unteren Slide-Rand verankern

**Was:** Body sitzt am unteren Slide-Rand (`marginTop: auto` oder
Container-`justifyContent: space-between`).

**Aufwand:** ~30min. Style-Property-Change.

**Trade-off:**
- ✅ Klare visuelle Hierarchie (Header oben, Body unten — wie bei der
  Bild-Grid-Slide auch konzeptionell sinnvoll)
- ✅ Bei wenig Body-Text bleibt der Whitespace OBERHALB sichtbar →
  optisch deutlich „weniger Inhalt"
- ❌ Bei genau 1 Absatz wirkt Bottom-aligned-Text wie abgehackter Footer
- ❌ Kann Konflikte mit dem `LEAD_TO_BODY_GAP` haben (Lead direkt unter
  Title, Body weit darunter — eventuell Lead/Body visuell getrennt)

### Variante C — Balance-Pass aggressiver

**Was:** Letzte Slide unter X% Füllung (z.B. <30%) wird automatisch mit
vorletzter zusammengelegt — sofern das `SLIDE_BUDGET` einhält.

**Aufwand:** ~1–2h. Logik-Erweiterung in `splitAgendaIntoSlides`
(nach dem bestehenden `balance pass`-Block, ~line 332-373).

**Trade-off:**
- ✅ Reduziert Slide-Anzahl wo sinnvoll (6 → 5)
- ✅ Adressiert Problem 2 strukturell
- ❌ Behält Problem 1 (Whitespace-Verteilung innerhalb einer Slide)
- ❌ Algorithmus-Änderung → DK-22 Hard-Gate erneut prüfen, neue Tests
  schreiben
- ⚠️ Gefahr: bei `imageCount > 0` (grid-Pfad) müsste der gleiche Fix
  greifen — sonst Verhalten-Drift zwischen den Pfaden

### Variante D — A + C kombinieren

**Was:** Body vertikal zentrieren UND letzte unter-gefüllte Slide
einkollabieren.

**Aufwand:** ~2–3h.

**Trade-off:**
- ✅ Bestes visuelles Ergebnis
- ✅ Adressiert Probleme 1 + 2 gleichzeitig
- ❌ Größerer Diff → Codex-Review-Surface größer
- ❌ Erfordert neue Tests (Balance + Visual-Spec)

---

## Spezielle Probleme die KEINE der Varianten löst

### Problem 3 (Slide 1 ohne Body) ist algorithmus-tief

Der intro-Phase-Skip ist DESIGN-Intent (Codex PR-R1 [P1] hat das gerade
für leadSlide nachgezogen). Lösungen wären:
- Title-Block kompakter rendern (kleinere Font-Größe wenn Body folgen
  soll) → impliziert Conditional-Layout, nicht trivial
- Lead optional auf Slide 2 verschieben statt Slide 1 — würde aber das
  bestehende Layout-Konzept umwerfen

**Empfehlung:** Problem 3 NICHT in diesem Sprint adressieren. Erst
A/B/C/D entscheiden, dann separat als Follow-up evaluieren ob
Slide 1 ohne Body wirklich UX-Problem ist (vielleicht ist „Title +
Lead als Cover" sogar gewollt).

---

## Zusatz-Beobachtung — Hyphenation

Worte wie „Vatersprachen" → „Vater-sprachen" und „vergleichende" →
„verglei-chende" werden mitten im Wort umgebrochen. Das ist Satori-/
PP-Fragment-Sans-Verhalten bei deutschen Komposita.

Optional fixbar via:
- `hyphens: none` in der CSS (kann zu Layout-Overflow führen)
- `wordBreak: keep-all` (lässt deutsche Komposita ganz)
- Akzeptieren als Limitation

**Empfehlung:** Akzeptieren für v1. Eintrag in `memory/lessons.md` falls
es sich häuft.

---

## Frage an Codex

Welche Variante (A/B/C/D) ist die richtige für diesen Sprint? Oder
gibt es eine Variante E die wir übersehen haben?

Kontext: PR #129 ist sonst APPROVED bei Codex R2, alle 22 DKs außer
Staging-Smoke-DKs sind PASS. Wir sind im finalen Sprint-Schliff vor
Merge — das Body-Layout-Problem sollte gefixt werden, aber wir wollen
Sprint nicht aufblähen. Sub-2h-Fix bevorzugt.

# Sprint: Instagram Slide-1 Image Grid
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-28 -->
<!-- Branch: feat/instagram-grid-slide -->
<!-- Depends on: PR #128 merged to main -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [ ] DK-1: `pnpm build` grün, `pnpm exec tsc --noEmit` clean.
- [ ] DK-2: `pnpm test` grün, neue grid-Tests (siehe spec.md → Tests-Sektion) hinzugefügt + bestehende Tests unverändert grün.
- [ ] DK-3: `pnpm audit --prod` 0 HIGH/CRITICAL.
- [ ] DK-4: `splitAgendaIntoSlides` mit `imageCount > 0`: Slide 0 = `kind="grid"` mit `gridImages` + `gridColumns`, Slide 1 = `kind="text"` mit `leadOnSlide=true`.
- [ ] DK-5: `imageCount = 0` Pfad **strukturelle Invarianz** zu pre-Sprint-main (gleiche Slide-Anzahl, gleiche Block-Verteilung, gleiche `kind`/`isFirst`/`isLast` Werte — Inline-Expected-Values Test). Codex R1 #2: bit-identische PNGs ohne Golden-Baseline nicht mechanisch testbar; visuelle Invarianz wird via DK-11 Manual-Smoke verifiziert.
- [ ] DK-6: Route lädt `images_grid_columns` aus DB + alle Bilder via `Promise.all`.
- [ ] DK-7: SlideTemplate `<ImageGrid />` rendert `cols=1+length=1` Branch und `cols≥2` Branch (Code-Review-Check).
- [ ] DK-8: `<img>` in Grid hat IMMER `width`+`height` Props PLUS `style.width`+`style.height` (Satori-Anforderung).
- [ ] DK-9: `objectPosition: \`${img.cropX ?? 50}% ${img.cropY ?? 50}%\`` IST gesetzt auf jede `<img>` in der Grid (Codex R1 #1 — 1:1 Mirror erfordert es). DK-19 Smoke verifiziert ob Satori es respektiert.
- [ ] DK-10: `backgroundColor` nur gesetzt wenn `fit === "contain"`, sonst Property weggelassen.
- [ ] DK-11: **Staging-Deploy** + manueller Smoke: Modal öffnen mit Bild-tragendem Eintrag → `images=1` (cols=1, single image): Slide 1 zeigt Single-Image, Slide 2 zeigt Lead+Body. Logs clean.
- [ ] DK-12: **Staging-Smoke**: `images=2` (cols=1) → Slide 1 zeigt 2-Spalten-Grid (defensive). Logs clean.
- [ ] DK-13: **Staging-Smoke**: `images=3` (cols=2 oder cols=3) → Slide 1 zeigt Multi-Spalten-Grid. Logs clean.
- [ ] DK-14: **Codex PR-Review** nach Staging-Smoke (R1 mindestens). In-scope Findings (Contract/Security/Correctness) gefixt.
- [ ] DK-15: **Prod-Merge** nur nach grünem Codex + post-merge Verifikation (`/api/health/`, Header-Checks, `docker logs` clean).
- [ ] DK-16: **Stale-UI/Code-Reste-Grep** clean: `rg -n '"image"|imagePublicId|imageAspect|imageDataUrl|fitImage|aspectOf|kind === .image.|totalSlides|scale: Scale|parseScale|hasInlineImage|inlineImageBox' src/app/api/dashboard/agenda src/lib/instagram-post* src/app/dashboard/components/InstagramExportModal.tsx` zeigt nur `images:` JSONB-Feld und `images_grid_columns` (legitim) — keine alte `kind="image"` Architektur-Reste.
- [ ] DK-17: **Modal-Copy-Drift-Audit**: `rg -n 'einzelnes Bild|Bild auf Titel-Slide|carousel|pure.image|image.only' src/app/dashboard/components/InstagramExportModal.tsx` zeigt 0 Hits. (Lessons 2026-04-22 PR #110 R1.)
- [ ] DK-18: **`width: "100%"` Audit**: `rg -n 'width: "100%"' src/app/api/dashboard/agenda/[id]/instagram-slide/` zeigt 0 Hits — alle layout-Container verwenden `INNER_WIDTH` numerisch (920). PR #97 Lesson.
- [ ] DK-19: **`objectPosition` Smoke** (Codex R1 #1): Staging-Test mit gecropptem Bild (cropX=0 vs cropX=100) in der Grid: visuelle Differenz im PNG-Output sichtbar. Wenn Satori objectPosition ignoriert: in `memory/lessons.md` als known-Limitation eintragen + Codex-Review ist OK damit.
- [ ] DK-20: **Route-Test mit gemocktem `loadMediaAsDataUrl`** (Codex R1 #3): neuer Vitest-File `instagram-slide/[slideIdx]/route.test.tsx` (oder Erweiterung existing) — 3 Cases: (a) all loads succeed, (b) 1 load returns null, (c) 1 load throws. Alle MÜSSEN HTTP 200 returnen, korrekte `gridImageDataUrls` an SlideTemplate. **Pflicht-Test** für die Klasse von Bugs die `4bfe4ce` produziert hat.
- [ ] DK-21: **`warnings: ["image_partial"]` im Metadata-Endpoint** (Codex R1 #5): wenn 1+ media-Row missing, Modal zeigt amber Banner. Pre-Check via existence-only SELECT in `instagram/route.ts`.
- [ ] DK-22: **`imageCount=0` Hard-Gate**: Test `imageCount=0 (legacy regression)` mit konkreten Inline-Expected-Values MUSS pass UND DK-11 Staging-Smoke MUSS `imageCount=0` Export auf einem realen Eintrag verifizieren — beides erforderlich vor Merge (Codex R1 #6 Blast-Radius-Mitigation).

---

## Implementation Order

(PR #128 ist bereits merged auf main — branch ist auf 4f3d3eb basiert. Spec-Loop abgeschlossen: 8 Sonnet + 2 Codex Runden.)

1. Type-Migration (`SlideKind` → `"text" | "grid"`, `GridImage`, `Slide.gridImages`, `Slide.leadOnSlide`, `AgendaItemForExport.images_grid_columns`). Lösch-Liste anwenden: `imagePublicId`, `imageAspect`, `aspectOf`, `fitImage`, `hasInlineImage`, `inlineImageBox`, `imageDataUrl`, `textBase`.
2. `resolveImages` rewrite → `GridImage[]` mit orientation-fallback + fit + crop.
3. `countAvailableImages` unverändert lassen (kein orientation-Filter — siehe Codex R1 #4).
4. `leadHeightPx` neue exportierte Funktion (siehe spec leadHeightPx vs paraHeightPx Tabelle).
5. `splitAgendaIntoSlides` rewrite: `hasGrid` Branch + `leadOnSlide` Flag + `slide2BodyBudget` + Hard-Cap-Anpassung.
6. **Alle Test-Cases aus spec.md Tests-Sektion** (instagram-post.test.ts: ~15 Grid-Cases + 3 leadHeightPx + 3 legacy-image-fallback; route.test.tsx: 3 image-load Mocks; instagram/route.test.ts: image_partial warning).
7. Route SQL `images_grid_columns` + image-loading via `Promise.all` mit pro-image try/catch.
8. `<ImageGrid />` Component mit beiden Branches (Single + Multi-Cell) + Satori-safe `<img>` (width/height props + style + objectPosition).
9. SlideTemplate Branch für `kind="grid"` (HeaderRow + HashtagsRow + TitleBlock + ImageGrid) + `leadOnSlide` Behandlung im text-Pfad. Defensive throw für leere `gridImages`.
10. Modal Helper-Text + Legend + Modal-Test für `image_partial` amber Banner (Codex R2 #5).
11. `pnpm tsc --noEmit` + `pnpm test` + DK-16/17/18 Greps.
12. Push → Staging-Deploy → DK-11/12/13/19 Smoke.
13. Codex-PR-Review (max 3 Runden).
14. Merge nach grünem Codex + post-merge Verifikation.

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
- [ ] DK-5: `imageCount = 0` Pfad bit-identisch zu main (gleiche Slide-Anzahl, gleiche Block-Verteilung — Snapshot/Equality Test).
- [ ] DK-6: Route lädt `images_grid_columns` aus DB + alle Bilder via `Promise.all`.
- [ ] DK-7: SlideTemplate `<ImageGrid />` rendert `cols=1+length=1` Branch und `cols≥2` Branch (Code-Review-Check).
- [ ] DK-8: `<img>` in Grid hat IMMER `width`+`height` Props PLUS `style.width`+`style.height` (Satori-Anforderung).
- [ ] DK-9: `objectPosition` weggelassen in v1 (cropX/cropY explizit ignoriert mit `// TBD next sprint` Kommentar).
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

1. **Spec → Sonnet-Eval → Codex-Spec-Eval** vor Generator-Start (Medium/Large Sprint).
2. **Wait for PR #128 merge**, dann rebase dieses Branch auf main.
3. Type-Erweiterungen (`SlideKind`, `GridImage`, `Slide.gridImages`, `Slide.leadOnSlide`, `AgendaItemForExport.images_grid_columns`).
4. `resolveImages` rewrite → `GridImage[]` mit orientation/fit/crop.
5. `splitAgendaIntoSlides` rewrite mit `hasGrid` Branch + `leadOnSlide` Flag + `slide2BodyBudget`.
6. Tests (instagram-post.test.ts) — alle 9 Cases aus spec.md.
7. Route SQL + image-loading mit `Promise.all`.
8. `<ImageGrid />` Component mit beiden Branches + Satori-safe `<img>`.
9. SlideTemplate Branch für `kind="grid"` + `leadOnSlide` Behandlung.
10. Modal Helper-Text + Legend.
11. tsc + tests + push.
12. Staging-Smoke (DK-11/12/13).
13. Codex-Review.
14. Merge.

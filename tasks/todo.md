# Sprint: Instagram Slide-1 Image Grid
<!-- Spec: tasks/spec.md -->
<!-- Started: 2026-04-28 -->
<!-- Branch: feat/instagram-grid-slide -->
<!-- Depends on: PR #128 merged to main -->

## Done-Kriterien
> Alle müssen PASS sein bevor der Sprint als fertig gilt.

- [x] DK-1: `pnpm build` grün, `pnpm exec tsc --noEmit` clean.
- [x] DK-2: `pnpm test` grün (794 / 794), neue grid-Tests + leadHeightPx + 41 instagram-post Cases + DK-20 (5 Cases instagram-images.test.ts) + DK-21 (4 Cases InstagramExportModal.test.tsx).
- [x] DK-3: `pnpm audit --prod` 0 HIGH/CRITICAL (1 moderate transitive postcss<8.5.10 via next, akzeptabel).
- [x] DK-4: `splitAgendaIntoSlides` mit `imageCount > 0`: Slide 0 = `kind="grid"` mit `gridImages` + `gridColumns`, Slide 1 = `kind="text"` mit `leadOnSlide=true`. Tests: instagram-post.test.ts → "grid path (imageCount > 0)" describe block.
- [x] DK-5: `imageCount = 0` Pfad strukturelle Invarianz: instagram-post.test.ts:298 "imageCount=0 (legacy regression — strukturelle Invarianz)" describe mit Inline-Expected-Values. Visuelle Invarianz via DK-11 Manual-Smoke (offen, Staging).
- [x] DK-6: Route lädt `images_grid_columns` aus DB (route.tsx:79) + alle Bilder via `loadGridImageDataUrls` (Promise.all + per-image try/catch in instagram-images.ts).
- [x] DK-7: SlideTemplate `<ImageGrid />` rendert `cols=1+length=1` Branch (orientation-aware) und `cols≥2` Branch (multi-cell flex-rows). Code in slide-template.tsx.
- [x] DK-8: `<img>` in Grid hat width/height Props PLUS style.width/style.height (Satori-Anforderung) — verified in slide-template.tsx ImageGrid.
- [x] DK-9: `objectPosition: \`${img.cropX ?? 50}% ${img.cropY ?? 50}%\`` gesetzt auf jede `<img>` in der Grid. DK-19 Smoke verifiziert Satori-Verhalten (Staging-Phase).
- [x] DK-10: `backgroundColor` nur gesetzt wenn `fit === "contain"`, sonst Property weggelassen.
- [ ] DK-11: **Staging-Deploy** + manueller Smoke `images=1` (offen — nach Push).
- [ ] DK-12: **Staging-Smoke** `images=2` (offen — nach Push).
- [ ] DK-13: **Staging-Smoke** `images=3` (offen — nach Push).
- [ ] DK-14: **Codex PR-Review** (offen — nach Staging-Smoke).
- [ ] DK-15: **Prod-Merge** + post-merge Verifikation (offen — nach Codex grün).
- [x] DK-16: **Stale-Reste-Grep**: `rg` zeigt nur legitime Hits (RichText `b.type === "image"` für Embedded-Block-Detection; `totalSlides` als ZIP-pack-Counter — keine alte SlideKind="image" Architektur-Reste).
- [x] DK-17: **Modal-Copy-Drift**: rg clean (0 Hits — Helper-Text auf "Bild im Slide-1-Grid" umformuliert).
- [x] DK-18: **`width: "100%"` Audit**: rg clean (0 Hits in instagram-slide/ Tree).
- [ ] DK-19: **`objectPosition` Smoke** (offen — Staging-Phase).
- [x] DK-20: **Route/Loader-Test mit gemocktem `loadMediaAsDataUrl`**: extrahiert als `loadGridImageDataUrls` (instagram-images.ts) + 5 Cases in instagram-images.test.ts (a/b/c/d/e). Test-Ansatz: pure helper statt JSX-route — vermeidet jsxDEV-Runtime-Bedarf in node test env.
- [x] DK-21: **`image_partial` Warning**: route.ts pre-check via `SELECT public_id ... WHERE = ANY($1)` + InstagramExportModal amber Banner (role="status") + 2 Modal-Tests (banner present / absent).
- [x] DK-22: **`imageCount=0` Hard-Gate Test PASS** (instagram-post.test.ts:298). DK-11 Staging-Smoke offen.

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

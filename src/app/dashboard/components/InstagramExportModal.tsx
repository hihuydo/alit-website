"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { Modal } from "./Modal";
import { LayoutEditor } from "./LayoutEditor";
import { dashboardStrings } from "../i18n";
import {
  isLocaleEmpty,
  type AgendaItemForExport,
} from "@/lib/instagram-post";

type LocaleChoice = "de" | "fr" | "both";
type SingleLocale = "de" | "fr";

type ConfirmIntent = "modal-close" | "locale-change" | "imageCount-change";

type ConfirmDialogState = {
  intent: ConfirmIntent;
  pendingAction: () => void;
};

type LocaleState =
  | { status: "loading" }
  | {
      status: "loaded";
      slideCount: number;
      /** Number of images attached to the agenda item (sprachneutral —
       *  same for both locales). Source of truth for the Number-Input
       *  cap. */
      availableImages: number;
      warnings: string[];
    }
  | { status: "error"; reason: "locale_empty" | "not_found" | "network" };

type Props = {
  open: boolean;
  onClose: () => void;
  item: AgendaItemForExport | null;
};

function defaultLocale(item: AgendaItemForExport | null): LocaleChoice {
  if (!item) return "de";
  if (!isLocaleEmpty(item, "de")) return "de";
  if (!isLocaleEmpty(item, "fr")) return "fr";
  return "de"; // fallback — button shouldn't open when both empty
}

/** Media embedded INSIDE content_i18n (image/video/embed blocks in the
 *  RichText editor) — still stripped by `flattenContent` since the
 *  instagram-export pipeline only renders text + attached `images`.
 *  Attached images are no longer a cause for the banner after PR #110
 *  since the admin can now export them explicitly via the imageCount
 *  Number-Input. */
function hasEmbeddedMedia(item: AgendaItemForExport | null): boolean {
  if (!item) return false;
  for (const loc of ["de", "fr"] as const) {
    const blocks = item.content_i18n?.[loc];
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (
        b.type === "image" ||
        b.type === "video" ||
        b.type === "embed"
      ) {
        return true;
      }
    }
  }
  return false;
}

async function fetchMetadata(
  id: number,
  locale: SingleLocale,
  imageCount: number,
): Promise<LocaleState> {
  try {
    const res = await fetch(
      `/api/dashboard/agenda/${id}/instagram?locale=${locale}&images=${imageCount}`,
    );
    if (res.status === 404) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return {
        status: "error",
        reason: body?.error === "locale_empty" ? "locale_empty" : "not_found",
      };
    }
    if (!res.ok) {
      return { status: "error", reason: "network" };
    }
    const body = (await res.json()) as {
      success: boolean;
      slideCount: number;
      availableImages?: number;
      warnings: string[];
    };
    return {
      status: "loaded",
      slideCount: body.slideCount,
      availableImages: body.availableImages ?? 0,
      warnings: body.warnings,
    };
  } catch {
    return { status: "error", reason: "network" };
  }
}

function slideUrl(
  id: number,
  idx: number,
  locale: SingleLocale,
  cacheBust: string,
  download: boolean,
  imageCount: number,
): string {
  const q = new URLSearchParams({
    locale,
    v: cacheBust,
    images: String(imageCount),
  });
  if (download) q.set("download", "1");
  return `/api/dashboard/agenda/${id}/instagram-slide/${idx}?${q.toString()}`;
}

/**
 * The slide route returns 404 for three distinct reasons:
 * - `error: "Not found"` — the agenda row was deleted mid-session
 * - `error: "locale_empty"` — locale lost its exportable text
 * - `error: "slide_not_found"` — metadata was stale, slideIdx now out-of-range
 *
 * Only the first case is a true "entry deleted" state (permanent). The other
 * two mean the preview was stale and a refetch will resync. This parses the
 * JSON error body and returns the narrower classification so the modal can
 * show an appropriate message rather than always blocking with "Eintrag
 * wurde gelöscht" (Codex PR-R2 #1).
 */
async function handleSlide404(
  res: Response,
): Promise<"deleted" | "stale"> {
  try {
    const body = (await res.clone().json()) as { error?: string } | null;
    if (body?.error === "Not found") return "deleted";
  } catch {
    // Malformed body — treat as deleted conservatively (no exportable state).
    return "deleted";
  }
  return "stale";
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One-shot self-healing slide preview. The slide-PNG route can fail
 *  intermittently when the staging container's pg pool hits a transient
 *  ETIMEDOUT against host.docker.internal. A single retry with a fresh
 *  cache-bust covers the vast majority of those cases without surfacing a
 *  broken-image to the admin (DK-8 visual smoke regression class). The
 *  parent's `cacheBust` change resets `retried` via the `key` prop, so a
 *  successful save always re-arms the retry budget. */
function SlidePreviewImg({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  // null = not retried; number = retry-timestamp (stamped once at error,
  // kept stable across re-renders to avoid React purity violation).
  const [retryStamp, setRetryStamp] = useState<number | null>(null);
  const finalSrc =
    retryStamp === null
      ? src
      : `${src}${src.includes("?") ? "&" : "?"}retry=1&t=${retryStamp}`;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={finalSrc}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => {
        if (retryStamp === null) setRetryStamp(Date.now());
      }}
    />
  );
}

export function InstagramExportModal({ open, onClose, item }: Props) {
  const [locale, setLocale] = useState<LocaleChoice>("de");
  const [imageCount, setImageCount] = useState<number>(0);
  const [deState, setDeState] = useState<LocaleState | null>(null);
  const [frState, setFrState] = useState<LocaleState | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [cacheBust, setCacheBust] = useState("init");
  const zipLockRef = useRef<boolean>(false);

  // S2b-v2 additions: dirty-mirror + confirm-dialog + discardKey for the
  // side-by-side LayoutEditor. No tab-switch — editor and preview render
  // simultaneously when locale !== "both".
  const [discardKey, setDiscardKey] = useState(0);
  const [layoutEditorIsDirty, setLayoutEditorIsDirty] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  // Sync-during-render ref so `guardedOnClose` can read `isDirty` without
  // having it in deps. Modal.tsx:83's `useEffect([open, onClose])` cleanup
  // restores focus on every onClose-identity change — having dirty in deps
  // would jump focus out of the editor on every keystroke (PR #84 class).
  const layoutEditorIsDirtyRef = useRef(false);
  layoutEditorIsDirtyRef.current = layoutEditorIsDirty;

  // Reset state when modal (re-)opens for a new item. Pick a sensible default
  // locale (whichever side has exportable text).
  useEffect(() => {
    if (!open || !item) return;
    setLocale(defaultLocale(item));
    setImageCount(0);
    setDeState(null);
    setFrState(null);
    setDownloading(false);
    setDownloadError(null);
    setDeleted(false);
    setCacheBust(String(Date.now()));
    zipLockRef.current = false;
    // S2b reopen-resets: confirm/dirty. discardKey survives — the
    // LayoutEditor's `isFirstDiscardKey` ref re-arms on remount anyway.
    setConfirmDialog(null);
    setLayoutEditorIsDirty(false);
  }, [open, item]);

  // Locales currently rendered in the preview grid.
  const activeLocales: SingleLocale[] = useMemo(() => {
    if (locale === "both") return ["de", "fr"];
    return [locale];
  }, [locale]);

  // Eagerly fetch metadata for EVERY non-empty locale on open — not only the
  // currently-selected one. Rationale: "Beide"-Gate must stay disabled while
  // either locale is unresolved (Codex R2 #3 + Sonnet DK-11 follow-up). If we
  // fetched lazily, FR state would stay `null` while locale="de" and the gate
  // would fall through to enabled the instant "Beide" becomes reachable.
  // Eager fetch resolves both states before any interaction can race.
  useEffect(() => {
    if (!open || !item || deleted) return;
    let canceled = false;
    const needs: SingleLocale[] = (["de", "fr"] as const).filter(
      (l) => !isLocaleEmpty(item, l),
    );
    for (const loc of needs) {
      if (loc === "de") setDeState({ status: "loading" });
      if (loc === "fr") setFrState({ status: "loading" });
    }
    Promise.all(
      needs.map(async (loc) => ({
        loc,
        state: await fetchMetadata(item.id, loc, imageCount),
      })),
    ).then((results) => {
      if (canceled) return;
      // If any result says "not_found", treat it as deleted-mid-session.
      const deletedHit = results.some(
        (r) => r.state.status === "error" && r.state.reason === "not_found",
      );
      if (deletedHit) {
        setDeleted(true);
        return;
      }
      for (const { loc, state } of results) {
        if (loc === "de") setDeState(state);
        else setFrState(state);
      }
    });
    return () => {
      canceled = true;
    };
  }, [open, item, deleted, imageCount]);

  const deEmpty = item ? isLocaleEmpty(item, "de") : true;
  const frEmpty = item ? isLocaleEmpty(item, "fr") : true;
  const showImageBanner = hasEmbeddedMedia(item);

  // Sprachneutral: both locale-metadata responses report the same count
  // (sourced from agenda_items.images). Pick whichever is loaded first.
  const maxImages =
    (deState?.status === "loaded" ? deState.availableImages : 0) ||
    (frState?.status === "loaded" ? frState.availableImages : 0);

  const deLoading = deState?.status === "loading";
  const frLoading = frState?.status === "loading";
  const metadataUnsettled =
    (locale === "de" && (deState === null || deLoading)) ||
    (locale === "fr" && (frState === null || frLoading)) ||
    (locale === "both" &&
      (deState === null || frState === null || deLoading || frLoading));

  // "Beide" is disabled (a) while either non-empty locale is still loading
  // or unresolved, (b) if either locale is empty, (c) while single-flight
  // mutex is active. Race-window-safe: metadata is eagerly fetched on open,
  // so `deState`/`frState` are null only briefly at the very start.
  const bothDisabled =
    deEmpty ||
    frEmpty ||
    downloading ||
    (!deEmpty && (deState === null || deLoading)) ||
    (!frEmpty && (frState === null || frLoading));

  const tooLong =
    (locale !== "fr" &&
      deState?.status === "loaded" &&
      deState.warnings.includes("too_long")) ||
    (locale !== "de" &&
      frState?.status === "loaded" &&
      frState.warnings.includes("too_long"));

  // image_partial — grid slide carries N images but media table only resolves
  // K<N rows. Empty cells will render in the slide PNG; warn the admin so the
  // partial download isn't silent (DK-21, Codex R1 #5).
  const imagePartial =
    (locale !== "fr" &&
      deState?.status === "loaded" &&
      deState.warnings.includes("image_partial")) ||
    (locale !== "de" &&
      frState?.status === "loaded" &&
      frState.warnings.includes("image_partial"));

  const canDownload =
    !deleted &&
    !downloading &&
    !metadataUnsettled &&
    ((locale === "de" && deState?.status === "loaded") ||
      (locale === "fr" && frState?.status === "loaded") ||
      (locale === "both" &&
        deState?.status === "loaded" &&
        frState?.status === "loaded"));

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setLayoutEditorIsDirty(dirty);
  }, [setLayoutEditorIsDirty]);

  // After a successful save (PUT 200) or reset (DELETE 204) inside LayoutEditor,
  // bump cacheBust so the right-hand preview-img tags re-fetch the new render.
  const handleEditorSaved = useCallback(() => {
    setCacheBust(String(Date.now()));
  }, []);

  const guardedSetLocale = useCallback((next: LocaleChoice) => {
    if (next === locale) return;
    if (!layoutEditorIsDirty) {
      setLocale(next);
      return;
    }
    setConfirmDialog({
      intent: "locale-change",
      pendingAction: () => setLocale(next),
    });
  }, [layoutEditorIsDirty, locale]);

  const guardedSetImageCount = useCallback((next: number) => {
    if (next === imageCount) return;
    if (!layoutEditorIsDirty) {
      setImageCount(next);
      return;
    }
    setConfirmDialog({
      intent: "imageCount-change",
      pendingAction: () => setImageCount(next),
    });
  }, [layoutEditorIsDirty, imageCount]);

  // Reads dirty via ref so identity stays stable — Modal-onClose contract.
  const guardedOnClose = useCallback(() => {
    if (!layoutEditorIsDirtyRef.current) {
      onClose();
      return;
    }
    setConfirmDialog({
      intent: "modal-close",
      pendingAction: onClose,
    });
  }, [onClose]);

  const handleConfirmDiscard = useCallback(() => {
    if (!confirmDialog) return;
    // Explicit dirty-mirror reset — pendingAction may change locale/imageCount
    // which causes LayoutEditor to refetch; its discardKey-effect-based
    // onDirtyChange(false) is async and not guaranteed to fire before
    // the next user interaction.
    setLayoutEditorIsDirty(false);
    setDiscardKey((k) => k + 1);
    confirmDialog.pendingAction();
    setConfirmDialog(null);
  }, [confirmDialog]);

  const handleConfirmCancel = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!item || deleted) return;
    // Synchronous mutex: flip ref BEFORE any async work — double-click same
    // tick sees true and bails. Pattern: patterns/react.md
    // "Synchronous useRef-Mutex für Single-Flight in async Handler".
    if (zipLockRef.current) return;
    zipLockRef.current = true;
    setDownloading(true);
    setDownloadError(null);
    try {
      const locales: SingleLocale[] =
        locale === "both" ? ["de", "fr"] : [locale];
      // Collect per-locale counts + derive filenames.
      type Job = { loc: SingleLocale; count: number };
      const jobs: Job[] = [];
      for (const loc of locales) {
        const s = loc === "de" ? deState : frState;
        if (s?.status !== "loaded") throw new Error("metadata_not_ready");
        jobs.push({ loc, count: s.slideCount });
      }
      const totalSlides = jobs.reduce((sum, j) => sum + j.count, 0);

      // Single-locale + single-slide → direct PNG download (no ZIP).
      if (totalSlides === 1 && jobs.length === 1) {
        const { loc } = jobs[0];
        const url = slideUrl(item.id, 0, loc, cacheBust, true, imageCount);
        const res = await fetch(url);
        if (res.status === 404 || res.status === 410) {
          const handled = await handleSlide404(res);
          if (handled === "deleted") setDeleted(true);
          else setDownloadError("content_changed");
          return;
        }
        if (!res.ok) throw new Error("fetch_failed");
        const blob = await res.blob();
        triggerBlobDownload(
          blob,
          `alit-agenda-${item.id}-${loc}-1.png`,
        );
        return;
      }

      // Multi-slide or "Beide" → ZIP. Audit-semantics: only the FIRST slide
      // per locale-job carries `?download=1`. A single user-click on a
      // 10-slide DE export produces 1 audit event (not 10); "Beide" produces
      // 2 (one per locale) which matches "admin exported DE+FR" intent
      // cleanly (Codex PR-R1 #2).
      const zip = new JSZip();
      for (const job of jobs) {
        const folder = locales.length > 1 ? zip.folder(job.loc) : zip;
        if (!folder) throw new Error("zip_init_failed");
        for (let i = 0; i < job.count; i++) {
          const url = slideUrl(
            item.id,
            i,
            job.loc,
            cacheBust,
            i === 0, // audit only on first slide per locale
            imageCount,
          );
          const res = await fetch(url);
          if (res.status === 404 || res.status === 410) {
            const handled = await handleSlide404(res);
            if (handled === "deleted") setDeleted(true);
            else setDownloadError("content_changed");
            return;
          }
          if (!res.ok) throw new Error("fetch_failed");
          const blob = await res.blob();
          folder.file(`slide-${i + 1}.png`, blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipName =
        locales.length > 1
          ? `alit-agenda-${item.id}-de-fr.zip`
          : `alit-agenda-${item.id}-${locales[0]}.zip`;
      triggerBlobDownload(zipBlob, zipName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadError(msg);
    } finally {
      zipLockRef.current = false;
      setDownloading(false);
    }
  }, [item, deleted, locale, cacheBust, deState, frState, imageCount]);

  if (!item) return null;

  return (
    <Modal
      open={open}
      onClose={guardedOnClose}
      title="Instagram-Post"
      disableClose={downloading || confirmDialog !== null}
      wide
    >
      <div className="relative">
        <div
          className="flex flex-col gap-5"
          inert={confirmDialog !== null ? true : undefined}
        >
          {showImageBanner ? (
            <div className="px-3 py-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded">
              Eingebettete Medien im Beschreibungstext (Inline-Bilder, Videos,
              Embeds) werden nicht in den Post exportiert.
            </div>
          ) : null}

          {deleted ? (
            <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
              Eintrag wurde gelöscht — bitte Modal schließen.
            </div>
          ) : null}

          {tooLong ? (
            <div className="px-3 py-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded">
              Inhalt zu lang — bitte größere Schriftgröße wählen oder kürzen.
              Maximal 10 Slides werden exportiert.
            </div>
          ) : null}

          {imagePartial ? (
            <div
              className="px-3 py-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded"
              role="status"
            >
              Mindestens ein Bild ist nicht mehr verfügbar — der Slide enthält
              leere Zellen. Bitte Mediathek prüfen.
            </div>
          ) : null}

          {/* Locale */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium mb-1">Sprache</legend>
            <div className="flex gap-4">
              <label
                className={`flex items-center gap-2 ${
                  deEmpty ? "opacity-50" : ""
                }`}
                title={deEmpty ? "DE fehlt — erst vervollständigen" : undefined}
              >
                <input
                  type="radio"
                  name="ig-locale"
                  checked={locale === "de"}
                  disabled={deEmpty || downloading}
                  onChange={() => guardedSetLocale("de")}
                />
                DE
              </label>
              <label
                className={`flex items-center gap-2 ${
                  frEmpty ? "opacity-50" : ""
                }`}
                title={frEmpty ? "FR fehlt — erst vervollständigen" : undefined}
              >
                <input
                  type="radio"
                  name="ig-locale"
                  checked={locale === "fr"}
                  disabled={frEmpty || downloading}
                  onChange={() => guardedSetLocale("fr")}
                />
                FR
              </label>
              <label
                className={`flex items-center gap-2 ${
                  bothDisabled ? "opacity-50" : ""
                }`}
                title={
                  deEmpty || frEmpty
                    ? "DE oder FR fehlt — erst vervollständigen"
                    : undefined
                }
              >
                <input
                  type="radio"
                  name="ig-locale"
                  checked={locale === "both"}
                  disabled={bothDisabled}
                  onChange={() => guardedSetLocale("both")}
                />
                Beide
              </label>
            </div>
          </fieldset>

          {/* Image count — only shown when the agenda item actually has
              images attached. With side-by-side layout, this stays enabled
              alongside the editor; changing it while the editor is dirty
              triggers ConfirmDialog (R1 [P2 #5] re-activated). */}
          {maxImages > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium mb-1">
                Bilder mitexportieren{" "}
                <span className="text-gray-400 font-normal">(max {maxImages})</span>
              </legend>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={maxImages}
                  step={1}
                  value={imageCount}
                  onChange={(e) => {
                    const raw = parseInt(e.target.value, 10);
                    const clamped = Number.isNaN(raw)
                      ? 0
                      : Math.max(0, Math.min(maxImages, raw));
                    guardedSetImageCount(clamped);
                  }}
                  disabled={downloading}
                  className="w-20 px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50"
                  aria-label="Anzahl Bilder"
                />
                <span className="text-xs text-gray-500">
                  {imageCount === 0
                    ? "keine Bilder exportieren"
                    : imageCount === 1
                      ? "1 Bild im Slide-1-Grid"
                      : `${imageCount} Bilder im Slide-1-Grid`}
                </span>
              </div>
            </fieldset>
          )}

          {/* Side-by-side: LayoutEditor (left, ~50%) + Preview (right, ~50%)
              when locale is single ("de" | "fr"). When locale === "both",
              the editor hides (LayoutEditor is per-locale) and Preview spans
              full width with both DE and FR columns. */}
          <div className="flex flex-col lg:flex-row gap-6">
            {locale !== "both" && (
              <div className="lg:w-1/2 lg:min-w-0">
                <LayoutEditor
                  itemId={item.id}
                  locale={locale}
                  imageCount={imageCount}
                  onDirtyChange={handleDirtyChange}
                  onSaved={handleEditorSaved}
                  discardKey={discardKey}
                />
              </div>
            )}

            <div className={`flex flex-col gap-4 ${locale !== "both" ? "lg:w-1/2 lg:min-w-0" : "w-full"}`}>
              {activeLocales.map((loc) => {
                const state = loc === "de" ? deState : frState;
                return (
                  <section key={loc} className="flex flex-col gap-2">
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      Vorschau {loc.toUpperCase()}
                    </div>
                    {state === null || state.status === "loading" ? (
                      <div className="text-sm text-gray-500">Lade…</div>
                    ) : state.status === "error" ? (
                      <div className="text-sm text-red-600">
                        {state.reason === "locale_empty"
                          ? "Locale ist leer."
                          : state.reason === "not_found"
                            ? "Eintrag nicht gefunden."
                            : "Netzwerkfehler."}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: state.slideCount }, (_, i) => (
                          <div
                            key={i}
                            className="relative border border-gray-200 rounded overflow-hidden"
                            style={{ aspectRatio: "4 / 5" }}
                          >
                            <SlidePreviewImg
                              key={`${cacheBust}-${loc}-${i}`}
                              src={slideUrl(
                                item.id,
                                i,
                                loc,
                                cacheBust,
                                false,
                                imageCount,
                              )}
                              alt={`Slide ${i + 1}`}
                            />
                            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[11px] bg-black/70 text-white rounded">
                              {i + 1}/{state.slideCount}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>

          {downloadError ? (
            <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
              {downloadError === "content_changed"
                ? "Inhalt hat sich geändert — bitte Modal schließen und erneut öffnen."
                : "Download fehlgeschlagen — bitte erneut versuchen."}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-2 border-t">
            {/* "Schließen" still uses guardedOnClose — with side-by-side
                the editor is always visible (when locale !== "both"), so
                layoutEditorIsDirty can be true at any time. */}
            <button
              type="button"
              onClick={guardedOnClose}
              disabled={downloading}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Schließen
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!canDownload}
              aria-busy={downloading}
              className="px-4 py-2 text-sm bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
            >
              {downloading ? "Exportiere…" : "Download"}
            </button>
          </div>

          <p className="text-xs text-gray-500">
            Hinweis: ZIP-Download funktioniert am besten auf dem Desktop — iOS
            Safari öffnet die Datei teilweise inline.
          </p>
        </div>

        {confirmDialog !== null && (
          <ConfirmDiscardDialog
            intent={confirmDialog.intent}
            onConfirm={handleConfirmDiscard}
            onCancel={handleConfirmCancel}
          />
        )}
      </div>
    </Modal>
  );
}

function ConfirmDiscardDialog({
  intent,
  onConfirm,
  onCancel,
}: {
  intent: ConfirmIntent;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Capture-phase Escape handler — stop propagation so the outer Modal's
  // Escape-listener (which would call onClose direct) doesn't fire.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [onCancel]);

  // ARIA 1.1 §3.22: alertdialog requires focus inside on open.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // The outer Modal's focus-trap (Modal.tsx:57) doesn't filter `[inert]`,
  // so it can pull focus to a background button on Tab cycles. Bounce focus
  // back to Cancel if it lands outside the dialog.
  useEffect(() => {
    const handler = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (target && dialogRef.current && !dialogRef.current.contains(target)) {
        e.stopPropagation();
        cancelRef.current?.focus();
      }
    };
    document.addEventListener("focusin", handler, true);
    return () => document.removeEventListener("focusin", handler, true);
  }, []);

  // Local Tab/Shift-Tab keydown — explicit Cancel ↔ Verwerfen cycle.
  // Belt-and-suspenders alongside the focusin bounce above.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const active = document.activeElement;
      if (active === cancelRef.current && !e.shiftKey) {
        e.preventDefault();
        confirmRef.current?.focus();
      } else if (active === confirmRef.current && e.shiftKey) {
        e.preventDefault();
        cancelRef.current?.focus();
      } else if (active === cancelRef.current && e.shiftKey) {
        e.preventDefault();
        confirmRef.current?.focus();
      } else if (active === confirmRef.current && !e.shiftKey) {
        e.preventDefault();
        cancelRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);

  const bodyKey = ({
    "modal-close": "confirmDiscardBodyModalClose",
    "locale-change": "confirmDiscardBodyLocaleChange",
    "imageCount-change": "confirmDiscardBodyImageCountChange",
  } as const)[intent];

  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby="confirm-discard-title"
      aria-describedby="confirm-discard-body"
      aria-modal="false"
      className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center"
    >
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
        <h3 id="confirm-discard-title" className="text-lg font-semibold mb-2">
          {dashboardStrings.exportModal.confirmDiscardTitle}
        </h3>
        <p id="confirm-discard-body" className="text-sm mb-4">
          {dashboardStrings.exportModal[bodyKey]}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            {dashboardStrings.exportModal.confirmCancel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
          >
            {dashboardStrings.exportModal.confirmDiscard}
          </button>
        </div>
      </div>
    </div>
  );
}

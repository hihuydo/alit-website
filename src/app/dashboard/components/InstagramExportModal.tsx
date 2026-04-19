"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { Modal } from "./Modal";
import {
  isLocaleEmpty,
  type AgendaItemForExport,
  type Scale,
} from "@/lib/instagram-post";

type LocaleChoice = "de" | "fr" | "both";
type SingleLocale = "de" | "fr";

type LocaleState =
  | { status: "loading" }
  | { status: "loaded"; slideCount: number; warnings: string[] }
  | { status: "error"; reason: "locale_empty" | "not_found" | "network" };

type Props = {
  open: boolean;
  onClose: () => void;
  item: AgendaItemForExport | null;
};

const SCALES: { value: Scale; label: string }[] = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
];

function defaultLocale(item: AgendaItemForExport | null): LocaleChoice {
  if (!item) return "de";
  if (!isLocaleEmpty(item, "de")) return "de";
  if (!isLocaleEmpty(item, "fr")) return "fr";
  return "de"; // fallback — button shouldn't open when both empty
}

function hasEmbeddedMedia(item: AgendaItemForExport | null): boolean {
  if (!item) return false;
  if (Array.isArray(item.images) && item.images.length > 0) return true;
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
  scale: Scale,
): Promise<LocaleState> {
  try {
    const res = await fetch(
      `/api/dashboard/agenda/${id}/instagram?locale=${locale}&scale=${scale}`,
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
      warnings: string[];
    };
    return {
      status: "loaded",
      slideCount: body.slideCount,
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
  scale: Scale,
  cacheBust: string,
  download: boolean,
): string {
  const q = new URLSearchParams({
    locale,
    scale,
    v: cacheBust,
  });
  if (download) q.set("download", "1");
  return `/api/dashboard/agenda/${id}/instagram-slide/${idx}?${q.toString()}`;
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

export function InstagramExportModal({ open, onClose, item }: Props) {
  const [locale, setLocale] = useState<LocaleChoice>("de");
  const [scale, setScale] = useState<Scale>("m");
  const [deState, setDeState] = useState<LocaleState | null>(null);
  const [frState, setFrState] = useState<LocaleState | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [cacheBust, setCacheBust] = useState("init");
  const zipLockRef = useRef<boolean>(false);

  // Reset state when modal (re-)opens for a new item. Pick a sensible default
  // locale (whichever side has exportable text).
  useEffect(() => {
    if (!open || !item) return;
    setLocale(defaultLocale(item));
    setScale("m");
    setDeState(null);
    setFrState(null);
    setDownloading(false);
    setDownloadError(null);
    setDeleted(false);
    setCacheBust(String(Date.now()));
    zipLockRef.current = false;
  }, [open, item]);

  // Derived: which locales does the current selection require metadata for?
  const activeLocales: SingleLocale[] = useMemo(() => {
    if (locale === "both") return ["de", "fr"];
    return [locale];
  }, [locale]);

  // Fetch metadata whenever selection or scale changes. Drop stale responses
  // via a local run-id token so slow responses from a previous scale don't
  // overwrite fresh state.
  useEffect(() => {
    if (!open || !item || deleted) return;
    let canceled = false;
    const needs: SingleLocale[] = activeLocales;
    for (const loc of needs) {
      if (loc === "de") setDeState({ status: "loading" });
      if (loc === "fr") setFrState({ status: "loading" });
    }
    Promise.all(
      needs.map(async (loc) => ({
        loc,
        state: await fetchMetadata(item.id, loc, scale),
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
  }, [open, item, activeLocales, scale, deleted]);

  const deEmpty = item ? isLocaleEmpty(item, "de") : true;
  const frEmpty = item ? isLocaleEmpty(item, "fr") : true;
  const showImageBanner = hasEmbeddedMedia(item);

  const deLoading = deState?.status === "loading";
  const frLoading = frState?.status === "loading";
  const metadataUnsettled =
    (locale === "de" && (deState === null || deLoading)) ||
    (locale === "fr" && (frState === null || frLoading)) ||
    (locale === "both" &&
      (deState === null || frState === null || deLoading || frLoading));

  // "Beide" is disabled (a) while either locale is loading/unresolved,
  // (b) if either is locale_empty, (c) while single-flight mutex is active.
  const bothDisabled =
    deEmpty ||
    frEmpty ||
    downloading ||
    (locale === "both" &&
      (deState === null || frState === null || deLoading || frLoading));

  const tooLong =
    (locale !== "fr" &&
      deState?.status === "loaded" &&
      deState.warnings.includes("too_long")) ||
    (locale !== "de" &&
      frState?.status === "loaded" &&
      frState.warnings.includes("too_long"));

  const canDownload =
    !deleted &&
    !downloading &&
    !metadataUnsettled &&
    ((locale === "de" && deState?.status === "loaded") ||
      (locale === "fr" && frState?.status === "loaded") ||
      (locale === "both" &&
        deState?.status === "loaded" &&
        frState?.status === "loaded"));

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
        const url = slideUrl(item.id, 0, loc, scale, cacheBust, true);
        const res = await fetch(url);
        if (res.status === 404 || res.status === 410) {
          setDeleted(true);
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

      // Multi-slide or "Beide" → ZIP.
      const zip = new JSZip();
      for (const job of jobs) {
        const folder = locales.length > 1 ? zip.folder(job.loc) : zip;
        if (!folder) throw new Error("zip_init_failed");
        for (let i = 0; i < job.count; i++) {
          const url = slideUrl(
            item.id,
            i,
            job.loc,
            scale,
            cacheBust,
            true,
          );
          const res = await fetch(url);
          if (res.status === 404 || res.status === 410) {
            setDeleted(true);
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
  }, [item, deleted, locale, scale, cacheBust, deState, frState]);

  if (!item) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Instagram-Post"
      disableClose={downloading}
    >
      <div className="flex flex-col gap-5">
        {showImageBanner ? (
          <div className="px-3 py-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded">
            Bilder im Eintrag werden in v1 nicht in den Post exportiert (nur
            Text).
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
                onChange={() => setLocale("de")}
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
                onChange={() => setLocale("fr")}
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
                onChange={() => setLocale("both")}
              />
              Beide
            </label>
          </div>
        </fieldset>

        {/* Scale */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium mb-1">Schriftgröße</legend>
          <div
            className="flex gap-2"
            role="radiogroup"
            aria-label="Schriftgröße"
          >
            {SCALES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={scale === s.value}
                onClick={() => setScale(s.value)}
                disabled={downloading}
                className={`px-4 py-1.5 rounded border text-sm ${
                  scale === s.value
                    ? "bg-black text-white border-black"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                } disabled:opacity-50`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Preview */}
        <div className="flex flex-col gap-4">
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
                        <img
                          src={slideUrl(
                            item.id,
                            i,
                            loc,
                            scale,
                            cacheBust,
                            false,
                          )}
                          alt={`Slide ${i + 1}`}
                          className="w-full h-full object-cover"
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

        {downloadError ? (
          <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
            Download fehlgeschlagen — bitte erneut versuchen.
          </div>
        ) : null}

        <div className="flex justify-end gap-3 pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
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
    </Modal>
  );
}

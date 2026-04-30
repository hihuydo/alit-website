"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stableStringify } from "@/lib/stable-stringify";
import { dashboardFetch } from "@/app/dashboard/lib/dashboardFetch";
import { dashboardStrings } from "@/app/dashboard/i18n";
import {
  type EditorSlide,
  type ErrorBannerKind,
} from "@/lib/layout-editor-types";
import {
  canMoveNext,
  canMovePrev,
  canSplit,
  moveBlockToNextSlide,
  moveBlockToPrevSlide,
  splitSlideHere,
  validateSlideCount,
} from "@/lib/layout-editor-state";

interface LayoutEditorProps {
  itemId: number;
  locale: "de" | "fr";
  imageCount: number;
  /** Optional in S2a (no caller). In S2b: parent passes useCallback-
   *  stabilized handler so this fires only when isDirty actually flips. */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Optional in S2a. In S2b: parent increments to signal "discard local
   *  edits" without triggering a refetch (after Confirm.Discard). */
  discardKey?: number;
  /** Fires after a successful PUT (save) or DELETE (reset). Parent can
   *  bump a cacheBust so any side-by-side preview re-fetches the new
   *  rendered slides. Stable identity (useCallback) recommended. */
  onSaved?: () => void;
}

type EditorMode = "loading" | "ready" | "saving" | "deleting" | "error";

type ServerState = {
  mode: "auto" | "manual" | "stale";
  contentHash: string | null;
  layoutVersion: string | null;
  imageCount: number;
  availableImages: number;
  warnings: string[];
  initialSlides: EditorSlide[];
};

// MODULE-LEVEL pure mapper: HTTP status + body.error → banner kind.
// Declared outside the component because it has no closure captures —
// re-instantiation per render would be wasted work.
function mapPutErrorToBannerKind(
  status: number,
  apiError: string | undefined,
): ErrorBannerKind {
  if (status === 409) return "content_changed";
  if (status === 412) return "layout_modified";
  if (status === 400 && apiError === "too_many_slides_for_grid") return "too_many_slides_for_grid";
  if (status === 400 && apiError === "too_many_slides") return "too_many_slides";
  // Defence-in-depth: empty_layout is normally caught client-side in
  // validateSlideCount (no PUT sent). This 400-branch is the fallback if
  // future code bypasses the client-side guard.
  if (status === 400 && apiError === "empty_layout") return "empty_layout";
  if (status === 422 && apiError === "incomplete_layout") return "incomplete_layout";
  if (status === 422 && apiError === "unknown_block") return "unknown_block";
  if (status === 422 && apiError === "duplicate_block") return "duplicate_block";
  return "generic";
}

export function LayoutEditor({
  itemId,
  locale,
  imageCount,
  onDirtyChange,
  discardKey,
  onSaved,
}: LayoutEditorProps) {
  const [serverState, setServerState] = useState<ServerState | null>(null);
  const [editedSlides, setEditedSlides] = useState<EditorSlide[]>([]);
  const [refetchKey, setRefetchKey] = useState(0);
  const [editorMode, setEditorMode] = useState<EditorMode>("loading");
  const [errorBanner, setErrorBanner] = useState<{
    kind: ErrorBannerKind;
    message: string;
  } | null>(null);

  const initialSnapshot = useMemo(
    () => stableStringify(serverState?.initialSlides ?? []),
    [serverState],
  );

  // Codex R1 [P2]: do NOT gate isDirty on editorMode. Otherwise during
  // editorMode==="saving" isDirty briefly returns false → onDirtyChange
  // broadcasts (false) while the PUT is still in flight, and a parent
  // (S2b) would treat the modal as clean and allow close/tab-switch
  // mid-save. editorMode is for control disable-state only; the dirty
  // signal must remain a pure snapshot-diff.
  const isDirty = useMemo(
    () => stableStringify(editedSlides) !== initialSnapshot,
    [editedSlides, initialSnapshot],
  );

  // Mirrors instagram-post.ts:resolveImages — grid renders only if BOTH
  // conditions hold.
  const hasGrid = useMemo(
    () =>
      (serverState?.imageCount ?? 0) >= 1 &&
      (serverState?.availableImages ?? 0) >= 1,
    [serverState],
  );

  // R6 [CONTRACT-FIX]: server may return a cap-merged override
  // (warnings:["too_many_blocks_for_layout"]). After GET editedSlides ===
  // initialSlides → isDirty=false. Without this derived bool the admin
  // could not persist the merged state without a fake-edit, contradicting
  // the i18n copy "Speichern setzt den zusammengeführten Stand".
  //
  // Codex R1 [P2]: gate on mode==="manual". The route emits this warning
  // ALSO for auto/stale layouts where it slice()s the tail (drops block
  // IDs instead of merging). A "save" in that case would PUT a body with
  // missing block-IDs and hit the server's incomplete_layout 422. Only
  // the manual branch actually merges the tail (route.ts:160-175), so
  // only manual is safe to save without an edit.
  const canSaveMergedLayout =
    serverState?.mode === "manual" &&
    serverState.warnings.includes("too_many_blocks_for_layout");

  // Codex R2 [P2]: auto/stale + too_many_blocks_for_layout means the GET
  // route slice()d the tail (route.ts:184-200) — editedSlides has fewer
  // blocks than item content. ANY save (with or without edit) would PUT
  // an incomplete block-list and hit the server's incomplete_layout 422.
  // Block save entirely; user must shorten content via the journal-content
  // editor instead. Banner copy is also mode-specific (auto uses the
  // _auto-suffix body) so we don't lie about a non-existent "merge".
  const isAutoOverCap =
    serverState?.mode !== "manual" &&
    (serverState?.warnings.includes("too_many_blocks_for_layout") ?? false);

  const saveDisabled =
    (!isDirty && !canSaveMergedLayout) ||
    isAutoOverCap ||
    editorMode !== "ready" ||
    serverState?.mode === "stale" ||
    serverState?.warnings.includes("orphan_image_count") ||
    errorBanner?.kind === "content_changed" ||
    errorBanner?.kind === "incomplete_layout" ||
    errorBanner?.kind === "unknown_block" ||
    errorBanner?.kind === "duplicate_block";

  const resetDisabled =
    !serverState ||
    serverState.layoutVersion === null ||
    editorMode === "deleting" ||
    editorMode === "saving";

  // Adjust state during render — clear validation banners on edit.
  // Pattern from patterns/react.md (avoid useEffect for derived state).
  const [snapshotForBannerClear, setSnapshotForBannerClear] = useState<
    string | null
  >(null);
  const currentSnapshot = stableStringify(editedSlides);
  if (
    currentSnapshot !== snapshotForBannerClear &&
    errorBanner &&
    (errorBanner.kind === "too_many_slides" ||
      errorBanner.kind === "too_many_slides_for_grid" ||
      errorBanner.kind === "empty_layout")
  ) {
    setSnapshotForBannerClear(currentSnapshot);
    setErrorBanner(null);
  }
  if (currentSnapshot !== snapshotForBannerClear && !errorBanner) {
    setSnapshotForBannerClear(currentSnapshot);
  }

  // Fetch on (itemId, locale, imageCount, refetchKey)-change.
  // The four setState calls at the top of the effect are the canonical
  // "clear stale state before async work" pattern. They do not cascade —
  // each runs once per effect-fire and the async branch awaits before
  // any further setState. The react-hooks/set-state-in-effect rule
  // overshoots here; the SWR/useSyncExternalStore alternative is
  // overkill for a single-component fetch.
  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setEditorMode("loading");
    setServerState(null);
    setEditedSlides([]);
    setErrorBanner(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    (async () => {
      try {
        const res = await dashboardFetch(
          `/api/dashboard/agenda/${itemId}/instagram-layout/?locale=${locale}&images=${imageCount}`,
          { method: "GET" },
        );
        if (cancelled) return;
        if (!res.ok) {
          setEditorMode("error");
          setErrorBanner({
            kind: "generic",
            message: dashboardStrings.layoutEditor.errors.generic,
          });
          return;
        }
        const body = await res.json();
        // Strip server-only `index` property — pure helpers produce slides
        // without it; if we kept it, stableStringify would diverge after
        // the first edit and isDirty would be permanently true.
        const stripped: EditorSlide[] = (body.slides ?? []).map(
          (s: { blocks: EditorSlide["blocks"] }) => ({ blocks: s.blocks }),
        );
        setServerState({
          mode: body.mode,
          contentHash: body.contentHash,
          layoutVersion: body.layoutVersion,
          imageCount: body.imageCount,
          availableImages: body.availableImages,
          warnings: body.warnings ?? [],
          initialSlides: stripped,
        });
        setEditedSlides(stripped);
        setEditorMode("ready");
      } catch {
        if (cancelled) return;
        setEditorMode("error");
        setErrorBanner({
          kind: "network",
          message: dashboardStrings.layoutEditor.errors.network,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itemId, locale, imageCount, refetchKey]);

  // Broadcast isDirty upward.
  useEffect(() => {
    if (!onDirtyChange) return;
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // discardKey-effect: revert local edits to server-truth (no refetch).
  // serverState intentionally NOT in deps — effect must only fire on
  // discardKey-change, not on every refetch (would re-revert mid-edit).
  // serverStateRef holds the latest snapshot so the effect can read it
  // without subscribing to it. (Codex R1 cleanup: previous version used
  // an eslint-disable for exhaustive-deps; the rule no longer flags
  // ref-reads, so the disable was unused.)
  const serverStateRef = useRef(serverState);
  useEffect(() => {
    serverStateRef.current = serverState;
  }, [serverState]);

  const isFirstDiscardKey = useRef(true);
  useEffect(() => {
    if (isFirstDiscardKey.current) {
      isFirstDiscardKey.current = false;
      return;
    }
    const snapshot = serverStateRef.current;
    if (!snapshot) return;
    setEditedSlides(snapshot.initialSlides);
  }, [discardKey]);

  const handleSave = useCallback(async () => {
    // R6 [CONTRACT-FIX] + Codex R1 [P2]: allow save without dirty in the
    // manual cap-merged case ONLY (auto-mode emits the same warning but
    // slice()s the tail → PUT would fail with incomplete_layout). Inline
    // recompute keeps useCallback deps tight.
    if (!serverState) return;
    const canSaveMerged =
      serverState.mode === "manual" &&
      serverState.warnings.includes("too_many_blocks_for_layout");
    // Codex R2 [P2]: defence-in-depth — even if a future refactor
    // forgets to wire isAutoOverCap into saveDisabled, the handler
    // refuses to PUT an incomplete-by-construction body.
    const isAutoOverCapInline =
      serverState.mode !== "manual" &&
      serverState.warnings.includes("too_many_blocks_for_layout");
    if (isAutoOverCapInline) return;
    if (!isDirty && !canSaveMerged) return;
    const validation = validateSlideCount(editedSlides, hasGrid);
    if (!validation.ok) {
      setErrorBanner({
        kind: validation.reason,
        message: dashboardStrings.layoutEditor.errors[validation.reason],
      });
      return;
    }

    setEditorMode("saving");
    setErrorBanner(null);
    try {
      const res = await dashboardFetch(
        `/api/dashboard/agenda/${itemId}/instagram-layout/`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale,
            imageCount,
            contentHash: serverState.contentHash,
            layoutVersion: serverState.layoutVersion,
            slides: editedSlides.map((s) => ({
              blocks: s.blocks.map((b) => b.id),
            })),
          }),
        },
      );

      if (res.status === 200) {
        setRefetchKey((k) => k + 1);
        onSaved?.();
        return;
      }
      const body = await res.json().catch(() => ({}));
      const errorKey = mapPutErrorToBannerKind(res.status, body?.error);
      setErrorBanner({
        kind: errorKey,
        message: dashboardStrings.layoutEditor.errors[errorKey],
      });
      setEditorMode("ready");
    } catch {
      setErrorBanner({
        kind: "network",
        message: dashboardStrings.layoutEditor.errors.network,
      });
      setEditorMode("ready");
    }
  }, [serverState, isDirty, editedSlides, hasGrid, itemId, locale, imageCount, onSaved]);

  const handleReset = useCallback(async () => {
    if (!serverState) return;
    setEditorMode("deleting");
    setErrorBanner(null);
    try {
      const res = await dashboardFetch(
        `/api/dashboard/agenda/${itemId}/instagram-layout/?locale=${locale}&images=${imageCount}`,
        { method: "DELETE" },
      );
      if (res.status === 204) {
        setRefetchKey((k) => k + 1);
        onSaved?.();
        return;
      }
      setErrorBanner({
        kind: "delete_failed",
        message: dashboardStrings.layoutEditor.errors.delete_failed,
      });
      setEditorMode("ready");
    } catch {
      setErrorBanner({
        kind: "network",
        message: dashboardStrings.layoutEditor.errors.network,
      });
      setEditorMode("ready");
    }
  }, [serverState, itemId, locale, imageCount, onSaved]);

  const handleMovePrev = (slideIdx: number, blockIdx: number) =>
    setEditedSlides((s) => moveBlockToPrevSlide(s, slideIdx, blockIdx));
  const handleMoveNext = (slideIdx: number, blockIdx: number) =>
    setEditedSlides((s) => moveBlockToNextSlide(s, slideIdx, blockIdx));
  const handleSplit = (slideIdx: number, blockIdx: number) =>
    setEditedSlides((s) => splitSlideHere(s, slideIdx, blockIdx));

  if (editorMode === "loading") {
    return (
      <p className="text-sm text-gray-500">
        {dashboardStrings.layoutEditor.loading}
      </p>
    );
  }

  if (editorMode === "error" && !serverState) {
    return (
      <div role="alert" className="bg-red-50 border border-red-300 p-4 rounded">
        <p className="text-sm mb-2">
          {errorBanner?.message ?? dashboardStrings.layoutEditor.errors.generic}
        </p>
        <button
          type="button"
          onClick={() => setRefetchKey((k) => k + 1)}
          className="px-3 py-1.5 text-sm border border-red-700 rounded"
        >
          {dashboardStrings.layoutEditor.retry}
        </button>
      </div>
    );
  }

  // Orphan check first — S1b returns mode:"stale" + warnings:
  // ["orphan_image_count"] simultaneously; without this guard both
  // banners would render and contradict each other.
  const isOrphan = serverState?.warnings.includes("orphan_image_count") ?? false;
  const isStale = serverState?.mode === "stale" && !isOrphan;

  return (
    <div className="space-y-4">
      {isStale && (
        <div role="alert" className="bg-yellow-50 border border-yellow-300 p-4 rounded">
          <h4 className="font-semibold mb-1">
            {dashboardStrings.layoutEditor.staleTitle}
          </h4>
          <p className="text-sm mb-2">
            {dashboardStrings.layoutEditor.staleBody}
          </p>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetDisabled}
            className="px-3 py-1.5 text-sm border border-yellow-700 rounded"
          >
            {dashboardStrings.layoutEditor.resetToAuto}
          </button>
        </div>
      )}

      {isOrphan && (
        <div role="alert" className="bg-blue-50 border border-blue-300 p-4 rounded">
          <h4 className="font-semibold mb-1">
            {dashboardStrings.layoutEditor.orphanTitle}
          </h4>
          <p className="text-sm mb-2">
            {dashboardStrings.layoutEditor.orphanBody.replace(
              "{n}",
              String(serverState?.availableImages ?? 0),
            )}
          </p>
          {serverState?.layoutVersion !== null && (
            <button
              type="button"
              onClick={handleReset}
              disabled={resetDisabled}
              className="px-3 py-1.5 text-sm border border-blue-700 rounded"
            >
              {dashboardStrings.layoutEditor.resetOrphan}
            </button>
          )}
        </div>
      )}

      {serverState?.warnings.includes("too_many_blocks_for_layout") && (
        <div role="alert" className="bg-amber-50 border border-amber-300 p-4 rounded">
          <h4 className="font-semibold mb-1">
            {dashboardStrings.layoutEditor.tooManyBlocksTitle}
          </h4>
          <p className="text-sm">
            {serverState.mode === "manual"
              ? dashboardStrings.layoutEditor.tooManyBlocksBodyManual
              : dashboardStrings.layoutEditor.tooManyBlocksBodyAuto}
          </p>
        </div>
      )}

      {/* Reset/Network banners must surface even in stale/orphan mode —
          otherwise a failed reset is silent. Other validation/CAS banners
          are suppressed in stale/orphan because the dedicated banner
          already explains the situation. */}
      {errorBanner &&
        (errorBanner.kind === "delete_failed" || errorBanner.kind === "network") && (
          <div role="alert" className="bg-red-50 border border-red-300 p-4 rounded">
            <p className="text-sm">{errorBanner.message}</p>
          </div>
        )}
      {errorBanner &&
        errorBanner.kind !== "delete_failed" &&
        errorBanner.kind !== "network" &&
        !isStale &&
        !isOrphan && (
          <div role="alert" className="bg-red-50 border border-red-300 p-4 rounded">
            <p className="text-sm">{errorBanner.message}</p>
          </div>
        )}

      {isOrphan ? (
        <p className="text-sm text-gray-500 italic">
          {dashboardStrings.layoutEditor.orphanEmptyEditor}
        </p>
      ) : (
        // index-as-key is intentional — EditorSlide has no stable slide-id;
        // the only stable IDs are at block level. Trade-off: focus state on
        // move-buttons resets after split, but no data-correctness bug.
        editedSlides.map((slide, slideIdx) => (
          <div key={slideIdx} className="border rounded p-3">
            <h5 className="text-xs font-semibold text-gray-500 mb-2">
              {dashboardStrings.layoutEditor.slideLabel.replace(
                "{n}",
                String(slideIdx + 1),
              )}
            </h5>
            {slide.blocks.map((block, blockIdx) => (
              <div
                key={block.id}
                className="border-t pt-2 first:border-t-0 first:pt-0 mt-2 first:mt-0"
              >
                <p className={`text-sm ${block.isHeading ? "font-semibold" : ""}`}>
                  {block.text}
                </p>
                <div className="flex gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => handleMovePrev(slideIdx, blockIdx)}
                    disabled={
                      !canMovePrev(slideIdx, blockIdx) || editorMode !== "ready"
                    }
                    className="px-2 py-0.5 text-xs border rounded"
                  >
                    {dashboardStrings.layoutEditor.movePrev}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveNext(slideIdx, blockIdx)}
                    disabled={
                      !canMoveNext(editedSlides, slideIdx) || editorMode !== "ready"
                    }
                    className="px-2 py-0.5 text-xs border rounded"
                  >
                    {dashboardStrings.layoutEditor.moveNext}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSplit(slideIdx, blockIdx)}
                    disabled={!canSplit(blockIdx) || editorMode !== "ready"}
                    className="px-2 py-0.5 text-xs border rounded"
                  >
                    {dashboardStrings.layoutEditor.splitHere}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      {!isOrphan && serverState && (
        <div className="flex gap-2 border-t pt-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveDisabled}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded disabled:bg-gray-300"
          >
            {dashboardStrings.layoutEditor.save}
          </button>
          {serverState.layoutVersion !== null && (
            <button
              type="button"
              onClick={handleReset}
              disabled={resetDisabled}
              className="px-4 py-2 text-sm font-medium border rounded"
            >
              {dashboardStrings.layoutEditor.resetToAuto}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

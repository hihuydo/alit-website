"use client";

import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ChangeEvent,
} from "react";
import type { AgendaImage } from "@/lib/agenda-images";
import { dashboardStrings } from "../i18n";
import { Modal } from "./Modal";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const TARGET_ASPECT = 2 / 3;

interface CropModalProps {
  open: boolean;
  onClose: () => void;
  image: AgendaImage;
  onSave: (cropX: number, cropY: number, fit: "cover" | "contain") => void;
}

export function CropModal({ open, onClose, image, onSave }: CropModalProps) {
  const t = dashboardStrings.agenda.crop;

  const [draftCropX, setDraftCropX] = useState(image.cropX ?? 50);
  const [draftCropY, setDraftCropY] = useState(image.cropY ?? 50);
  const [draftFit, setDraftFit] = useState<"cover" | "contain">(image.fit ?? "cover");
  const [imgLoaded, setImgLoaded] = useState(false);
  const [prevImage, setPrevImage] = useState(image);

  // Re-init bei image-prop change — synchronously during render. Kein useEffect
  // (react.md anti-pattern). prevOpen-Tracking entfernt — unter conditional
  // rendering mountet das Component frisch bei Re-Open, useState-init übernimmt.
  if (image !== prevImage) {
    setPrevImage(image);
    setDraftCropX(image.cropX ?? 50);
    setDraftCropY(image.cropY ?? 50);
    setDraftFit(image.fit ?? "cover");
    setImgLoaded(false);
  }

  // In contain-Mode are pan controls (X/Y, drag, frame-overlay) irrelevant —
  // the entire image is shown letterboxed, no cropping happens. Disable + dim.
  const panDisabled = draftFit === "contain";

  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{
    cropX: number;
    cropY: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

  // Resize-Invalidation: getBoundingClientRect() ist render-time inline; React
  // re-rendert nicht automatisch auf window-resize. Force-rerender bei resize
  // oder orientationchange während Modal offen ist.
  const [, forceRerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!open) return;
    const handler = () => forceRerender();
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
    };
  }, [open]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (panDisabled) return;
    if (!imgLoaded || !imgRef.current) return;
    dragStartRef.current = {
      cropX: draftCropX,
      cropY: draftCropY,
      pointerX: e.clientX,
      pointerY: e.clientY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || !imgRef.current) return;
    const { width: cw, height: ch } = imgRef.current.getBoundingClientRect();
    if (cw === 0 || ch === 0) return;
    const imageAspect = cw / ch;
    const xHasRoom = imageAspect > TARGET_ASPECT;
    const yHasRoom = imageAspect < TARGET_ASPECT;
    const start = dragStartRef.current;
    const newCropX = clamp(
      start.cropX + ((e.clientX - start.pointerX) / cw) * 100,
      0,
      100,
    );
    const newCropY = clamp(
      start.cropY + ((e.clientY - start.pointerY) / ch) * 100,
      0,
      100,
    );
    if (xHasRoom) setDraftCropX(newCropX);
    if (yHasRoom) setDraftCropY(newCropY);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const key = e.key;
    if (
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "ArrowUp" &&
      key !== "ArrowDown"
    ) {
      return;
    }
    if (panDisabled) return;
    e.preventDefault();
    if (!imgLoaded || !imgRef.current) return;
    const { width: cw, height: ch } = imgRef.current.getBoundingClientRect();
    if (cw === 0 || ch === 0) return;
    const imageAspect = cw / ch;
    const xHasRoom = imageAspect > TARGET_ASPECT;
    const yHasRoom = imageAspect < TARGET_ASPECT;
    const step = e.shiftKey ? 10 : 1;
    if (key === "ArrowLeft" && xHasRoom) {
      setDraftCropX((prev) => clamp(prev - step, 0, 100));
    } else if (key === "ArrowRight" && xHasRoom) {
      setDraftCropX((prev) => clamp(prev + step, 0, 100));
    } else if (key === "ArrowUp" && yHasRoom) {
      setDraftCropY((prev) => clamp(prev - step, 0, 100));
    } else if (key === "ArrowDown" && yHasRoom) {
      setDraftCropY((prev) => clamp(prev + step, 0, 100));
    }
  };

  const onChangeX = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === "") return;
    const parsed = Number(v);
    if (Number.isFinite(parsed)) setDraftCropX(clamp(parsed, 0, 100));
  };

  const onChangeY = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === "") return;
    const parsed = Number(v);
    if (Number.isFinite(parsed)) setDraftCropY(clamp(parsed, 0, 100));
  };

  // Frame-Math (inline während render, fresh bei jedem state-change und
  // resize-invalidation). Nur ausgewertet wenn imgLoaded — siehe unten.
  let frameLeft = 0;
  let frameTop = 0;
  let frameWidth = 0;
  let frameHeight = 0;
  if (imgLoaded && imgRef.current) {
    const { width: cw, height: ch } = imgRef.current.getBoundingClientRect();
    if (cw > 0 && ch > 0) {
      const containerAspect = cw / ch;
      frameWidth =
        containerAspect > TARGET_ASPECT ? ch * TARGET_ASPECT : cw;
      frameHeight =
        containerAspect > TARGET_ASPECT ? ch : cw / TARGET_ASPECT;
      const frameCenterX = (cw * draftCropX) / 100;
      const frameCenterY = (ch * draftCropY) / 100;
      frameLeft = clamp(frameCenterX - frameWidth / 2, 0, cw - frameWidth);
      frameTop = clamp(frameCenterY - frameHeight / 2, 0, ch - frameHeight);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t.modalTitle}>
      <div className="flex flex-col gap-4">
        <div
          role="application"
          tabIndex={0}
          aria-label={t.dragHint}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          style={{
            position: "relative",
            width: "fit-content",
            margin: "0 auto",
            touchAction: "none",
            cursor: imgLoaded ? "grab" : "default",
            outline: "none",
          }}
        >
          <img
            ref={imgRef}
            data-testid="crop-image"
            src={`/api/media/${image.public_id}/`}
            alt={image.alt ?? ""}
            onLoad={() => setImgLoaded(true)}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: "70vh",
              objectFit: "contain",
              userSelect: "none",
              WebkitUserDrag: "none",
            } as React.CSSProperties}
            draggable={false}
          />
          {imgLoaded && !panDisabled && (
            <div
              data-testid="crop-frame-overlay"
              aria-label={t.frameLabel}
              style={{
                position: "absolute",
                left: frameLeft,
                top: frameTop,
                width: frameWidth,
                height: frameHeight,
                border: "2px solid rgba(255,255,255,0.9)",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        {/* Fit-Selector — radio group, default cover. Switching to contain
            disables pan controls (irrelevant for letterboxed display). */}
        <div className="flex gap-4 items-center justify-center text-sm">
          <span className="font-medium">{t.fitLabel}</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="image-fit"
              value="cover"
              checked={draftFit === "cover"}
              onChange={() => setDraftFit("cover")}
              data-testid="crop-fit-cover"
            />
            <span>{t.fitCover}</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="image-fit"
              value="contain"
              checked={draftFit === "contain"}
              onChange={() => setDraftFit("contain")}
              data-testid="crop-fit-contain"
            />
            <span>{t.fitContain}</span>
          </label>
        </div>

        <div className={`flex gap-4 items-end justify-center ${panDisabled ? "opacity-40" : ""}`}>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t.xLabel}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round(draftCropX)}
              onChange={onChangeX}
              disabled={panDisabled}
              className="border border-black px-2 py-1 w-24 disabled:cursor-not-allowed"
              data-testid="crop-input-x"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t.yLabel}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round(draftCropY)}
              onChange={onChangeY}
              disabled={panDisabled}
              className="border border-black px-2 py-1 w-24 disabled:cursor-not-allowed"
              data-testid="crop-input-y"
            />
          </label>
        </div>
        {panDisabled && (
          <p className="text-xs text-gray-500 text-center -mt-2" data-testid="crop-pan-disabled-hint">
            {t.fitContainHint}
          </p>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={() => {
              setDraftCropX(50);
              setDraftCropY(50);
              setDraftFit("cover");
            }}
            className="border border-black px-3 py-1"
            data-testid="crop-reset"
          >
            {t.reset}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border border-black px-3 py-1"
            data-testid="crop-cancel"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => onSave(draftCropX, draftCropY, draftFit)}
            className="border border-black bg-black text-white px-3 py-1"
            data-testid="crop-save"
          >
            {t.save}
          </button>
        </div>
      </div>
    </Modal>
  );
}

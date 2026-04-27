// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CropModal } from "./CropModal";
import type { AgendaImage } from "@/lib/agenda-images";

beforeEach(() => {
  // jsdom lacks pointer-capture API — stub on prototype.
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeImage(overrides: Partial<AgendaImage> = {}): AgendaImage {
  return {
    public_id: "test-img",
    orientation: "landscape",
    width: 1600,
    height: 900,
    alt: null,
    ...overrides,
  };
}

/**
 * stubGetBoundingClientRect — replaces HTMLImageElement.prototype.getBoundingClientRect
 * with a fixture returning fixed cw/ch. The frame-overlay math + drag delta
 * computations both read this. Returning the same DOMRect for all <img>s in the
 * jsdom render is fine — we only have one in the modal.
 */
function stubImgRect(width: number, height: number) {
  HTMLImageElement.prototype.getBoundingClientRect = vi.fn(
    () => ({
      width,
      height,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      toJSON: () => ({}),
    }) as DOMRect,
  );
}

describe("CropModal", () => {
  it("renders with initial draft from image.cropX/cropY (or default 50/50) and src trailing slash", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <CropModal open onClose={onClose} image={makeImage({ cropX: 30, cropY: 40 })} onSave={onSave} />,
    );
    const x = screen.getByTestId("crop-input-x") as HTMLInputElement;
    const y = screen.getByTestId("crop-input-y") as HTMLInputElement;
    expect(x.value).toBe("30");
    expect(y.value).toBe("40");
    const img = screen.getByTestId("crop-image") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/media/test-img/");
  });

  it("defaults draft to 50/50 when image has no crop", () => {
    render(
      <CropModal open onClose={vi.fn()} image={makeImage()} onSave={vi.fn()} />,
    );
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("50");
    expect((screen.getByTestId("crop-input-y") as HTMLInputElement).value).toBe("50");
  });

  it("numeric input X updates draftX, empty string preserves prior value", () => {
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50 })} onSave={vi.fn()} />,
    );
    const x = screen.getByTestId("crop-input-x") as HTMLInputElement;
    fireEvent.change(x, { target: { value: "70" } });
    expect(x.value).toBe("70");
    fireEvent.change(x, { target: { value: "" } });
    // empty preserves: previous valid was 70, NOT snap to 0
    expect(x.value).toBe("70");
  });

  it("numeric input Y updates draftY, empty string preserves prior value (axis symmetry)", () => {
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropY: 50 })} onSave={vi.fn()} />,
    );
    const y = screen.getByTestId("crop-input-y") as HTMLInputElement;
    fireEvent.change(y, { target: { value: "25" } });
    expect(y.value).toBe("25");
    fireEvent.change(y, { target: { value: "" } });
    expect(y.value).toBe("25");
  });

  it("Reset button sets both to 50", () => {
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 10, cropY: 90 })} onSave={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("crop-reset"));
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("50");
    expect((screen.getByTestId("crop-input-y") as HTMLInputElement).value).toBe("50");
  });

  it("Save button calls onSave with current draft", () => {
    const onSave = vi.fn();
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 30, cropY: 70 })} onSave={onSave} />,
    );
    fireEvent.click(screen.getByTestId("crop-save"));
    expect(onSave).toHaveBeenCalledWith(30, 70);
  });

  it("Cancel button calls onClose without onSave", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <CropModal open onClose={onClose} image={makeImage()} onSave={onSave} />,
    );
    fireEvent.click(screen.getByTestId("crop-cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Pan-Drag pointerDown+Move+Up updates draftX/draftY synchronously (landscape, X has room)", () => {
    stubImgRect(320, 180);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50, cropY: 50 })} onSave={vi.fn()} />,
    );
    const img = screen.getByTestId("crop-image");
    fireEvent.load(img);
    const container = screen.getByRole("application");
    fireEvent.pointerDown(container, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(container, { pointerId: 1, clientX: 64, clientY: 0 });
    // 64/320 * 100 = 20 → cropX = 50 + 20 = 70
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("70");
    fireEvent.pointerUp(container, { pointerId: 1 });
  });

  it("Pan-Drag clamped at 0 when dragged far left", () => {
    stubImgRect(320, 180);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50, cropY: 50 })} onSave={vi.fn()} />,
    );
    fireEvent.load(screen.getByTestId("crop-image"));
    const c = screen.getByRole("application");
    fireEvent.pointerDown(c, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(c, { pointerId: 1, clientX: -10000, clientY: 0 });
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("0");
  });

  it("Pan-Drag clamped at 100 when dragged far right", () => {
    stubImgRect(320, 180);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50, cropY: 50 })} onSave={vi.fn()} />,
    );
    fireEvent.load(screen.getByTestId("crop-image"));
    const c = screen.getByRole("application");
    fireEvent.pointerDown(c, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(c, { pointerId: 1, clientX: 99999, clientY: 0 });
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("100");
  });

  it("Arrow-Right nudges X by 1, Arrow-Left by -1 (landscape, X has room)", () => {
    stubImgRect(320, 180);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50, cropY: 50 })} onSave={vi.fn()} />,
    );
    fireEvent.load(screen.getByTestId("crop-image"));
    const c = screen.getByRole("application");
    fireEvent.keyDown(c, { key: "ArrowRight" });
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("51");
    fireEvent.keyDown(c, { key: "ArrowLeft" });
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("50");
  });

  it("Arrow-Down nudges Y by 1, Arrow-Up by -1 (portrait 1:2, Y has room)", () => {
    stubImgRect(200, 400);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50, cropY: 50, orientation: "portrait" })} onSave={vi.fn()} />,
    );
    fireEvent.load(screen.getByTestId("crop-image"));
    const c = screen.getByRole("application");
    fireEvent.keyDown(c, { key: "ArrowDown" });
    expect((screen.getByTestId("crop-input-y") as HTMLInputElement).value).toBe("51");
    fireEvent.keyDown(c, { key: "ArrowUp" });
    expect((screen.getByTestId("crop-input-y") as HTMLInputElement).value).toBe("50");
  });

  it("Shift+Arrow nudges by 10 (X right + Y down)", () => {
    stubImgRect(320, 180);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50, cropY: 50 })} onSave={vi.fn()} />,
    );
    fireEvent.load(screen.getByTestId("crop-image"));
    const c = screen.getByRole("application");
    fireEvent.keyDown(c, { key: "ArrowRight", shiftKey: true });
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("60");
    // Switch fixture to portrait for Y test
    cleanup();
    stubImgRect(200, 400);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50, cropY: 50, orientation: "portrait" })} onSave={vi.fn()} />,
    );
    fireEvent.load(screen.getByTestId("crop-image"));
    const c2 = screen.getByRole("application");
    fireEvent.keyDown(c2, { key: "ArrowDown", shiftKey: true });
    expect((screen.getByTestId("crop-input-y") as HTMLInputElement).value).toBe("60");
  });

  it("onPointerCancel clears dragStartRef + releases capture", () => {
    stubImgRect(320, 180);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50, cropY: 50 })} onSave={vi.fn()} />,
    );
    fireEvent.load(screen.getByTestId("crop-image"));
    const c = screen.getByRole("application");
    fireEvent.pointerDown(c, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerCancel(c, { pointerId: 1 });
    // After cancel, a subsequent move with no down should NOT mutate state
    fireEvent.pointerMove(c, { pointerId: 1, clientX: 200, clientY: 0 });
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("50");
    expect(HTMLElement.prototype.releasePointerCapture).toHaveBeenCalled();
  });

  it("pointerDown before image onLoad is a no-op (no state change)", () => {
    stubImgRect(320, 180);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50, cropY: 50 })} onSave={vi.fn()} />,
    );
    // Do NOT fire load.
    const c = screen.getByRole("application");
    fireEvent.pointerDown(c, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(c, { pointerId: 1, clientX: 64, clientY: 0 });
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("50");
  });

  it("frozen-axis arrows: landscape 16:9 + ArrowDown → Y unchanged + preventDefault", () => {
    stubImgRect(320, 180);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50, cropY: 50 })} onSave={vi.fn()} />,
    );
    fireEvent.load(screen.getByTestId("crop-image"));
    const c = screen.getByRole("application");
    const before = (screen.getByTestId("crop-input-y") as HTMLInputElement).value;
    const ev = fireEvent.keyDown(c, { key: "ArrowDown" });
    expect((screen.getByTestId("crop-input-y") as HTMLInputElement).value).toBe(before);
    expect(ev).toBe(false); // preventDefault returns false from fireEvent
  });

  it("frozen-axis arrows: portrait 1:2 + ArrowRight → X unchanged + preventDefault", () => {
    stubImgRect(200, 400);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage({ cropX: 50, cropY: 50, orientation: "portrait" })} onSave={vi.fn()} />,
    );
    fireEvent.load(screen.getByTestId("crop-image"));
    const c = screen.getByRole("application");
    const before = (screen.getByTestId("crop-input-x") as HTMLInputElement).value;
    const ev = fireEvent.keyDown(c, { key: "ArrowRight" });
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe(before);
    expect(ev).toBe(false);
  });

  it("Pan-Container has role=application + tabIndex=0 + aria-label", () => {
    render(
      <CropModal open onClose={vi.fn()} image={makeImage()} onSave={vi.fn()} />,
    );
    const c = screen.getByRole("application");
    expect(c.getAttribute("tabIndex")).toBe("0");
    expect(c.getAttribute("aria-label")).toBeTruthy();
  });

  it("Modal title is rendered", () => {
    render(
      <CropModal open onClose={vi.fn()} image={makeImage()} onSave={vi.fn()} />,
    );
    expect(screen.getByText("Bildausschnitt")).toBeTruthy();
  });

  it("All buttons have type='button' (form-submit-trap regression)", () => {
    render(
      <CropModal open onClose={vi.fn()} image={makeImage()} onSave={vi.fn()} />,
    );
    ["crop-reset", "crop-cancel", "crop-save"].forEach((id) => {
      const b = screen.getByTestId(id) as HTMLButtonElement;
      expect(b.type).toBe("button");
    });
  });

  it("On image-prop change while open, draft re-initialized", () => {
    const { rerender } = render(
      <CropModal open onClose={vi.fn()} image={makeImage({ public_id: "a", cropX: 20, cropY: 30 })} onSave={vi.fn()} />,
    );
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("20");
    rerender(
      <CropModal open onClose={vi.fn()} image={makeImage({ public_id: "b", cropX: 80, cropY: 90 })} onSave={vi.fn()} />,
    );
    expect((screen.getByTestId("crop-input-x") as HTMLInputElement).value).toBe("80");
    expect((screen.getByTestId("crop-input-y") as HTMLInputElement).value).toBe("90");
  });

  it("Frame-overlay is NOT in DOM before img.onLoad, present after", () => {
    stubImgRect(320, 180);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage()} onSave={vi.fn()} />,
    );
    expect(screen.queryByTestId("crop-frame-overlay")).toBeNull();
    fireEvent.load(screen.getByTestId("crop-image"));
    expect(screen.getByTestId("crop-frame-overlay")).toBeTruthy();
  });

  it("Resize re-computes frame overlay width (320×180 → 160×90 → frameWidth 120 → 60)", async () => {
    stubImgRect(320, 180);
    render(
      <CropModal open onClose={vi.fn()} image={makeImage()} onSave={vi.fn()} />,
    );
    fireEvent.load(screen.getByTestId("crop-image"));
    const overlay = screen.getByTestId("crop-frame-overlay");
    // landscape 16:9: containerAspect=1.78 > 0.667 → frameWidth = ch * 2/3 = 180*2/3 = 120
    expect(parseFloat(overlay.style.width)).toBeCloseTo(120, 0);
    // Re-stub to halved dims
    stubImgRect(160, 90);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => {
      const o = screen.getByTestId("crop-frame-overlay");
      expect(parseFloat(o.style.width)).toBeCloseTo(60, 0);
    });
  });
});

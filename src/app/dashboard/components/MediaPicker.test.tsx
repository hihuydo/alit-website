// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MediaPicker, type MediaPickerResult } from "./MediaPicker";

interface LibraryItem {
  id: number;
  public_id: string;
  filename: string;
  mime_type: string;
  size: number;
}

const imageItem: LibraryItem = {
  id: 1,
  public_id: "aaaaaaaa-bbbb-cccc-dddd-000000000001",
  filename: "photo.jpg",
  mime_type: "image/jpeg",
  size: 10_000,
};

const videoItem: LibraryItem = {
  id: 2,
  public_id: "aaaaaaaa-bbbb-cccc-dddd-000000000002",
  filename: "clip.mp4",
  mime_type: "video/mp4",
  size: 20_000,
};

function stubLibraryFetch(items: LibraryItem[]) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, data: items }),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  stubLibraryFetch([imageItem, videoItem]);
});

afterEach(() => cleanup());

describe("MediaPicker — Library Grid responsive cols (Sprint B2c)", () => {
  it("T5: library grid uses grid-cols-2 sm:grid-cols-3 md:grid-cols-4", async () => {
    const { container } = render(
      <MediaPicker open onClose={() => {}} onSelect={() => {}} />,
    );
    // Wait for fetch-then-render cycle.
    await waitFor(() => {
      expect(container.querySelector("img[alt='photo.jpg']")).toBeTruthy();
    });
    const grid = container.querySelector("div.grid");
    expect(grid).toBeTruthy();
    const cls = (grid as HTMLElement).className;
    expect(cls).toMatch(/\bgrid-cols-2\b/);
    expect(cls).toMatch(/\bsm:grid-cols-3\b/);
    expect(cls).toMatch(/\bmd:grid-cols-4\b/);
  });
});

describe("MediaPicker — Width-buttons stacking (Sprint B2c)", () => {
  it("T6: width-buttons wrapper uses flex-col min-[400px]:flex-row", async () => {
    const { container } = render(
      <MediaPicker open onClose={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(container.querySelector("img[alt='photo.jpg']")).toBeTruthy();
    });
    // Select the image tile (image is selected in state → width buttons render).
    const imgTile = container.querySelector("img[alt='photo.jpg']")!.closest("button");
    expect(imgTile).toBeTruthy();
    fireEvent.click(imgTile!);
    // After selection: width-buttons render.
    const volleBreite = screen.getByRole("button", { name: "Volle Breite" });
    const wrapper = volleBreite.parentElement as HTMLElement;
    expect(wrapper.className).toMatch(/\bflex-col\b/);
    expect(wrapper.className).toMatch(/min-\[400px\]:flex-row/);
    // Both width-buttons have touch-target tokens.
    expect(volleBreite.className).toMatch(/\bmin-h-11\b/);
    expect(volleBreite.className).toMatch(/\bmd:min-h-0\b/);
  });

  it("T6b: width-buttons do NOT render for video selection", async () => {
    const { container } = render(
      <MediaPicker open onClose={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => {
      // Both tiles rendered → fetch complete.
      expect(container.querySelectorAll("button.relative.aspect-square").length).toBe(2);
    });
    // Select the video tile (second button, no img alt because it's an SVG placeholder).
    const tiles = container.querySelectorAll("button.relative.aspect-square");
    fireEvent.click(tiles[1]);
    expect(screen.queryByRole("button", { name: "Volle Breite" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Halbe Breite" })).toBeNull();
  });
});

describe("MediaPicker — iOS no-zoom Input font-sizes (Sprint B2c)", () => {
  it("T7: all 3 text inputs have text-base md:text-sm (iOS Auto-Zoom-Prevention)", async () => {
    const { container } = render(
      <MediaPicker open onClose={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(container.querySelector("img[alt='photo.jpg']")).toBeTruthy();
    });
    // Caption input appears after tile-selection.
    const imgTile = container.querySelector("img[alt='photo.jpg']")!.closest("button");
    fireEvent.click(imgTile!);
    const libCaption = container.querySelector(
      "input[placeholder='Bildunterschrift (optional)']",
    ) as HTMLInputElement;
    expect(libCaption).toBeTruthy();
    expect(libCaption.className).toMatch(/\btext-base\b/);
    expect(libCaption.className).toMatch(/\bmd:text-sm\b/);
    // Switch to Embed tab.
    fireEvent.click(screen.getByRole("button", { name: "Video einbetten" }));
    const embedUrl = container.querySelector("input[type='url']") as HTMLInputElement;
    expect(embedUrl).toBeTruthy();
    expect(embedUrl.className).toMatch(/\btext-base\b/);
    expect(embedUrl.className).toMatch(/\bmd:text-sm\b/);
    const embedCaption = container.querySelector(
      "input[placeholder='Bildunterschrift (optional)']",
    ) as HTMLInputElement;
    expect(embedCaption).toBeTruthy();
    expect(embedCaption.className).toMatch(/\btext-base\b/);
    expect(embedCaption.className).toMatch(/\bmd:text-sm\b/);
  });
});

describe("MediaPicker — Caption dirty-guard (confirm on close when caption non-empty)", () => {
  it("T9: ESC close with EMPTY caption calls onClose directly (no confirm)", async () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MediaPicker open onClose={onClose} onSelect={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Medienbibliothek" })).toBeTruthy();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("T9b: ESC close with non-empty caption + confirm-OK → onClose fires", async () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(
      <MediaPicker open onClose={onClose} onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(container.querySelector("img[alt='photo.jpg']")).toBeTruthy();
    });
    const imgTile = container.querySelector("img[alt='photo.jpg']")!.closest("button");
    fireEvent.click(imgTile!);
    const caption = container.querySelector(
      "input[placeholder='Bildunterschrift (optional)']",
    ) as HTMLInputElement;
    fireEvent.change(caption, { target: { value: "typed-but-not-inserted" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(confirmSpy).toHaveBeenCalledWith("Bildunterschrift verwerfen?");
    expect(onClose).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("T9c: ESC close with non-empty caption + confirm-CANCEL → onClose NOT called (text preserved)", async () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = render(
      <MediaPicker open onClose={onClose} onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(container.querySelector("img[alt='photo.jpg']")).toBeTruthy();
    });
    const imgTile = container.querySelector("img[alt='photo.jpg']")!.closest("button");
    fireEvent.click(imgTile!);
    const caption = container.querySelector(
      "input[placeholder='Bildunterschrift (optional)']",
    ) as HTMLInputElement;
    fireEvent.change(caption, { target: { value: "still-writing" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(confirmSpy).toHaveBeenCalledWith("Bildunterschrift verwerfen?");
    expect(onClose).not.toHaveBeenCalled();
    // Input text still present — guard preserved it.
    expect(caption.value).toBe("still-writing");
    confirmSpy.mockRestore();
  });

  it("T9d: whitespace-only caption does NOT trigger guard (trim() check)", async () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(
      <MediaPicker open onClose={onClose} onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(container.querySelector("img[alt='photo.jpg']")).toBeTruthy();
    });
    const imgTile = container.querySelector("img[alt='photo.jpg']")!.closest("button");
    fireEvent.click(imgTile!);
    const caption = container.querySelector(
      "input[placeholder='Bildunterschrift (optional)']",
    ) as HTMLInputElement;
    fireEvent.change(caption, { target: { value: "   " } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("T9e: embed-tab caption also triggers guard", async () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = render(
      <MediaPicker open onClose={onClose} onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Video einbetten" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Video einbetten" }));
    const captions = container.querySelectorAll(
      "input[placeholder='Bildunterschrift (optional)']",
    );
    // Embed-tab caption is the only "Bildunterschrift" input on that tab.
    fireEvent.change(captions[0], { target: { value: "embed-text" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(confirmSpy).toHaveBeenCalledWith("Bildunterschrift verwerfen?");
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("T9g: caption input keeps focus across keystrokes (stable onClose, no Modal re-effect)", async () => {
    // Regression for Codex PR #84 R1 [P1]: if handleGuardedClose is
    // re-created on every render, Modal's useEffect([open, onClose])
    // re-runs, cleanup fires previouslyFocused.focus(), and the
    // caption input loses focus after every keystroke.
    const onClose = vi.fn();
    const { container } = render(
      <MediaPicker open onClose={onClose} onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(container.querySelector("img[alt='photo.jpg']")).toBeTruthy();
    });
    const imgTile = container.querySelector("img[alt='photo.jpg']")!.closest("button");
    fireEvent.click(imgTile!);
    const caption = container.querySelector(
      "input[placeholder='Bildunterschrift (optional)']",
    ) as HTMLInputElement;
    caption.focus();
    expect(document.activeElement).toBe(caption);
    fireEvent.change(caption, { target: { value: "a" } });
    expect(document.activeElement).toBe(caption);
    fireEvent.change(caption, { target: { value: "abc" } });
    expect(document.activeElement).toBe(caption);
  });

  it("T9f: successful Insert bypasses guard (onClose called directly, no confirm)", async () => {
    const onSelect = vi.fn<(r: MediaPickerResult) => void>();
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(
      <MediaPicker open onClose={onClose} onSelect={onSelect} />,
    );
    await waitFor(() => {
      expect(container.querySelector("img[alt='photo.jpg']")).toBeTruthy();
    });
    const imgTile = container.querySelector("img[alt='photo.jpg']")!.closest("button");
    fireEvent.click(imgTile!);
    const caption = container.querySelector(
      "input[placeholder='Bildunterschrift (optional)']",
    ) as HTMLInputElement;
    fireEvent.change(caption, { target: { value: "inserted-caption" } });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Einfügen" }));
    });
    expect(confirmSpy).not.toHaveBeenCalled(); // Insert bypasses guard
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});

describe("MediaPicker — Behavior-Parity Insert flow (Sprint B2c)", () => {
  it("T8: select tile → type caption → Insert → onSelect called with correct payload, onClose fires", async () => {
    const onSelect = vi.fn<(r: MediaPickerResult) => void>();
    const onClose = vi.fn();
    const { container } = render(
      <MediaPicker open onClose={onClose} onSelect={onSelect} />,
    );
    await waitFor(() => {
      expect(container.querySelector("img[alt='photo.jpg']")).toBeTruthy();
    });
    const imgTile = container.querySelector("img[alt='photo.jpg']")!.closest("button");
    fireEvent.click(imgTile!);
    const caption = container.querySelector(
      "input[placeholder='Bildunterschrift (optional)']",
    ) as HTMLInputElement;
    fireEvent.change(caption, { target: { value: "Test-Bildunterschrift" } });
    const insertBtn = screen.getByRole("button", { name: "Einfügen" });
    act(() => {
      fireEvent.click(insertBtn);
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    const payload = onSelect.mock.calls[0][0];
    expect(payload).toEqual({
      type: "image",
      src: `/api/media/${imageItem.public_id}/`,
      mime_type: "image/jpeg",
      caption: "Test-Bildunterschrift",
      width: "full",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

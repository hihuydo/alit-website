// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { InstagramExportModal } from "./InstagramExportModal";
import type { AgendaItemForExport } from "@/lib/instagram-post";

const baseItem: AgendaItemForExport = {
  id: 42,
  datum: "2026-05-01",
  zeit: "19:00",
  title_i18n: { de: "Titel", fr: null },
  lead_i18n: { de: "Lead", fr: null },
  ort_i18n: { de: "Basel", fr: null },
  content_i18n: {
    de: [
      {
        id: "p1",
        type: "paragraph",
        content: [{ text: "valid content" }],
      },
    ],
    fr: null,
  },
  hashtags: null,
  images: [
    { public_id: "uuid-a", orientation: "landscape", width: 1200, height: 800 },
    { public_id: "uuid-b", orientation: "landscape", width: 1200, height: 800 },
    { public_id: "uuid-c", orientation: "landscape", width: 1200, height: 800 },
  ],
};

afterEach(() => cleanup());

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockMetadataFetch(opts: {
  warnings?: string[];
  availableImages?: number;
  slideCount?: number;
}) {
  const fetchMock = vi.fn(async () =>
    new Response(
      JSON.stringify({
        success: true,
        slideCount: opts.slideCount ?? 3,
        availableImages: opts.availableImages ?? 3,
        imageCount: 0,
        warnings: opts.warnings ?? [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("InstagramExportModal — image_partial banner (DK-21, Codex R1 #5)", () => {
  it("renders amber image_partial banner when warning is present", async () => {
    mockMetadataFetch({ warnings: ["image_partial"], availableImages: 3 });
    render(<InstagramExportModal open={true} onClose={() => {}} item={baseItem} />);
    await waitFor(() =>
      expect(
        screen.getByText(/Bild ist nicht mehr verfügbar/i),
      ).toBeTruthy(),
    );
  });

  it("does NOT render banner when warning is absent", async () => {
    mockMetadataFetch({ warnings: [], availableImages: 3 });
    render(<InstagramExportModal open={true} onClose={() => {}} item={baseItem} />);
    // Wait for metadata fetch to settle so any banner WOULD have rendered.
    await waitFor(() =>
      expect(screen.queryByText(/Lade…/i)).toBeNull(),
    );
    expect(screen.queryByText(/Bild ist nicht mehr verfügbar/i)).toBeNull();
  });
});

describe("InstagramExportModal — image-count helper copy", () => {
  it("shows grid copy when count >= 2", async () => {
    mockMetadataFetch({ availableImages: 3 });
    const { container } = render(
      <InstagramExportModal open={true} onClose={() => {}} item={baseItem} />,
    );
    await waitFor(() =>
      expect(screen.queryByText(/Lade…/i)).toBeNull(),
    );
    const input = container.querySelector(
      'input[aria-label="Anzahl Bilder"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    if (!input) return;
    // Default 0 → "keine Bilder exportieren"
    expect(screen.getByText(/keine Bilder exportieren/i)).toBeTruthy();
    // Set to 2 → grid-on-titel copy
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "2" } });
    await waitFor(() =>
      expect(screen.getByText(/2 Bilder im Slide-1-Grid/i)).toBeTruthy(),
    );
  });

  it("shows singular copy when count = 1", async () => {
    mockMetadataFetch({ availableImages: 3 });
    const { container } = render(
      <InstagramExportModal open={true} onClose={() => {}} item={baseItem} />,
    );
    await waitFor(() =>
      expect(screen.queryByText(/Lade…/i)).toBeNull(),
    );
    const input = container.querySelector(
      'input[aria-label="Anzahl Bilder"]',
    ) as HTMLInputElement | null;
    if (!input) throw new Error("input not found");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "1" } });
    await waitFor(() =>
      expect(screen.getByText(/1 Bild im Slide-1-Grid/i)).toBeTruthy(),
    );
  });
});

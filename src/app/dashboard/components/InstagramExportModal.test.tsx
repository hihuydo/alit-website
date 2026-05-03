// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

describe("InstagramExportModal — banners", () => {
  it("renders amber image_partial banner when warning is present", async () => {
    mockMetadataFetch({ warnings: ["image_partial"], availableImages: 3 });
    render(<InstagramExportModal open={true} onClose={() => {}} item={baseItem} />);
    await waitFor(() =>
      expect(
        screen.getByText(/Bild ist nicht mehr verfügbar/i),
      ).toBeTruthy(),
    );
  });

  it("does NOT render image_partial banner when warning is absent", async () => {
    mockMetadataFetch({ warnings: [], availableImages: 3 });
    render(<InstagramExportModal open={true} onClose={() => {}} item={baseItem} />);
    await waitFor(() =>
      expect(screen.queryByText(/Lade…/i)).toBeNull(),
    );
    expect(screen.queryByText(/Bild ist nicht mehr verfügbar/i)).toBeNull();
  });

  it("shows grid copy when imageCount >= 2", async () => {
    // M4a: default imageCount = Math.min(MAX_GRID_IMAGES=4, availableImages=3) = 3.
    // No initial "keine Bilder exportieren" assertion — pre-M4a default was 0.
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
    fireEvent.change(input, { target: { value: "2" } });
    await waitFor(() =>
      expect(screen.getByText(/2 Bilder im Slide-1-Grid/i)).toBeTruthy(),
    );
  });

  it("shows singular copy when imageCount = 1", async () => {
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
    fireEvent.change(input, { target: { value: "1" } });
    await waitFor(() =>
      expect(screen.getByText(/1 Bild im Slide-1-Grid/i)).toBeTruthy(),
    );
  });

  it("M4a A5/A5d: input.max + default imageCount clamp to MAX_GRID_IMAGES when availableImages > 4", async () => {
    // availableImages=6 → max attr = Math.min(4, 6) = 4, default = 4.
    // Pre-M4a default would have been 0 with no upper-clamp on max.
    mockMetadataFetch({ availableImages: 6 });
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
    expect(input.max).toBe("4"); // MAX_GRID_IMAGES clamp visible on the spinbox
    expect(input.value).toBe("4"); // default = min(MAX_GRID_IMAGES, availableImages)
    expect(screen.getByText(/\(max 4\)/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Side-by-side integration describe — tests the LayoutEditor + Preview
// rendering side-by-side, dirty-guard for locale/imageCount/modal-close,
// and the onSaved → cacheBust flow.
// ---------------------------------------------------------------------------

const bothItem: AgendaItemForExport = {
  id: 99,
  datum: "2026-05-01",
  zeit: "19:00",
  title_i18n: { de: "Titel DE", fr: "Titre FR" },
  lead_i18n: { de: "Lead DE", fr: "Lead FR" },
  ort_i18n: { de: "Basel", fr: "Bâle" },
  content_i18n: {
    de: [{ id: "p1", type: "paragraph", content: [{ text: "DE content" }] }],
    fr: [{ id: "p1", type: "paragraph", content: [{ text: "FR content" }] }],
  },
  hashtags: null,
  images: [
    { public_id: "uuid-a", orientation: "landscape", width: 1200, height: 800 },
    { public_id: "uuid-b", orientation: "landscape", width: 1200, height: 800 },
    { public_id: "uuid-c", orientation: "landscape", width: 1200, height: 800 },
  ],
};

describe("InstagramExportModal × LayoutEditor side-by-side integration", () => {
  let InstagramExportModal: typeof import("./InstagramExportModal").InstagramExportModal;
  let layoutEditorPropsLog: Array<Record<string, unknown>>;
  let integrationFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    layoutEditorPropsLog = [];

    integrationFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          slideCount: 3,
          availableImages: 3,
          imageCount: 0,
          warnings: [],
          contentHash: "deadbeef12345678",
          mode: "auto",
          layoutVersion: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", integrationFetch);

    vi.doMock("./LayoutEditor", () => ({
      LayoutEditor: (props: Record<string, unknown>) => {
        layoutEditorPropsLog.push({ ...props });
        return (
          <div data-testid="mock-layout-editor">
            <button
              data-testid="mock-trigger-dirty"
              onClick={() =>
                (props.onDirtyChange as ((d: boolean) => void) | undefined)?.(true)
              }
            >
              trigger dirty
            </button>
            <button
              data-testid="mock-trigger-clean"
              onClick={() =>
                (props.onDirtyChange as ((d: boolean) => void) | undefined)?.(false)
              }
            >
              trigger clean
            </button>
            <button
              data-testid="mock-trigger-saved"
              onClick={() =>
                (props.onSaved as (() => void) | undefined)?.()
              }
            >
              trigger saved
            </button>
            <span data-testid="mock-discard-key">{String(props.discardKey)}</span>
            <span data-testid="mock-locale">{String(props.locale)}</span>
            <span data-testid="mock-image-count">{String(props.imageCount)}</span>
          </div>
        );
      },
    }));
    ({ InstagramExportModal } = await import("./InstagramExportModal"));
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  async function renderAndWait(
    item: AgendaItemForExport,
    onClose: () => void = () => {},
  ) {
    render(<InstagramExportModal open={true} onClose={onClose} item={item} />);
    await waitFor(() =>
      expect(screen.queryByText(/Lade…/i)).toBeNull(),
    );
  }

  it("L-1: side-by-side render — editor + preview both visible when locale != 'both'", async () => {
    await renderAndWait(bothItem);
    expect(screen.getByTestId("mock-layout-editor")).toBeTruthy();
    expect(screen.getByText(/Vorschau DE/)).toBeTruthy();
    // Preview-grid present
    const imgs = document.querySelectorAll('img[alt^="Slide "]');
    expect(imgs.length).toBeGreaterThan(0);
    // Editor seeded with right props. M4a: imageCount default = Math.min(
    // MAX_GRID_IMAGES=4, availableImages=3) = 3 (bothItem has 3 images).
    const lastProps = layoutEditorPropsLog[layoutEditorPropsLog.length - 1];
    expect(lastProps.itemId).toBe(99);
    expect(lastProps.locale).toBe("de");
    expect(lastProps.imageCount).toBe(3);
  });

  it("L-2: locale='both' hides editor, preview shows DE + FR columns", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByLabelText("Beide"));
    await waitFor(() => {
      expect(screen.queryByTestId("mock-layout-editor")).toBeNull();
    });
    expect(screen.getByText(/Vorschau DE/)).toBeTruthy();
    expect(screen.getByText(/Vorschau FR/)).toBeTruthy();
  });

  it("L-3: editor onSaved → cacheBust bump → preview img src changes", async () => {
    await renderAndWait(bothItem);
    const firstSrc = (
      document.querySelector('img[alt="Slide 1"]') as HTMLImageElement
    ).src;
    expect(firstSrc).toContain("v=");
    // Wait one ms-tick to guarantee Date.now() differs
    await new Promise((r) => setTimeout(r, 5));
    fireEvent.click(screen.getByTestId("mock-trigger-saved"));
    await waitFor(() => {
      const nextSrc = (
        document.querySelector('img[alt="Slide 1"]') as HTMLImageElement
      ).src;
      expect(nextSrc).not.toBe(firstSrc);
      expect(nextSrc).toContain("v=");
    });
  });

  it("L-4: imageCount-change while dirty opens ConfirmDialog with imageCount-change body", async () => {
    // M4a: bothItem has 3 images → default imageCount=3. User changes to 2.
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    const input = screen.getByLabelText("Anzahl Bilder") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2" } });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/Bild-Anzahl/i)).toBeTruthy();
    // ImageCount has NOT changed yet (waiting for confirm) — still default 3
    expect(screen.getByTestId("mock-image-count").textContent).toBe("3");
    // Discard accepts the change
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.getByTestId("mock-image-count").textContent).toBe("2");
      expect(screen.getByTestId("mock-discard-key").textContent).toBe("1");
    });
  });

  it("L-5: locale switch DE→FR while dirty opens ConfirmDialog; discard preserves editor mount with locale=fr, discardKey=1", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    fireEvent.click(screen.getByLabelText("FR"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/Du wechselst die Sprache/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.getByTestId("mock-locale").textContent).toBe("fr");
      expect(screen.getByTestId("mock-discard-key").textContent).toBe("1");
    });
  });

  it("L-6: locale switch to 'both' while dirty opens ConfirmDialog; discard hides editor", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    fireEvent.click(screen.getByLabelText("Beide"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/Du wechselst die Sprache/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.queryByTestId("mock-layout-editor")).toBeNull();
      expect(
        (screen.getByLabelText("Beide") as HTMLInputElement).checked,
      ).toBe(true);
    });
  });

  it("L-7: modal-close while dirty (action-button + Modal-X) triggers guardedOnClose → discard fires parent onClose", async () => {
    const onClose = vi.fn();
    await renderAndWait(bothItem, onClose);
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    // Both "Schließen" controls (action-button + Modal-X) are guarded.
    // Click any — both should produce the same confirm flow.
    const schließen = screen.getAllByRole("button", { name: "Schließen" });
    expect(schließen.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(schließen[0]);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/Du schließt das Fenster/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("L-8: ConfirmDialog cancel — no state change, editor stays mounted, dirty stays true", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    fireEvent.click(screen.getByLabelText("FR"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    // Locale stayed DE, editor still mounted, discardKey unchanged
    expect(screen.getByTestId("mock-locale").textContent).toBe("de");
    expect(screen.getByTestId("mock-discard-key").textContent).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Modal-callback ref-stability — sibling top-level describe with local
// vi.doMock("./Modal") to capture every onClose-prop reference per render.
// MUST be sibling (not nested) per vitest beforeEach outer-before-inner
// ordering.
// ---------------------------------------------------------------------------

describe("InstagramExportModal — Modal-callback ref-stability", () => {
  let InstagramExportModal: typeof import("./InstagramExportModal").InstagramExportModal;
  let modalOnCloseLog: Array<() => void>;
  let refStabilityFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    modalOnCloseLog = [];

    refStabilityFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          slideCount: 3,
          availableImages: 3,
          imageCount: 0,
          warnings: [],
          contentHash: "deadbeef12345678",
          mode: "auto",
          layoutVersion: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", refStabilityFetch);

    // BOTH mocks BEFORE dynamic import — order matters
    vi.doMock("./LayoutEditor", () => ({
      LayoutEditor: (props: Record<string, unknown>) => (
        <div data-testid="mock-layout-editor">
          <button
            data-testid="mock-trigger-dirty"
            onClick={() =>
              (props.onDirtyChange as ((d: boolean) => void) | undefined)?.(true)
            }
          >
            trigger dirty
          </button>
          <button
            data-testid="mock-trigger-clean"
            onClick={() =>
              (props.onDirtyChange as ((d: boolean) => void) | undefined)?.(false)
            }
          >
            trigger clean
          </button>
        </div>
      ),
    }));
    vi.doMock("./Modal", () => ({
      Modal: ({
        onClose,
        children,
      }: {
        onClose: () => void;
        children: React.ReactNode;
      }) => {
        modalOnCloseLog.push(onClose);
        return <div data-testid="mock-modal">{children}</div>;
      },
    }));

    ({ InstagramExportModal } = await import("./InstagramExportModal"));
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("guardedOnClose stays referentially stable across dirty-toggles", async () => {
    render(
      <InstagramExportModal
        open={true}
        onClose={() => {}}
        item={{
          id: 99,
          datum: "2026-05-01",
          zeit: "19:00",
          title_i18n: { de: "Titel DE", fr: "Titre FR" },
          lead_i18n: { de: "Lead DE", fr: "Lead FR" },
          ort_i18n: { de: "Basel", fr: "Bâle" },
          content_i18n: {
            de: [{ id: "p1", type: "paragraph", content: [{ text: "DE" }] }],
            fr: [{ id: "p1", type: "paragraph", content: [{ text: "FR" }] }],
          },
          hashtags: null,
          images: [],
        }}
      />,
    );
    await waitFor(() => screen.getByTestId("mock-layout-editor"));
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    fireEvent.click(screen.getByTestId("mock-trigger-clean"));
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    // Across 3 dirty-toggles, every onClose-prop captured by MockModal must
    // be the SAME reference. If guardedOnClose were rebuilt per render
    // (e.g. dirty back in deps), Set.size > 1 → Modal.tsx:83's
    // [open, onClose] cleanup would fire focus-restore on each edit.
    expect(new Set(modalOnCloseLog).size).toBe(1);
  });
});

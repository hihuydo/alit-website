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
    expect(screen.getByText(/keine Bilder exportieren/i)).toBeTruthy();
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
});

// ---------------------------------------------------------------------------
// Integration describe — uses dynamic-import + vi.doMock("./LayoutEditor")
// pattern. Module-scope `mockMetadataFetch` helper is intentionally NOT used
// here (would need URL-aware dispatch) — describe-scope fetch stub instead.
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

describe("InstagramExportModal × LayoutEditor integration", () => {
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
            <span data-testid="mock-discard-key">{String(props.discardKey)}</span>
            <span data-testid="mock-locale">{String(props.locale)}</span>
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
      expect(screen.getByRole("tab", { name: "Vorschau" })).toBeTruthy(),
    );
  }

  it("I-1: initial render in mode=preview, layout tab visible but inactive, editor not mounted", async () => {
    await renderAndWait(bothItem);
    const previewTab = screen.getByRole("tab", { name: "Vorschau" });
    const layoutTab = screen.getByRole("tab", { name: "Layout anpassen" });
    expect(previewTab.getAttribute("aria-selected")).toBe("true");
    expect(layoutTab.getAttribute("aria-selected")).toBe("false");
    expect(screen.queryByTestId("mock-layout-editor")).toBeNull();
  });

  it("I-2: click 'Layout anpassen' mounts LayoutEditor with correct props, hides preview", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() =>
      expect(screen.getByTestId("mock-layout-editor")).toBeTruthy(),
    );
    const lastProps = layoutEditorPropsLog[layoutEditorPropsLog.length - 1];
    expect(lastProps.itemId).toBe(99);
    expect(lastProps.locale).toBe("de");
    expect(lastProps.imageCount).toBe(0);
    expect(lastProps.discardKey).toBe(0);
    // Preview-grid should be gone (no "Vorschau DE/FR" labels).
    expect(screen.queryByText(/^Vorschau DE$/)).toBeNull();
  });

  it("I-3: layout-tab disabled when locale=both, click is no-op", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByLabelText("Beide"));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Beide") as HTMLInputElement).checked,
      ).toBe(true),
    );
    const layoutTab = screen.getByRole("tab", { name: "Layout anpassen" }) as HTMLButtonElement;
    expect(layoutTab.disabled).toBe(true);
    expect(layoutTab.getAttribute("title")).toMatch(/pro Sprache/i);
    fireEvent.click(layoutTab);
    expect(screen.queryByTestId("mock-layout-editor")).toBeNull();
  });

  it("I-4: isDirty mirror — trigger-dirty makes preview-tab-click open ConfirmDialog; trigger-clean makes it switch directly", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() => screen.getByTestId("mock-layout-editor"));

    // Dirty path: dialog opens
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    fireEvent.click(screen.getByRole("tab", { name: "Vorschau" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/Ungesicherte Layout-Änderungen verwerfen\?/)).toBeTruthy();

    // Cancel
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    // Clean path: no dialog, mode switches direct
    fireEvent.click(screen.getByTestId("mock-trigger-clean"));
    fireEvent.click(screen.getByRole("tab", { name: "Vorschau" }));
    await waitFor(() =>
      expect(screen.queryByTestId("mock-layout-editor")).toBeNull(),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("I-5: guarded tab-switch with dirty=true opens ConfirmDialog with tab-switch body", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() => screen.getByTestId("mock-layout-editor"));
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    fireEvent.click(screen.getByRole("tab", { name: "Vorschau" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/Du wechselst den Tab/i)).toBeTruthy();
    // Editor still mounted (not switched yet)
    expect(screen.getByTestId("mock-layout-editor")).toBeTruthy();
  });

  it("I-6: ConfirmDialog accept (tab-switch) — editor unmounts, no false-positive on re-enter", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() => screen.getByTestId("mock-layout-editor"));
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    fireEvent.click(screen.getByRole("tab", { name: "Vorschau" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.queryByTestId("mock-layout-editor")).toBeNull();
    });
    // Re-enter Layout tab — must NOT trigger confirm dialog (dirty was reset).
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() => screen.getByTestId("mock-layout-editor"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("I-6b: ConfirmDialog accept (locale switch DE→FR) — editor stays mounted with discardKey=1, locale=fr", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() => screen.getByTestId("mock-layout-editor"));
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    fireEvent.click(screen.getByLabelText("FR"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/Du wechselst die Sprache/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.getByTestId("mock-discard-key").textContent).toBe("1");
      expect(screen.getByTestId("mock-locale").textContent).toBe("fr");
    });
    // No subsequent dialog on no-op
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("I-7: ConfirmDialog cancel — mode stays layout, discardKey unchanged", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() => screen.getByTestId("mock-layout-editor"));
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    fireEvent.click(screen.getByRole("tab", { name: "Vorschau" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByTestId("mock-layout-editor")).toBeTruthy();
    expect(screen.getByTestId("mock-discard-key").textContent).toBe("0");
  });

  it("I-8: guarded locale-switch to 'both' in layout-mode + dirty — accept batches mode→preview + locale→both", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() => screen.getByTestId("mock-layout-editor"));
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    fireEvent.click(screen.getByLabelText("Beide"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/Du wechselst die Sprache/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.queryByTestId("mock-layout-editor")).toBeNull();
      expect((screen.getByLabelText("Beide") as HTMLInputElement).checked).toBe(true);
    });
    // Layout tab now disabled (locale=both)
    expect(
      (screen.getByRole("tab", { name: "Layout anpassen" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("I-9: guarded onClose via Modal X-button + dirty — accept fires parent onClose", async () => {
    const onClose = vi.fn();
    await renderAndWait(bothItem, onClose);
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() => screen.getByTestId("mock-layout-editor"));
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    // In layout mode, action-buttons aren't rendered, so the only "Schließen"
    // is the Modal X aria-label.
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/Du schließt das Fenster/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("I-10: modal cleanup on reopen — mode resets to preview", async () => {
    const { rerender } = render(
      <InstagramExportModal open={true} onClose={() => {}} item={bothItem} />,
    );
    await waitFor(() => screen.getByRole("tab", { name: "Vorschau" }));
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() => screen.getByTestId("mock-layout-editor"));

    // Close (clean state — no dirty)
    rerender(
      <InstagramExportModal open={false} onClose={() => {}} item={bothItem} />,
    );
    // Re-open
    rerender(
      <InstagramExportModal open={true} onClose={() => {}} item={bothItem} />,
    );
    await waitFor(() => screen.getByRole("tab", { name: "Vorschau" }));
    expect(
      screen.getByRole("tab", { name: "Vorschau" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.queryByTestId("mock-layout-editor")).toBeNull();
  });

  it("I-11: no-op click on already-active tab does NOT open ConfirmDialog (R1 [P2 #3] regression-guard)", async () => {
    await renderAndWait(bothItem);
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() => screen.getByTestId("mock-layout-editor"));
    fireEvent.click(screen.getByTestId("mock-trigger-dirty"));
    // Tab no-op: click already-active "Layout anpassen"
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("mock-discard-key").textContent).toBe("0");
    // Locale no-op: click already-active DE radio
    fireEvent.click(screen.getByLabelText("DE"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("mock-discard-key").textContent).toBe("0");
  });

  it("I-12: imageCount input disabled in layout-mode with i18n title (R1 [P2 #5] regression-guard)", async () => {
    await renderAndWait(bothItem);
    const input = screen.getByLabelText("Anzahl Bilder") as HTMLInputElement;
    expect(input.disabled).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
    await waitFor(() => screen.getByTestId("mock-layout-editor"));
    expect(input.disabled).toBe(true);
    expect(input.getAttribute("title")).toMatch(/Layout-Modus/i);
    // Switch back to preview — re-enabled
    fireEvent.click(screen.getByRole("tab", { name: "Vorschau" }));
    await waitFor(() => expect(input.disabled).toBe(false));
  });
});

// ---------------------------------------------------------------------------
// I-13 sibling top-level describe — locally mocks ./Modal so we can capture
// the onClose prop reference per render. MUST be sibling (not nested) — see
// spec §Test-Infrastructure → EXCEPTION I-13: vitest beforeEach is
// outer-before-inner, and a nested integration-beforeEach would import
// InstagramExportModal before this describe's vi.doMock("./Modal") could
// register, leaving Modal unmocked.
// ---------------------------------------------------------------------------

describe("InstagramExportModal — Modal-callback ref-stability (I-13)", () => {
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
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Vorschau" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Layout anpassen" }));
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

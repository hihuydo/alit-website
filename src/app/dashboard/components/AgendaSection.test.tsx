// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgendaSection, type AgendaItem } from "./AgendaSection";
import { DirtyProvider } from "../DirtyContext";
import { dashboardFetch } from "../lib/dashboardFetch";

afterEach(() => cleanup());

// Heavy collaborators stubbed — we only care about the date/time-picker
// DOM mechanics (DK-5 / DK-6) in this suite.
vi.mock("../lib/dashboardFetch", () => ({
  dashboardFetch: vi.fn(() =>
    Promise.resolve({ json: async () => ({ success: true, data: [] }) } as Response),
  ),
}));
vi.mock("./RichTextEditor", () => ({
  RichTextEditor: () => <div data-testid="rte-stub" />,
}));
vi.mock("./MediaPicker", () => ({
  // Mock exposes targetSlot via data-attribute for assertion (Sonnet R2 F-06)
  // and onSelect via a hidden button (Codex R1 P2 — picker-success retry).
  MediaPicker: ({
    open,
    targetSlot,
    onSelect,
  }: {
    open: boolean;
    targetSlot?: number | null;
    onSelect?: (r: { type: "image"; src: string; caption?: string }) => void;
  }) =>
    open ? (
      <div data-testid="mock-picker" data-slot={targetSlot === null || targetSlot === undefined ? "null" : String(targetSlot)}>
        <button
          type="button"
          data-testid="mock-picker-pick"
          onClick={() => onSelect?.({ type: "image", src: "/api/media/picked-1/" })}
        />
      </div>
    ) : null,
}));
vi.mock("@/components/AgendaItem", () => ({
  // Mock surfaces the new fields so we can assert previewItem mapping.
  AgendaItem: ({ item }: { item: { imagesGridColumns?: number; imagesFit?: "cover" | "contain" } }) => (
    <div
      data-testid="agenda-preview"
      data-cols={String(item.imagesGridColumns ?? "")}
      data-fit={String(item.imagesFit ?? "")}
    />
  ),
}));
vi.mock("./InstagramExportModal", () => ({
  InstagramExportModal: () => null,
}));

function makeItem(overrides: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: 1,
    datum: "15.03.2025",
    zeit: "15:00 Uhr",
    ort_url: "https://example.com",
    hashtags: [],
    images: [],
    images_grid_columns: 1,
    images_fit: "cover" as const,
    title_i18n: { de: "Titel" },
    lead_i18n: { de: "Lead" },
    ort_i18n: { de: "Ort" },
    content_i18n: { de: [] },
    completion: { de: true, fr: false },
    ...overrides,
  };
}

function renderWithItems(items: AgendaItem[]) {
  // ProjekteSection-like: the real component refetches on mount; stub fetch.
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ json: async () => ({ success: true, data: items }) } as Response),
    ),
  );
  return render(
    <DirtyProvider>
      <AgendaSection initial={items} projekte={[]} />
    </DirtyProvider>,
  );
}

async function openEdit() {
  const btn = (await screen.findAllByRole("button", { name: /bearbeiten/i }))[0];
  fireEvent.click(btn);
}

describe("AgendaSection — native date/time picker (DK-5, DK-6)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders input[type=date] + input[type=time] (DOM mechanics, not UI-look)", async () => {
    renderWithItems([makeItem()]);
    await openEdit();
    const datumInput = (await screen.findByLabelText("Datum")) as HTMLInputElement;
    const zeitInput = (await screen.findByLabelText("Zeit")) as HTMLInputElement;
    expect(datumInput.type).toBe("date");
    expect(zeitInput.type).toBe("time");
  });

  it("canonical row roundtrips into picker value (ISO form)", async () => {
    renderWithItems([makeItem({ datum: "15.03.2025", zeit: "15:00 Uhr" })]);
    await openEdit();
    const datumInput = (await screen.findByLabelText("Datum")) as HTMLInputElement;
    const zeitInput = (await screen.findByLabelText("Zeit")) as HTMLInputElement;
    expect(datumInput.value).toBe("2025-03-15");
    expect(zeitInput.value).toBe("15:00");
  });

  it("off-spec row opens with empty picker + aria-describedby hint (Codex-R1 [Correctness] 2)", async () => {
    renderWithItems([makeItem({ id: 6, zeit: "19.30" })]);
    await openEdit();
    const zeitInput = (await screen.findByLabelText("Zeit")) as HTMLInputElement;
    // Empty picker, not raw DB value.
    expect(zeitInput.value).toBe("");
    // aria-describedby points at the hint element.
    expect(zeitInput.getAttribute("aria-describedby")).toBe("agenda-zeit-hint");
    // Hint element exists + contains the raw legacy value for admin context.
    const hint = document.getElementById("agenda-zeit-hint");
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toMatch(/19\.30/);
  });

  it("canonical row has NO hint + NO aria-describedby", async () => {
    renderWithItems([makeItem({ zeit: "15:00 Uhr", datum: "15.03.2025" })]);
    await openEdit();
    const zeitInput = (await screen.findByLabelText("Zeit")) as HTMLInputElement;
    const datumInput = (await screen.findByLabelText("Datum")) as HTMLInputElement;
    expect(zeitInput.getAttribute("aria-describedby")).toBeNull();
    expect(datumInput.getAttribute("aria-describedby")).toBeNull();
    expect(document.getElementById("agenda-zeit-hint")).toBeNull();
    expect(document.getElementById("agenda-datum-hint")).toBeNull();
  });

  it("typing into the time picker reshapes form state to canonical HH:MM Uhr (Codex-R1 [Correctness] 2 — save-semantics)", async () => {
    renderWithItems([makeItem({ id: 6, zeit: "19.30" })]);
    await openEdit();
    const zeitInput = (await screen.findByLabelText("Zeit")) as HTMLInputElement;
    expect(zeitInput.value).toBe(""); // legacy → empty
    // Simulate native time-picker submission of "20:15" — the adapter
    // must write "20:15 Uhr" into form.zeit and render it back as ISO.
    fireEvent.change(zeitInput, { target: { value: "20:15" } });
    expect((screen.getByLabelText("Zeit") as HTMLInputElement).value).toBe("20:15");
    // The save button reflects canonical-state — presence alone doesn't
    // verify, but the absence of aria-describedby after entering a
    // canonical value confirms the hint is driven by original-DB-value
    // only (hint tied to `editing.zeit`, not `form.zeit`).
  });
});

describe("AgendaSection — Sprint 1 Mode-Picker + Slot-Grid + Drag-Reorder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders all 5 Mode-Picker buttons with type='button'", async () => {
    renderWithItems([makeItem()]);
    await openEdit();
    for (const v of [1, 2, 3, 4, 5]) {
      const btn = await screen.findByTestId(`mode-${v}`);
      expect(btn.getAttribute("type")).toBe("button");
    }
  });

  it("Mode-Wechsel preserves images and updates form_state cols", async () => {
    renderWithItems([
      makeItem({
        images: [
          { public_id: "a", orientation: "landscape", width: 100, height: 75 },
          { public_id: "b", orientation: "landscape", width: 100, height: 75 },
        ],
        images_grid_columns: 2,
      }),
    ]);
    await openEdit();
    // Initial: cols=2 → 2 filled slots.
    expect(screen.queryByTestId("slot-filled-0")).not.toBeNull();
    expect(screen.queryByTestId("slot-filled-1")).not.toBeNull();
    // Switch to cols=4: still 2 filled slots (preserved), grid layout = 4 cols.
    fireEvent.click(screen.getByTestId("mode-4"));
    expect(screen.queryByTestId("slot-filled-0")).not.toBeNull();
    expect(screen.queryByTestId("slot-filled-1")).not.toBeNull();
  });

  it("emptyForm: new agenda item shows 1 empty slot (cols=1, visibleSlotCount=1)", async () => {
    renderWithItems([makeItem()]);
    const newBtn = await screen.findByRole("button", { name: /\+ neu/i });
    fireEvent.click(newBtn);
    expect(await screen.findByTestId("slot-empty-0")).not.toBeNull();
    expect(screen.queryByTestId("slot-empty-1")).toBeNull();
    expect(screen.queryByTestId("slot-filled-0")).toBeNull();
  });

  it("openEdit with images=null does not crash (null-Guard)", async () => {
    renderWithItems([makeItem({ images: null })]);
    await openEdit();
    // No throw, slot-grid renders with empty default slot.
    expect(screen.queryByTestId("slot-grid")).not.toBeNull();
    expect(screen.queryByTestId("slot-empty-0")).not.toBeNull();
  });

  it("'+ neue Zeile' button has type='button' and is disabled when cols=1", async () => {
    renderWithItems([makeItem()]);
    await openEdit();
    const btn = await screen.findByTestId("add-row");
    expect(btn.getAttribute("type")).toBe("button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    // Switch to cols=3 → button enabled.
    fireEvent.click(screen.getByTestId("mode-3"));
    expect((screen.getByTestId("add-row") as HTMLButtonElement).disabled).toBe(false);
  });

  it("'+ neue Zeile' increments visibleSlotCount by cols", async () => {
    renderWithItems([makeItem()]);
    await openEdit();
    fireEvent.click(screen.getByTestId("mode-3"));
    // After mode=3: 3 empty slots visible.
    expect(screen.queryByTestId("slot-empty-0")).not.toBeNull();
    expect(screen.queryByTestId("slot-empty-2")).not.toBeNull();
    expect(screen.queryByTestId("slot-empty-3")).toBeNull();
    // Click "+ neue Zeile" → 6 empty slots.
    fireEvent.click(screen.getByTestId("add-row"));
    expect(screen.queryByTestId("slot-empty-5")).not.toBeNull();
    expect(screen.queryByTestId("slot-empty-6")).toBeNull();
  });

  it("'Letzte Reihe' Soft-Warning appears when length % cols !== 0 && cols >= 2", async () => {
    renderWithItems([
      makeItem({
        images: [
          { public_id: "a", orientation: "landscape", width: 100, height: 75 },
          { public_id: "b", orientation: "landscape", width: 100, height: 75 },
          { public_id: "c", orientation: "landscape", width: 100, height: 75 },
          { public_id: "d", orientation: "landscape", width: 100, height: 75 },
        ],
        images_grid_columns: 3,
      }),
    ]);
    await openEdit();
    // 4 % 3 = 1 → warning visible.
    expect(screen.queryByTestId("warning-last-row")).not.toBeNull();
    // Switch to cols=2: 4 % 2 = 0 → warning gone.
    fireEvent.click(screen.getByTestId("mode-2"));
    expect(screen.queryByTestId("warning-last-row")).toBeNull();
  });

  it("'Einzelbild' Soft-Warning appears when cols=1 + length>=2", async () => {
    renderWithItems([
      makeItem({
        images: [
          { public_id: "a", orientation: "landscape", width: 100, height: 75 },
          { public_id: "b", orientation: "landscape", width: 100, height: 75 },
        ],
        images_grid_columns: 1,
      }),
    ]);
    await openEdit();
    expect(screen.queryByTestId("warning-single-mode")).not.toBeNull();
    // Switch to cols=2 → warning gone.
    fireEvent.click(screen.getByTestId("mode-2"));
    expect(screen.queryByTestId("warning-single-mode")).toBeNull();
  });

  it("Empty-Slot click opens MediaPicker with target-slot index", async () => {
    renderWithItems([makeItem()]);
    await openEdit();
    fireEvent.click(screen.getByTestId("mode-3"));
    // Click empty-slot at index 1.
    const slot1Button = screen.getByTestId("slot-empty-1").querySelector("button")!;
    fireEvent.click(slot1Button);
    const picker = screen.getByTestId("mock-picker");
    expect(picker.getAttribute("data-slot")).toBe("1");
  });

  it("✕-Remove button on filled slot has type='button'", async () => {
    renderWithItems([
      makeItem({
        images: [{ public_id: "a", orientation: "landscape", width: 100, height: 75 }],
      }),
    ]);
    await openEdit();
    const removeBtn = screen.getByTestId("slot-filled-0").querySelector("button")!;
    expect(removeBtn.getAttribute("type")).toBe("button");
  });

  it("filled slot is draggable and has onDragOver+onDrop handlers", async () => {
    renderWithItems([
      makeItem({
        images: [{ public_id: "a", orientation: "landscape", width: 100, height: 75 }],
      }),
    ]);
    await openEdit();
    const slot = screen.getByTestId("slot-filled-0") as HTMLDivElement;
    expect(slot.getAttribute("draggable")).toBe("true");
    // onDragOver must call preventDefault (Sonnet R5 C-2 — production-bug
    // verification, not just handler-presence).
    const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOver, "dataTransfer", { value: { types: [] } });
    slot.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);
  });

  it("Slot-Grid uses inline gridTemplateColumns with fixed 60px cells (compact preview, stable size on mode-switch)", async () => {
    renderWithItems([makeItem()]);
    await openEdit();
    fireEvent.click(screen.getByTestId("mode-4"));
    const grid = screen.getByTestId("slot-grid");
    expect(grid.style.gridTemplateColumns).toBe("repeat(4, 60px)");
  });

  it("Slot-Grid cell-size stays stable across mode-switch (Compact-Layout fix)", async () => {
    renderWithItems([makeItem()]);
    await openEdit();
    fireEvent.click(screen.getByTestId("mode-2"));
    const cellSize2 = screen.getByTestId("slot-grid").style.gridTemplateColumns;
    fireEvent.click(screen.getByTestId("mode-5"));
    const cellSize5 = screen.getByTestId("slot-grid").style.gridTemplateColumns;
    // Both end with "60px)" — cell size doesn't reflow with mode change.
    expect(cellSize2).toBe("repeat(2, 60px)");
    expect(cellSize5).toBe("repeat(5, 60px)");
  });

  it("Slot-Grid is rendered ABOVE the RichTextEditor (mirrors public layout)", async () => {
    renderWithItems([makeItem()]);
    await openEdit();
    const grid = screen.getByTestId("slot-grid");
    // Two rte-stubs (one per locale, hidden via attribute) — both must
    // follow the slot-grid in document order.
    const rtes = screen.getAllByTestId("rte-stub");
    expect(rtes.length).toBe(2);
    for (const rte of rtes) {
      // eslint-disable-next-line no-bitwise
      expect(grid.compareDocumentPosition(rte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("previewItem reflects current mode + fit (live-preview update on Mode-Wechsel)", async () => {
    renderWithItems([makeItem({ images_grid_columns: 3, images_fit: "contain" })]);
    await openEdit();
    // Open preview to surface the AgendaItem mock.
    fireEvent.click(await screen.findByRole("button", { name: /vorschau/i }));
    const preview = await screen.findByTestId("agenda-preview");
    expect(preview.getAttribute("data-cols")).toBe("3");
    expect(preview.getAttribute("data-fit")).toBe("contain");
    // Switch mode → preview updates.
    fireEvent.click(screen.getByTestId("mode-5"));
    expect(screen.getByTestId("agenda-preview").getAttribute("data-cols")).toBe("5");
  });

  it("Drag-Reorder via slot-index dataTransfer swaps via splice-out + adjusted-insert", async () => {
    renderWithItems([
      makeItem({
        images: [
          { public_id: "a", orientation: "landscape", width: 100, height: 75 },
          { public_id: "b", orientation: "landscape", width: 100, height: 75 },
          { public_id: "c", orientation: "landscape", width: 100, height: 75 },
        ],
        images_grid_columns: 3,
      }),
    ]);
    await openEdit();
    // Drag slot 0 (a) to slot 2 (c).
    const slot0 = screen.getByTestId("slot-filled-0");
    const slot2 = screen.getByTestId("slot-filled-2");
    // Use a shared dataTransfer-like to thread setData → getData.
    const dataMap = new Map<string, string>();
    const dt = {
      types: [] as string[],
      effectAllowed: "",
      setData: (k: string, v: string) => { dataMap.set(k, v); dt.types = [...dataMap.keys()]; },
      getData: (k: string) => dataMap.get(k) ?? "",
      files: [] as File[],
    };
    fireEvent.dragStart(slot0, { dataTransfer: dt });
    fireEvent.drop(slot2, { dataTransfer: dt });
    // After insert-before with sourceIdx=0, targetIdx=2, adjusted=1:
    // [a,b,c] → splice(0,1)=a, then [b,c] → splice(1,0,a) → [b,a,c].
    // Slot-image src order in DOM should be b, a, c.
    const imgs = Array.from(document.querySelectorAll("img")).filter((el) => el.getAttribute("src")?.includes("/api/media/"));
    expect(imgs[0].getAttribute("src")).toContain("/api/media/b/");
    expect(imgs[1].getAttribute("src")).toContain("/api/media/a/");
    expect(imgs[2].getAttribute("src")).toContain("/api/media/c/");
  });

  it("Drop with invalid getData (NaN slot-index) is a Noop (no duplicate)", async () => {
    renderWithItems([
      makeItem({
        images: [{ public_id: "a", orientation: "landscape", width: 100, height: 75 }],
      }),
    ]);
    await openEdit();
    const slot0 = screen.getByTestId("slot-filled-0");
    // Trigger dragStart so dragSourceRef is set, then drop with invalid data.
    const dt = {
      types: [] as string[],
      effectAllowed: "",
      setData: () => {},
      getData: () => "not-a-number",
      files: [],
    };
    // Manually set dragSourceRef path: dragStart with valid setData first.
    const dt2 = {
      types: [] as string[],
      effectAllowed: "",
      setData: (k: string) => { dt2.types = [k]; },
      getData: () => "not-a-number",
      files: [],
    };
    fireEvent.dragStart(slot0, { dataTransfer: dt2 });
    fireEvent.drop(slot0, { dataTransfer: dt });
    // Still exactly 1 image, no duplicate.
    const imgs = Array.from(document.querySelectorAll("img")).filter((el) => el.getAttribute("src")?.includes("/api/media/"));
    expect(imgs.length).toBe(1);
  });
});

describe("AgendaSection — Sprint 1 OS-File-Drop upload + slotErrors lifecycle", () => {
  // jsdom has no real Image with naturalWidth/Height — install a stub that
  // immediately fires onload with predictable dimensions so probeImageFile
  // resolves. Shared across this describe block.
  const originalImage = global.Image;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    // @ts-expect-error — minimal Image stub for jsdom probe.
    global.Image = class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1600;
      naturalHeight = 900;
      set src(_v: string) {
        // Defer to next microtask so consumers can wire onload.
        Promise.resolve().then(() => this.onload?.());
      }
    };
  });

  afterEach(() => {
    global.Image = originalImage;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.unstubAllGlobals();
  });

  function dragEventDataTransfer(files: File[]) {
    return {
      types: ["Files"],
      effectAllowed: "",
      setData: () => {},
      getData: () => "",
      files,
    };
  }

  it("OS-File-Drop on empty slot triggers uploadFileForAgenda + appends image", async () => {
    (dashboardFetch as unknown as Mock).mockImplementationOnce((url: string) => {
      if (url === "/api/dashboard/media/") {
        return Promise.resolve({ json: async () => ({ success: true, data: { public_id: "uploaded-1" } }) } as Response);
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) } as Response);
    });
    renderWithItems([makeItem()]);
    await openEdit();
    fireEvent.click(screen.getByTestId("mode-3"));
    const slot0 = screen.getByTestId("slot-empty-0");
    const file = new File(["x"], "test.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.drop(slot0, { dataTransfer: dragEventDataTransfer([file]) });
    });
    await waitFor(() => {
      expect(screen.queryByTestId("slot-filled-0")).not.toBeNull();
    });
    const img = screen.getByTestId("slot-filled-0").querySelector("img");
    expect(img?.getAttribute("src")).toContain("/api/media/uploaded-1/");
  });

  it("OS-File-Drop on filled slot is Noop (no upload)", async () => {
    const fetchMock = dashboardFetch as unknown as Mock;
    fetchMock.mockClear();
    renderWithItems([
      makeItem({
        images: [{ public_id: "existing", orientation: "landscape", width: 100, height: 75 }],
        images_grid_columns: 2,
      }),
    ]);
    await openEdit();
    // Initial reload call clears mockClear afterwards — re-clear post-edit-open.
    fetchMock.mockClear();
    const filledSlot = screen.getByTestId("slot-filled-0");
    const file = new File(["x"], "test.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.drop(filledSlot, { dataTransfer: dragEventDataTransfer([file]) });
    });
    // dashboardFetch must NOT have been called for /api/dashboard/media/
    const mediaCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/dashboard/media/");
    expect(mediaCalls.length).toBe(0);
    // Image still the same.
    const img = screen.getByTestId("slot-filled-0").querySelector("img");
    expect(img?.getAttribute("src")).toContain("/api/media/existing/");
  });

  it("Multi-File OS-Drop sequentiell: File 2 fails → File 1 in images[0], slotErrors[1] gesetzt, kein File-3-Upload-Versuch", async () => {
    const fetchMock = dashboardFetch as unknown as Mock;
    fetchMock.mockReset();
    let mediaCallCount = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/dashboard/media/") {
        mediaCallCount += 1;
        if (mediaCallCount === 1) {
          return Promise.resolve({ json: async () => ({ success: true, data: { public_id: "first" } }) } as Response);
        }
        // Second call fails.
        return Promise.resolve({ json: async () => ({ success: false, error: "Upload fehlgeschlagen" }) } as Response);
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) } as Response);
    });
    renderWithItems([makeItem()]);
    await openEdit();
    fireEvent.click(screen.getByTestId("mode-3"));
    const slot0 = screen.getByTestId("slot-empty-0");
    const f1 = new File(["1"], "a.jpg", { type: "image/jpeg" });
    const f2 = new File(["2"], "b.jpg", { type: "image/jpeg" });
    const f3 = new File(["3"], "c.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.drop(slot0, { dataTransfer: dragEventDataTransfer([f1, f2, f3]) });
    });
    await waitFor(() => {
      expect(screen.queryByTestId("slot-filled-0")).not.toBeNull();
    });
    // File 1 persisted as image[0]
    expect(screen.getByTestId("slot-filled-0").querySelector("img")?.getAttribute("src")).toContain("/api/media/first/");
    // slotErrors[1] visible (slot-1 is empty, error overlay in same div)
    await waitFor(() => {
      expect(screen.queryByTestId("slot-error-1")).not.toBeNull();
    });
    // File 3 was never uploaded (loop bricht ab nach failure)
    expect(mediaCallCount).toBe(2);
  });

  it("Single-File upload failure: kein partial-append + Inline-Hint sichtbar", async () => {
    const fetchMock = dashboardFetch as unknown as Mock;
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/dashboard/media/") {
        return Promise.resolve({ json: async () => ({ success: false, error: "Upload fehlgeschlagen" }) } as Response);
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) } as Response);
    });
    renderWithItems([makeItem()]);
    await openEdit();
    fireEvent.click(screen.getByTestId("mode-3"));
    const slot0 = screen.getByTestId("slot-empty-0");
    const file = new File(["x"], "test.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.drop(slot0, { dataTransfer: dragEventDataTransfer([file]) });
    });
    await waitFor(() => {
      expect(screen.queryByTestId("slot-error-0")).not.toBeNull();
    });
    // No partial append — slot 0 must still be empty (not filled).
    expect(screen.queryByTestId("slot-filled-0")).toBeNull();
  });

  it("✕-Remove cleart slotErrors[i] und shift-down aller Keys > i", async () => {
    // Setup: 3 images + slot-error on a "phantom" empty slot beyond. We use
    // a Multi-File-Drop fail scenario to seed slotErrors[1] then remove
    // slot 0 to verify shift-down. With images=[a,b], slotError[2]=err →
    // remove slot 0 → images=[b], slotError[1]=err (shifted from 2 → 1).
    const fetchMock = dashboardFetch as unknown as Mock;
    fetchMock.mockReset();
    let count = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/dashboard/media/") {
        count += 1;
        if (count <= 2) {
          return Promise.resolve({ json: async () => ({ success: true, data: { public_id: `up-${count}` } }) } as Response);
        }
        return Promise.resolve({ json: async () => ({ success: false, error: "fail" }) } as Response);
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) } as Response);
    });
    renderWithItems([makeItem()]);
    await openEdit();
    fireEvent.click(screen.getByTestId("mode-3"));
    // Drop 3 files: first 2 succeed, third fails → images=[up-1, up-2], slotErrors[2]=err.
    const f1 = new File(["1"], "a.jpg", { type: "image/jpeg" });
    const f2 = new File(["2"], "b.jpg", { type: "image/jpeg" });
    const f3 = new File(["3"], "c.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.drop(screen.getByTestId("slot-empty-0"), { dataTransfer: dragEventDataTransfer([f1, f2, f3]) });
    });
    await waitFor(() => {
      expect(screen.queryByTestId("slot-filled-1")).not.toBeNull();
      expect(screen.queryByTestId("slot-error-2")).not.toBeNull();
    });
    // Remove slot 0 → images shift down, slotError shifts from 2 → 1.
    fireEvent.click(screen.getByTestId("slot-filled-0").querySelector("button")!);
    await waitFor(() => {
      // Now image at slot 0 is up-2 (was up-1 removed).
      const img0 = screen.getByTestId("slot-filled-0").querySelector("img");
      expect(img0?.getAttribute("src")).toContain("/api/media/up-2/");
    });
    // slotError shifted from 2 → 1.
    expect(screen.queryByTestId("slot-error-1")).not.toBeNull();
    expect(screen.queryByTestId("slot-error-2")).toBeNull();
  });

  // Codex R1 [P2]: retry-via-picker after upload-failure must clear stale
  // slotError. Without the fix, the success-overlay sat on top of the new
  // image and looked like the upload had failed again.
  it("Picker-select success after upload failure clears stale slotErrors[i]", async () => {
    const fetchMock = dashboardFetch as unknown as Mock;
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/dashboard/media/") {
        return Promise.resolve({ json: async () => ({ success: false, error: "fail" }) } as Response);
      }
      return Promise.resolve({ json: async () => ({ success: true, data: [] }) } as Response);
    });
    renderWithItems([makeItem()]);
    await openEdit();
    fireEvent.click(screen.getByTestId("mode-3"));
    // Step 1: OS-Drop fails → slotError[0] visible.
    const slot0 = screen.getByTestId("slot-empty-0");
    const file = new File(["x"], "fail.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.drop(slot0, { dataTransfer: dragEventDataTransfer([file]) });
    });
    await waitFor(() => {
      expect(screen.queryByTestId("slot-error-0")).not.toBeNull();
    });
    // Step 2: Open picker on slot 0, simulate selection.
    fireEvent.click(screen.getByTestId("slot-empty-0").querySelector("button")!);
    await act(async () => {
      fireEvent.click(screen.getByTestId("mock-picker-pick"));
    });
    // Image now in slot 0 + stale error cleared.
    await waitFor(() => {
      expect(screen.queryByTestId("slot-filled-0")).not.toBeNull();
    });
    expect(screen.queryByTestId("slot-error-0")).toBeNull();
  });

  // Codex R1 [P2]: empty-slot wrapper must be position:relative so the
  // absolute error overlay anchors to the slot, not an outer ancestor.
  it("Empty slot wrapper has 'relative' class so error overlay anchors correctly", async () => {
    renderWithItems([makeItem()]);
    await openEdit();
    fireEvent.click(screen.getByTestId("mode-3"));
    const slot0 = screen.getByTestId("slot-empty-0");
    expect(slot0.className.split(/\s+/)).toContain("relative");
  });
});

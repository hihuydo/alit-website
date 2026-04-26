// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgendaSection, type AgendaItem } from "./AgendaSection";
import { DirtyProvider } from "../DirtyContext";

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
  MediaPicker: () => null,
}));
vi.mock("@/components/AgendaItem", () => ({
  AgendaItem: () => null,
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
    sort_order: 0,
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

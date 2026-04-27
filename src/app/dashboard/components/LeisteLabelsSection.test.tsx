// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LeisteLabelsSection } from "./LeisteLabelsSection";
import { DirtyProvider } from "../DirtyContext";
import { dashboardFetch } from "../lib/dashboardFetch";
import type { LeisteLabelsI18n } from "@/lib/leiste-labels-shared";

vi.mock("../lib/dashboardFetch", () => ({
  dashboardFetch: vi.fn(),
}));

// Mirror the real server: trim every string field, return normalized body
// in `data`. The component re-snapshots from this response, so the mock must
// match the API's normalization contract.
function trimLabels(loc: unknown): Record<string, string> | null {
  if (!loc || typeof loc !== "object") return null;
  return Object.fromEntries(
    Object.entries(loc as Record<string, unknown>).map(([k, v]) => [
      k,
      typeof v === "string" ? v.trim() : "",
    ]),
  );
}

afterEach(() => cleanup());
beforeEach(() => {
  (dashboardFetch as Mock).mockReset();
  (dashboardFetch as Mock).mockImplementation((_url: string, opts?: RequestInit) => {
    const body = opts?.body ? JSON.parse(opts.body as string) : { de: null, fr: null };
    const data = { de: trimLabels(body.de), fr: trimLabels(body.fr) };
    return Promise.resolve({ json: async () => ({ success: true, data }) } as Response);
  });
});

const customDe = {
  verein: "Termine",
  vereinSub: "",
  literatur: "Discours",
  literaturSub: "",
  stiftung: "Verein",
  stiftungSub: "",
};

function renderSection(initial: LeisteLabelsI18n) {
  return render(
    <DirtyProvider>
      <LeisteLabelsSection initial={initial} />
    </DirtyProvider>,
  );
}

describe("LeisteLabelsSection", () => {
  it("renders 12 inputs (6 fields × 2 locales) with initial values", () => {
    renderSection({ de: customDe, fr: null });
    const deVerein = screen.getByTestId("leiste-de-verein") as HTMLInputElement;
    const frVerein = screen.getByTestId("leiste-fr-verein") as HTMLInputElement;
    const deStiftung = screen.getByTestId("leiste-de-stiftung") as HTMLInputElement;
    expect(deVerein.value).toBe("Termine");
    expect(frVerein.value).toBe(""); // null per-locale → empty
    expect(deStiftung.value).toBe("Verein");
    // All 12 inputs should be present
    expect(screen.getAllByRole("textbox").length).toBe(12);
  });

  it("editing a field updates state + enables Save", () => {
    renderSection({ de: null, fr: null });
    const deVerein = screen.getByTestId("leiste-de-verein") as HTMLInputElement;
    const saveBtn = screen.getByTestId("leiste-save") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true); // not dirty yet
    fireEvent.change(deVerein, { target: { value: "Neue Agenda" } });
    expect(deVerein.value).toBe("Neue Agenda");
    expect(saveBtn.disabled).toBe(false); // now dirty
  });

  it("Reset rolls back to initial values + disables Save", () => {
    renderSection({ de: customDe, fr: null });
    const deVerein = screen.getByTestId("leiste-de-verein") as HTMLInputElement;
    fireEvent.change(deVerein, { target: { value: "Geändert" } });
    expect(deVerein.value).toBe("Geändert");
    fireEvent.click(screen.getByTestId("leiste-reset"));
    expect(deVerein.value).toBe("Termine"); // back to initial
    expect((screen.getByTestId("leiste-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Save sends PUT with full {de, fr} payload (empty-locale → null)", async () => {
    renderSection({ de: null, fr: null });
    fireEvent.change(screen.getByTestId("leiste-de-verein"), { target: { value: "Termine" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("leiste-save"));
    });
    const fetchMock = dashboardFetch as Mock;
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/site-settings/leiste-labels/",
      expect.objectContaining({ method: "PUT" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.de.verein).toBe("Termine");
    // FR is all-empty after-trim → serialized as null
    expect(body.fr).toBe(null);
  });

  it("after Save, Reset rolls back to the SAVED state (not the page-load prop)", async () => {
    renderSection({ de: customDe, fr: null });
    const deVerein = screen.getByTestId("leiste-de-verein") as HTMLInputElement;
    expect(deVerein.value).toBe("Termine");
    // First edit + save → "Termine" → "Erste Speicherung"
    fireEvent.change(deVerein, { target: { value: "Erste Speicherung" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("leiste-save"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("leiste-saved-toast")).toBeTruthy();
    });
    expect(deVerein.value).toBe("Erste Speicherung");
    // Second edit (not yet saved)
    fireEvent.change(deVerein, { target: { value: "Zwischenstand" } });
    expect(deVerein.value).toBe("Zwischenstand");
    // Reset → must roll back to the LAST SAVED value, not "Termine"
    fireEvent.click(screen.getByTestId("leiste-reset"));
    expect(deVerein.value).toBe("Erste Speicherung");
  });

  it("Save re-snapshots from server-trimmed response (untrimmed input → trimmed baseline)", async () => {
    renderSection({ de: null, fr: null });
    const deVerein = screen.getByTestId("leiste-de-verein") as HTMLInputElement;
    fireEvent.change(deVerein, { target: { value: "  Agenda  " } });
    expect(deVerein.value).toBe("  Agenda  ");
    await act(async () => {
      fireEvent.click(screen.getByTestId("leiste-save"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("leiste-saved-toast")).toBeTruthy();
    });
    // Server trims → form should reflect normalized value, dirty cleared.
    expect(deVerein.value).toBe("Agenda");
    expect((screen.getByTestId("leiste-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Save displays success-toast + clears dirty state on success", async () => {
    renderSection({ de: null, fr: null });
    fireEvent.change(screen.getByTestId("leiste-de-verein"), { target: { value: "X" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("leiste-save"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("leiste-saved-toast")).toBeTruthy();
    });
    // After save, dirty cleared → Save disabled until new edit
    expect((screen.getByTestId("leiste-save") as HTMLButtonElement).disabled).toBe(true);
  });
});

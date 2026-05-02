// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NavLabelsSection } from "./NavLabelsSection";
import { DirtyProvider } from "../DirtyContext";
import { dashboardFetch } from "../lib/dashboardFetch";
import type { NavLabelsI18n } from "@/lib/nav-labels-shared";

vi.mock("../lib/dashboardFetch", () => ({
  dashboardFetch: vi.fn(),
}));

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
  agenda: "Termine",
  projekte: "Werke",
  alit: "Verein",
  mitgliedschaft: "Beitritt",
  newsletter: "Updates",
};

function renderSection(initial: NavLabelsI18n) {
  return render(
    <DirtyProvider>
      <NavLabelsSection initial={initial} />
    </DirtyProvider>,
  );
}

describe("NavLabelsSection", () => {
  it("renders 10 inputs (5 fields × 2 locales) with initial values", () => {
    renderSection({ de: customDe, fr: null });
    const deAgenda = screen.getByTestId("nav-de-agenda") as HTMLInputElement;
    const frAgenda = screen.getByTestId("nav-fr-agenda") as HTMLInputElement;
    const deNewsletter = screen.getByTestId("nav-de-newsletter") as HTMLInputElement;
    expect(deAgenda.value).toBe("Termine");
    expect(frAgenda.value).toBe("");
    expect(deNewsletter.value).toBe("Updates");
    expect(screen.getAllByRole("textbox").length).toBe(10);
  });

  it("editing a field enables Save", () => {
    renderSection({ de: null, fr: null });
    const saveBtn = screen.getByTestId("nav-save") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("nav-de-agenda"), { target: { value: "Neu" } });
    expect(saveBtn.disabled).toBe(false);
  });

  it("Save PUTs to /nav-labels/ with empty-locale → null", async () => {
    renderSection({ de: null, fr: null });
    fireEvent.change(screen.getByTestId("nav-de-agenda"), { target: { value: "Termine" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("nav-save"));
    });
    const fetchMock = dashboardFetch as Mock;
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/site-settings/nav-labels/",
      expect.objectContaining({ method: "PUT" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.de.agenda).toBe("Termine");
    expect(body.fr).toBe(null);
  });

  it("Reset rolls back to last saved value, not page-load prop", async () => {
    renderSection({ de: customDe, fr: null });
    const deAgenda = screen.getByTestId("nav-de-agenda") as HTMLInputElement;
    fireEvent.change(deAgenda, { target: { value: "Erste Speicherung" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("nav-save"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("nav-saved-toast")).toBeTruthy();
    });
    fireEvent.change(deAgenda, { target: { value: "Zwischenstand" } });
    fireEvent.click(screen.getByTestId("nav-reset"));
    expect(deAgenda.value).toBe("Erste Speicherung");
  });

  it("Save shows success toast + clears dirty", async () => {
    renderSection({ de: null, fr: null });
    fireEvent.change(screen.getByTestId("nav-de-agenda"), { target: { value: "X" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("nav-save"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("nav-saved-toast")).toBeTruthy();
    });
    expect((screen.getByTestId("nav-save") as HTMLButtonElement).disabled).toBe(true);
  });
});

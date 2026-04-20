// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JournalInfoEditor, type JournalInfoValue } from "./JournalInfoEditor";
import { DirtyProvider } from "../DirtyContext";

afterEach(() => cleanup());

// Stub dashboardFetch so tests don't hit the network or need a CSRF token.
vi.mock("../lib/dashboardFetch", () => ({
  dashboardFetch: vi.fn(),
}));

// Avoid pulling the full RichTextEditor contentEditable machinery into
// jsdom — we only need to simulate onChange firing (which is what Save
// depends on). The stub exposes a plain textarea for the test to drive.
vi.mock("./RichTextEditor", () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (html: string) => void }) => (
    <textarea
      data-testid="rte-stub"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { dashboardFetch } from "../lib/dashboardFetch";

const mockedFetch = dashboardFetch as unknown as ReturnType<typeof vi.fn>;

function renderEditor(initial: JournalInfoValue = { de: null, fr: null }) {
  return render(
    <DirtyProvider>
      <JournalInfoEditor initial={initial} />
    </DirtyProvider>,
  );
}

describe("JournalInfoEditor", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("Save button disabled initially when no edits", () => {
    renderEditor();
    const saveBtn = screen.getByRole("button", { name: /speichern/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("enables Save after edit, sends PUT with empty-normalized payload on empty input", async () => {
    mockedFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { de: null, fr: null } }),
    });
    renderEditor();
    const saveBtn = screen.getByRole("button", { name: /speichern/i }) as HTMLButtonElement;
    // Type into the DE textarea — triggers onChange → dirty.
    const deTextarea = screen.getAllByTestId("rte-stub")[0];
    fireEvent.change(deTextarea, { target: { value: "<p>   </p>" } });
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    const call = mockedFetch.mock.calls[0];
    expect(call[0]).toBe("/api/dashboard/site-settings/journal-info/");
    expect(call[1].method).toBe("PUT");
    const payload = JSON.parse(call[1].body);
    // Whitespace-only paragraph normalizes to null before send.
    expect(payload).toEqual({ de: null, fr: null });
  });

  it("sends DE content untouched when admin types real text", async () => {
    mockedFetch.mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: { de: null, fr: null },
      }),
    });
    renderEditor();
    const deTextarea = screen.getAllByTestId("rte-stub")[0];
    fireEvent.change(deTextarea, { target: { value: "<p>Hallo Welt</p>" } });
    fireEvent.click(screen.getByRole("button", { name: /speichern/i }));
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    const payload = JSON.parse(mockedFetch.mock.calls[0][1].body);
    expect(Array.isArray(payload.de)).toBe(true);
    expect(payload.de.length).toBeGreaterThan(0);
    expect(payload.de[0].type).toBe("paragraph");
  });

  it("re-disables Save after successful save (snapshot reset)", async () => {
    mockedFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: { de: null, fr: null } }),
    });
    renderEditor();
    const deTextarea = screen.getAllByTestId("rte-stub")[0];
    fireEvent.change(deTextarea, { target: { value: "<p>test</p>" } });
    const saveBtn = screen.getByRole("button", { name: /speichern/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /speichern/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  it("shows server error message when PUT returns {success:false}", async () => {
    mockedFetch.mockResolvedValueOnce({
      json: async () => ({ success: false, error: "Ungültiges Format (de): foo" }),
    });
    renderEditor();
    const deTextarea = screen.getAllByTestId("rte-stub")[0];
    fireEvent.change(deTextarea, { target: { value: "<p>broken</p>" } });
    fireEvent.click(screen.getByRole("button", { name: /speichern/i }));
    await waitFor(() => {
      expect(screen.getByText(/Ungültiges Format/)).not.toBeNull();
    });
  });
});

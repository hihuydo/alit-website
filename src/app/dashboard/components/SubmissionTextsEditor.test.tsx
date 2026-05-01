// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SubmissionTextsEditor } from "./SubmissionTextsEditor";
import { DirtyProvider } from "../DirtyContext";
import { getDictionary } from "@/i18n/dictionaries";

afterEach(() => cleanup());

vi.mock("../lib/dashboardFetch", () => ({
  dashboardFetch: vi.fn(),
}));

import { dashboardFetch } from "../lib/dashboardFetch";

const mockedDashFetch = dashboardFetch as unknown as ReturnType<typeof vi.fn>;

const EMPTY_RESPONSE = {
  success: true,
  data: {
    mitgliedschaft: { de: {}, fr: {} },
    newsletter: { de: {}, fr: {} },
  },
  etag: null as string | null,
};

function stubGlobalFetch(initialResponse: unknown = EMPTY_RESPONSE) {
  const fetchSpy = vi.fn().mockResolvedValue({
    json: async () => initialResponse,
  });
  
  globalThis.fetch = fetchSpy;
  return fetchSpy;
}

function renderEditor(opts?: { onDirtyChange?: (b: boolean) => void }) {
  return render(
    <DirtyProvider>
      <SubmissionTextsEditor onDirtyChange={opts?.onDirtyChange} />
    </DirtyProvider>,
  );
}

describe("SubmissionTextsEditor", () => {
  beforeEach(() => {
    mockedDashFetch.mockReset();
  });

  it("initial render shows mitgliedschaft.de defaults from dictionary", async () => {
    stubGlobalFetch();
    renderEditor();
    const dict = getDictionary("de");
    // heading input should appear with the DE mitgliedschaft heading default.
    await waitFor(() => {
      const headingInput = document.getElementById("submission-text-mitgliedschaft-de-heading") as HTMLInputElement;
      expect(headingInput).not.toBeNull();
      expect(headingInput.value).toBe(dict.mitgliedschaft.heading);
    });
  });

  it("Save button is disabled initially (not dirty)", async () => {
    stubGlobalFetch();
    renderEditor();
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /^speichern$/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  it("typing in a field toggles isDirty + notifies onDirtyChange", async () => {
    stubGlobalFetch();
    const onDirty = vi.fn();
    renderEditor({ onDirtyChange: onDirty });
    await waitFor(() => {
      expect(document.getElementById("submission-text-mitgliedschaft-de-heading")).not.toBeNull();
    });
    const headingInput = document.getElementById("submission-text-mitgliedschaft-de-heading") as HTMLInputElement;
    fireEvent.change(headingInput, { target: { value: "My new heading" } });
    const saveBtn = screen.getByRole("button", { name: /^speichern$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    expect(onDirty).toHaveBeenCalledWith(true);
  });

  it("PUT only sends fields that diverge from defaults (stripDictEqual)", async () => {
    stubGlobalFetch();
    mockedDashFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        data: {
          mitgliedschaft: { de: { heading: "My new heading" }, fr: {} },
          newsletter: { de: {}, fr: {} },
        },
        etag: "2026-05-01T10:00:00.000Z",
      }),
    });
    renderEditor();
    await waitFor(() => {
      expect(document.getElementById("submission-text-mitgliedschaft-de-heading")).not.toBeNull();
    });
    const input = document.getElementById("submission-text-mitgliedschaft-de-heading") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "My new heading" } });
    fireEvent.click(screen.getByRole("button", { name: /^speichern$/i }));
    await waitFor(() => expect(mockedDashFetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(mockedDashFetch.mock.calls[0][1].body);
    expect(body.etag).toBe(null);
    // Only the changed field appears in the payload — all defaults stripped.
    expect(body.data.mitgliedschaft.de).toEqual({ heading: "My new heading" });
    expect(body.data.mitgliedschaft.fr).toEqual({});
    expect(body.data.newsletter.de).toEqual({});
    expect(body.data.newsletter.fr).toEqual({});
  });

  it("after successful save: re-snapshots from server response → isDirty resets to false", async () => {
    stubGlobalFetch();
    mockedDashFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        data: {
          mitgliedschaft: { de: { heading: "X" }, fr: {} },
          newsletter: { de: {}, fr: {} },
        },
        etag: "2026-05-01T10:00:00.000Z",
      }),
    });
    renderEditor();
    await waitFor(() => {
      expect(document.getElementById("submission-text-mitgliedschaft-de-heading")).not.toBeNull();
    });
    const input = document.getElementById("submission-text-mitgliedschaft-de-heading") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "X" } });
    const saveBtn = screen.getByRole("button", { name: /^speichern$/i }) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => expect(saveBtn.disabled).toBe(true));
    // Save flash visible.
    expect(screen.getByText(/Gespeichert/)).not.toBeNull();
  });

  it("subsequent save without further edit is a no-op (button stays disabled)", async () => {
    stubGlobalFetch();
    mockedDashFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        data: {
          mitgliedschaft: { de: { heading: "X" }, fr: {} },
          newsletter: { de: {}, fr: {} },
        },
        etag: "2026-05-01T10:00:00.000Z",
      }),
    });
    renderEditor();
    await waitFor(() => {
      expect(document.getElementById("submission-text-mitgliedschaft-de-heading")).not.toBeNull();
    });
    const input = document.getElementById("submission-text-mitgliedschaft-de-heading") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "X" } });
    const saveBtn = screen.getByRole("button", { name: /^speichern$/i }) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => expect(saveBtn.disabled).toBe(true));
    // Save was called exactly once — no spurious second save.
    expect(mockedDashFetch).toHaveBeenCalledTimes(1);
  });

  it("Reset button reverts active form×locale to dictionary defaults", async () => {
    stubGlobalFetch();
    renderEditor();
    await waitFor(() => {
      expect(document.getElementById("submission-text-mitgliedschaft-de-heading")).not.toBeNull();
    });
    const dict = getDictionary("de");
    const input = document.getElementById("submission-text-mitgliedschaft-de-heading") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Diverged" } });
    expect(input.value).toBe("Diverged");
    fireEvent.click(screen.getByRole("button", { name: /Standard/i }));
    expect(input.value).toBe(dict.mitgliedschaft.heading);
    // After reset, isDirty is true (display equals defaults but snapshot is from GET — null/empty)
    // Actually since GET returned empty → snapshot already equals defaults → reset to defaults = no diff.
    // What matters: reset doesn't trigger a PUT.
    expect(mockedDashFetch).not.toHaveBeenCalled();
  });

  it("userTouchedRef-race: late-arriving GET does NOT overwrite user input", async () => {
    let resolveFetch!: (v: unknown) => void;
    const slowFetch = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = (val) => resolve({ json: async () => val });
      }),
    );
    
    globalThis.fetch = slowFetch;
    renderEditor();
    // Wait for the input to render with hardcoded default
    await waitFor(() => {
      expect(document.getElementById("submission-text-mitgliedschaft-de-heading")).not.toBeNull();
    });
    const input = document.getElementById("submission-text-mitgliedschaft-de-heading") as HTMLInputElement;
    // User types BEFORE GET resolves
    fireEvent.change(input, { target: { value: "User typed first" } });
    expect(input.value).toBe("User typed first");
    // Now GET resolves with stored value that should be ignored
    await act(async () => {
      resolveFetch({
        success: true,
        data: {
          mitgliedschaft: { de: { heading: "Server value" }, fr: {} },
          newsletter: { de: {}, fr: {} },
        },
        etag: "2026-05-01T10:00:00.000Z",
      });
      await Promise.resolve();
    });
    // User input preserved — no overwrite
    expect(input.value).toBe("User typed first");
  });

  it("PUT 409 stale_etag → shows banner + reload button", async () => {
    stubGlobalFetch();
    mockedDashFetch.mockResolvedValueOnce({
      status: 409,
      json: async () => ({ success: false, error: "stale_etag", code: "stale_etag" }),
    });
    renderEditor();
    await waitFor(() => {
      expect(document.getElementById("submission-text-mitgliedschaft-de-heading")).not.toBeNull();
    });
    const input = document.getElementById("submission-text-mitgliedschaft-de-heading") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /^speichern$/i }));
    await waitFor(() => {
      expect(screen.getByText(/inzwischen von einem anderen Admin geändert/)).not.toBeNull();
    });
    expect(screen.getByRole("button", { name: /Neu laden/i })).not.toBeNull();
  });

  it("Reload button after 409 fetches fresh state + clears banner + clears local edits", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ json: async () => EMPTY_RESPONSE }) // initial GET
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: {
            mitgliedschaft: { de: { heading: "Other admin's heading" }, fr: {} },
            newsletter: { de: {}, fr: {} },
          },
          etag: "2026-05-01T11:00:00.000Z",
        }),
      });
    
    globalThis.fetch = fetchSpy;
    mockedDashFetch.mockResolvedValueOnce({
      status: 409,
      json: async () => ({ success: false, error: "stale_etag", code: "stale_etag" }),
    });
    renderEditor();
    await waitFor(() => {
      expect(document.getElementById("submission-text-mitgliedschaft-de-heading")).not.toBeNull();
    });
    const input = document.getElementById("submission-text-mitgliedschaft-de-heading") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Local change" } });
    fireEvent.click(screen.getByRole("button", { name: /^speichern$/i }));
    await waitFor(() => {
      expect(screen.getByText(/inzwischen von einem anderen Admin geändert/)).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: /Neu laden/i }));
    await waitFor(() => {
      const fresh = document.getElementById("submission-text-mitgliedschaft-de-heading") as HTMLInputElement;
      expect(fresh.value).toBe("Other admin's heading");
    });
    // Banner gone
    expect(screen.queryByText(/inzwischen von einem anderen Admin geändert/)).toBeNull();
  });

  it("switching to newsletter tab + FR locale shows newsletter FR fields", async () => {
    stubGlobalFetch();
    renderEditor();
    await waitFor(() => {
      expect(document.getElementById("submission-text-mitgliedschaft-de-heading")).not.toBeNull();
    });
    fireEvent.click(screen.getByTestId("submission-form-newsletter"));
    fireEvent.click(screen.getByTestId("submission-locale-fr"));
    const dict = getDictionary("fr");
    await waitFor(() => {
      const privacyInput = document.getElementById("submission-text-newsletter-fr-privacy") as HTMLTextAreaElement;
      expect(privacyInput).not.toBeNull();
      expect(privacyInput.value).toBe(dict.newsletter.privacy);
    });
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProjekteSection, type Projekt } from "./ProjekteSection";
import { DirtyProvider } from "../DirtyContext";

afterEach(() => cleanup());

vi.mock("../lib/dashboardFetch", () => ({
  dashboardFetch: vi.fn(),
}));

// Stub RichTextEditor (contentEditable machinery is hard to drive in jsdom).
// The stub exposes a plain textarea per mount; multiple editors show up as
// multiple testid rows which the test can target by nth.
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

const initialProjekt: Projekt = {
  id: 7,
  slug_de: "discours-agites",
  slug_fr: null,
  archived: false,
  sort_order: 0,
  title_i18n: { de: "Discours Agités" },
  kategorie_i18n: { de: "Reihe" },
  content_i18n: { de: [] },
  show_newsletter_signup: false,
  completion: { de: true, fr: false },
};

function renderSection(items: Projekt[] = [initialProjekt]) {
  // ProjekteSection reloads from the API on mount — stub global fetch to
  // return the same items so the component renders its list synchronously.
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        json: async () => ({ success: true, data: items }),
      } as Response),
    ),
  );
  return render(
    <DirtyProvider>
      <ProjekteSection initial={items} />
    </DirtyProvider>,
  );
}

describe("ProjekteSection — newsletter-signup fields", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the 'Newsletter-Signup auf Projekt-Seite anzeigen' checkbox when editing a projekt", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /bearbeiten/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Newsletter-Signup auf Projekt-Seite anzeigen/i)).not.toBeNull();
    });
  });

  it("does NOT render a per-projekt intro field (intro lives in Submission-Texts now)", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /bearbeiten/i }));
    await waitFor(() => screen.getByLabelText(/Newsletter-Signup auf Projekt-Seite anzeigen/i));
    fireEvent.click(screen.getByLabelText(/Newsletter-Signup auf Projekt-Seite anzeigen/i));
    // Even when signup is on, no "Newsletter-Einleitungstext" label appears.
    expect(screen.queryAllByText(/Newsletter-Einleitungstext/)).toHaveLength(0);
  });

  it("Save PUT payload contains show_newsletter_signup but NOT newsletter_signup_intro_i18n", async () => {
    mockedFetch.mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: { ...initialProjekt, show_newsletter_signup: true },
      }),
    });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /bearbeiten/i }));
    await waitFor(() => screen.getByLabelText(/Newsletter-Signup auf Projekt-Seite anzeigen/i));
    fireEvent.click(screen.getByLabelText(/Newsletter-Signup auf Projekt-Seite anzeigen/i));
    fireEvent.click(screen.getByRole("button", { name: /speichern/i }));
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    const [url, init] = mockedFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/dashboard\/projekte\/7\//);
    expect(init.method).toBe("PUT");
    const payload = JSON.parse(init.body);
    expect(payload.show_newsletter_signup).toBe(true);
    expect("newsletter_signup_intro_i18n" in payload).toBe(false);
  });
});

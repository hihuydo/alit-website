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
  newsletter_signup_intro_i18n: null,
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

  it("reveals the intro RichTextEditor only when the checkbox is checked", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /bearbeiten/i }));
    await waitFor(() => screen.getByLabelText(/Newsletter-Signup auf Projekt-Seite anzeigen/i));
    // Before check: no "Newsletter-Einleitungstext" label
    expect(screen.queryAllByText(/Newsletter-Einleitungstext/)).toHaveLength(0);
    // After check: DE + FR intro labels appear (one per locale tab container).
    fireEvent.click(screen.getByLabelText(/Newsletter-Signup auf Projekt-Seite anzeigen/i));
    await waitFor(() => {
      expect(screen.getAllByText(/Newsletter-Einleitungstext/).length).toBeGreaterThan(0);
    });
  });

  it("Save sends show_newsletter_signup + newsletter_signup_intro_i18n in the PUT payload", async () => {
    mockedFetch.mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: { ...initialProjekt, show_newsletter_signup: true, newsletter_signup_intro_i18n: null },
      }),
    });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /bearbeiten/i }));
    await waitFor(() => screen.getByLabelText(/Newsletter-Signup auf Projekt-Seite anzeigen/i));
    fireEvent.click(screen.getByLabelText(/Newsletter-Signup auf Projekt-Seite anzeigen/i));
    // Wait for intro RichTextEditor stub to mount so we can type into it.
    await waitFor(() => {
      expect(screen.getAllByTestId("rte-stub").length).toBeGreaterThanOrEqual(2);
    });
    // Now click Speichern and verify payload.
    fireEvent.click(screen.getByRole("button", { name: /speichern/i }));
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    const [url, init] = mockedFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/dashboard\/projekte\/7\//);
    expect(init.method).toBe("PUT");
    const payload = JSON.parse(init.body);
    expect(payload.show_newsletter_signup).toBe(true);
    expect(payload.newsletter_signup_intro_i18n).toBeDefined();
    expect(payload.newsletter_signup_intro_i18n.de).toBeDefined();
    expect(payload.newsletter_signup_intro_i18n.fr).toBeDefined();
  });
});

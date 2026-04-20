import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests for the newsletter-signup resolve path in `getProjekte`:
 *   - pass-through of `show_newsletter_signup` column
 *   - per-locale intro with dict-fallback when DB value is null
 *   - per-locale intro rendered as stored content when populated
 *   - whitespace-only stored content falls through to dict-fallback
 *
 * `getJournalInfo` covers a similar pattern but for the site-wide i-bar
 * setting; this file locks the projekte-layer logic separately.
 */
describe("getProjekte — newsletter-signup fields", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    mockQuery.mockReset();
    vi.doMock("@/lib/db", () => ({ default: { query: mockQuery } }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/db");
  });

  function baseRow(overrides: Record<string, unknown> = {}) {
    return {
      slug_de: "discours-agites",
      slug_fr: null,
      archived: false,
      title_i18n: { de: "Discours Agités" },
      kategorie_i18n: { de: "Reihe" },
      content_i18n: { de: [{ id: "1", type: "paragraph", content: [{ text: "content" }] }] },
      show_newsletter_signup: true,
      newsletter_signup_intro_i18n: null,
      ...overrides,
    };
  }

  it("DE locale: falls back to dict.newsletter.intro when DB intro is null", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [baseRow()] });
    const { getProjekte } = await import("./queries");
    const out = await getProjekte("de");
    expect(out).toHaveLength(1);
    expect(out[0].showNewsletterSignup).toBe(true);
    expect(out[0].newsletterSignupIntro).toHaveLength(1);
    const para = out[0].newsletterSignupIntro[0] as { content: { text: string }[] };
    expect(para.content[0].text).toMatch(/In unserem Newsletter/);
  });

  it("FR locale: falls back to FR dict string when DB intro is null", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({ title_i18n: { de: "Discours Agités", fr: "Discours Agités" } })],
    });
    const { getProjekte } = await import("./queries");
    const out = await getProjekte("fr");
    expect(out).toHaveLength(1);
    const para = out[0].newsletterSignupIntro[0] as { content: { text: string }[] };
    expect(para.content[0].text).toMatch(/Dans notre newsletter/);
  });

  it("returns stored DE intro when populated, not the dict fallback", async () => {
    const storedDe = [{ id: "42", type: "paragraph", content: [{ text: "Admin-edited DE intro" }] }];
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({ newsletter_signup_intro_i18n: { de: storedDe, fr: null } })],
    });
    const { getProjekte } = await import("./queries");
    const out = await getProjekte("de");
    expect(out[0].newsletterSignupIntro).toEqual(storedDe);
  });

  it("FR locale with null FR intro but stored DE intro: FR still falls back to FR dict (projekte-layer does NOT DE-merge intro)", async () => {
    // getProjekte resolves per-locale INDEPENDENTLY from the column-nullable
    // intro_i18n. Unlike getJournalInfo, there's no FR→DE-row fallback for
    // the intro — just FR-column → FR-dict. This keeps the projekte read
    // path simple and surfaces Admin-intent faithfully (empty FR = use dict).
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({
        title_i18n: { de: "Discours Agités", fr: "Discours Agités" },
        newsletter_signup_intro_i18n: {
          de: [{ id: "1", type: "paragraph", content: [{ text: "DE only" }] }],
          fr: null,
        },
      })],
    });
    const { getProjekte } = await import("./queries");
    const out = await getProjekte("fr");
    const para = out[0].newsletterSignupIntro[0] as { content: { text: string }[] };
    expect(para.content[0].text).toMatch(/Dans notre newsletter/);
  });

  it("whitespace-only stored intro falls back to dict", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({
        newsletter_signup_intro_i18n: {
          de: [{ id: "1", type: "paragraph", content: [{ text: "   " }] }],
          fr: null,
        },
      })],
    });
    const { getProjekte } = await import("./queries");
    const out = await getProjekte("de");
    const para = out[0].newsletterSignupIntro[0] as { content: { text: string }[] };
    expect(para.content[0].text).toMatch(/In unserem Newsletter/);
  });

  it("showNewsletterSignup defaults to false when column is false", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({ show_newsletter_signup: false })],
    });
    const { getProjekte } = await import("./queries");
    const out = await getProjekte("de");
    expect(out[0].showNewsletterSignup).toBe(false);
    // Intro still resolves (dict-fallback) — the public renderer decides
    // whether to show the section based on the flag, not the intro.
    expect(out[0].newsletterSignupIntro).toHaveLength(1);
  });
});

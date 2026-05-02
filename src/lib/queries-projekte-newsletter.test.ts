import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Locks the surviving newsletter-signup pass-through in `getProjekte`
 * (the show_newsletter_signup boolean). Per-projekt intro was retired —
 * intro now lives globally in dict.newsletter.intro and is overlaid by
 * the Submission-Texts editor at layout time, so this read path no
 * longer resolves it.
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
      ...overrides,
    };
  }

  it("passes show_newsletter_signup=true through", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [baseRow()] });
    const { getProjekte } = await import("./queries");
    const out = await getProjekte("de");
    expect(out).toHaveLength(1);
    expect(out[0].showNewsletterSignup).toBe(true);
  });

  it("show_newsletter_signup=false comes through as false", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [baseRow({ show_newsletter_signup: false })],
    });
    const { getProjekte } = await import("./queries");
    const out = await getProjekte("de");
    expect(out[0].showNewsletterSignup).toBe(false);
  });

  it("does NOT expose newsletterSignupIntro (per-projekt intro retired)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [baseRow()] });
    const { getProjekte } = await import("./queries");
    const out = await getProjekte("de");
    // The field used to be on the type; it's gone now.
    expect((out[0] as Record<string, unknown>).newsletterSignupIntro).toBeUndefined();
  });
});

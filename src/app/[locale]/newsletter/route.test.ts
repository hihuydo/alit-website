import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function fakeReq() {
  // The handler uses SITE_URL (not req.url) to build the redirect target,
  // so req only needs to be a valid NextRequest shape for TypeScript.
  return {} as unknown as import("next/server").NextRequest;
}

describe("GET /[locale]/newsletter (308 redirect)", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "https://alit.hihuydo.com");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects DE → /de/projekte/discours-agites#newsletter-signup", async () => {
    const { GET } = await import("./route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ locale: "de" }) });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://alit.hihuydo.com/de/projekte/discours-agites#newsletter-signup",
    );
  });

  it("redirects FR → /fr/projekte/discours-agites#newsletter-signup", async () => {
    const { GET } = await import("./route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ locale: "fr" }) });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://alit.hihuydo.com/fr/projekte/discours-agites#newsletter-signup",
    );
  });

  it("unknown locale falls back to de", async () => {
    const { GET } = await import("./route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ locale: "xx" }) });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://alit.hihuydo.com/de/projekte/discours-agites#newsletter-signup",
    );
  });

  it("respects SITE_URL override (staging host)", async () => {
    vi.stubEnv("SITE_URL", "https://staging.alit.hihuydo.com");
    const { GET } = await import("./route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ locale: "de" }) });
    expect(res.headers.get("location")).toBe(
      "https://staging.alit.hihuydo.com/de/projekte/discours-agites#newsletter-signup",
    );
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function fakeReq() {
  return {} as unknown as import("next/server").NextRequest;
}

describe("GET /[locale]/projekte/discours-agits (old-slug 308)", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "https://alit.hihuydo.com");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects DE → /de/projekte/discours-agites", async () => {
    const { GET } = await import("./route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ locale: "de" }) });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://alit.hihuydo.com/de/projekte/discours-agites",
    );
  });

  it("redirects FR → /fr/projekte/discours-agites", async () => {
    const { GET } = await import("./route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ locale: "fr" }) });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://alit.hihuydo.com/fr/projekte/discours-agites",
    );
  });

  it("respects SITE_URL override (staging host)", async () => {
    vi.stubEnv("SITE_URL", "https://staging.alit.hihuydo.com");
    const { GET } = await import("./route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ locale: "de" }) });
    expect(res.headers.get("location")).toBe(
      "https://staging.alit.hihuydo.com/de/projekte/discours-agites",
    );
  });
});

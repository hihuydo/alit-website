import { describe, it, expect } from "vitest";
import { GET } from "./route";

function fakeReq(url: string) {
  return { url } as unknown as import("next/server").NextRequest;
}

describe("GET /[locale]/projekte/discours-agits (old-slug 308)", () => {
  it("redirects DE → /de/projekte/discours-agites", async () => {
    const res = await GET(
      fakeReq("https://alit.hihuydo.com/de/projekte/discours-agits"),
      { params: Promise.resolve({ locale: "de" }) },
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://alit.hihuydo.com/de/projekte/discours-agites",
    );
  });

  it("redirects FR → /fr/projekte/discours-agites", async () => {
    const res = await GET(
      fakeReq("https://alit.hihuydo.com/fr/projekte/discours-agits"),
      { params: Promise.resolve({ locale: "fr" }) },
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://alit.hihuydo.com/fr/projekte/discours-agites",
    );
  });
});

import { describe, it, expect } from "vitest";
import { GET } from "./route";

function fakeReq(url: string) {
  return { url } as unknown as import("next/server").NextRequest;
}

describe("GET /[locale]/newsletter (308 redirect)", () => {
  it("redirects DE → /de/projekte/discours-agites#newsletter-signup", async () => {
    const res = await GET(fakeReq("https://alit.hihuydo.com/de/newsletter"), {
      params: Promise.resolve({ locale: "de" }),
    });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://alit.hihuydo.com/de/projekte/discours-agites#newsletter-signup",
    );
  });

  it("redirects FR → /fr/projekte/discours-agites#newsletter-signup", async () => {
    const res = await GET(fakeReq("https://alit.hihuydo.com/fr/newsletter"), {
      params: Promise.resolve({ locale: "fr" }),
    });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://alit.hihuydo.com/fr/projekte/discours-agites#newsletter-signup",
    );
  });

  it("unknown locale falls back to de (defensive, should never happen via route matcher)", async () => {
    const res = await GET(fakeReq("https://alit.hihuydo.com/xx/newsletter"), {
      params: Promise.resolve({ locale: "xx" }),
    });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://alit.hihuydo.com/de/projekte/discours-agites#newsletter-signup",
    );
  });
});

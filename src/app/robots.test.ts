import { describe, expect, it } from "vitest";
import { buildRobots } from "./robots";

describe("buildRobots", () => {
  it("allows crawl and emits sitemap for prod host", () => {
    const r = buildRobots(new URL("https://alit.hihuydo.com"));
    expect(r.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/"],
    });
    expect(r.sitemap).toBe("https://alit.hihuydo.com/sitemap.xml");
  });

  it("disallows everything on staging subdomain", () => {
    const r = buildRobots(new URL("https://staging.alit.hihuydo.com"));
    expect(r.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(r.sitemap).toBeUndefined();
  });

  it("treats non-staging subdomains as prod", () => {
    const r = buildRobots(new URL("https://www.alit.hihuydo.com"));
    expect(Array.isArray(r.rules) ? r.rules[0]?.disallow : r.rules.disallow)
      .toEqual(["/api/", "/dashboard/"]);
  });
});

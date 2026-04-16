import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

// SITE_URL is runtime-configured per container (prod vs staging) — without
// force-dynamic, Next bakes the build-time default into the static output
// and the staging disallow-all branch never fires.
export const dynamic = "force-dynamic";

export function buildRobots(base: URL): MetadataRoute.Robots {
  if (base.hostname.startsWith("staging.")) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/"],
    },
    sitemap: new URL("/sitemap.xml", base).toString(),
  };
}

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getSiteUrl());
}

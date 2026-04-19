import type { ReactNode } from "react";
import type { Viewport } from "next";

export const metadata = { title: "alit Dashboard" };

// Opt out of static prerender for the entire dashboard segment. Without
// this, Next.js prerenders the page shell as static HTML with
// `cache-control: s-maxage=31536000` and `x-nextjs-cache: HIT` — any
// shared cache could serve the dashboard layout to anyone. proxy.ts
// still guards auth on every request, but the prerendered shell should
// not be cacheable at the edge. Applies to /dashboard/ and /dashboard/login/.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      {/*
        Body intentionally carries NO safe-area padding — see Codex PR #73
        R2 [P2]. Adding it here stacked on top of `min-h-screen` children
        (login, loading/error states) and made the total page taller than
        the viewport on notched devices, producing unwanted scroll and
        off-center content. Safe-area handling is now applied on the
        specific containers that need it (dashboard header, login outer
        div, and per-component sticky/fixed UI) so that `min-h-screen`
        still means exactly one viewport.
      */}
      <body className="bg-gray-50 text-gray-900" style={{ fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}

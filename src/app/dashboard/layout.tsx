import type { ReactNode } from "react";
import type { Viewport } from "next";

export const metadata = { title: "alit Dashboard" };

// Opt out of static prerender for the entire dashboard segment. Without
// this, Next.js prerenders the page shell as static HTML with
// `cache-control: s-maxage=31536000` and `x-nextjs-cache: HIT` — any
// shared cache could serve the dashboard layout to anyone. middleware.ts
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
      <body
        className="bg-gray-50 text-gray-900"
        style={{
          fontFamily: "system-ui, sans-serif",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {children}
      </body>
    </html>
  );
}

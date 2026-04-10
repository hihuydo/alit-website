import type { ReactNode } from "react";

export const metadata = { title: "alit Dashboard" };

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body className="bg-gray-50 text-gray-900" style={{ fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}

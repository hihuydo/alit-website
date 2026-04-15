import type { Metadata, Viewport } from "next";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: "Alit – Verein Literaturstiftung | Association pour une fondation littéraire",
  description: "Alit – Netzwerk für Literatur fördert die Produktion und Distribution von Literatur aus der Schweiz.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}

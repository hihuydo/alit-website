import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alit – Verein Literaturstiftung | Association pour une fondation littéraire",
  description: "Alit – Netzwerk für Literatur fördert die Produktion und Distribution von Literatur aus der Schweiz.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}

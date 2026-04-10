import { notFound } from "next/navigation";
import { projekte } from "@/content/projekte";

export function generateStaticParams() {
  return projekte.map((p) => ({ slug: p.slug }));
}

export default async function ProjektDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!projekte.find((p) => p.slug === slug)) notFound();
  return null;
}

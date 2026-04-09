import { notFound } from "next/navigation";
import { ProjekteList } from "@/components/ProjekteList";
import { projekte } from "@/content/projekte";

export function generateStaticParams() {
  return projekte.map((p) => ({ slug: p.slug }));
}

export default async function ProjektDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!projekte.find((p) => p.slug === slug)) notFound();
  return <ProjekteList locale={locale} expandedSlug={slug} />;
}

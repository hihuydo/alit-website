import { notFound } from "next/navigation";
import { ProjekteList } from "@/components/ProjekteList";
import { getProjekte } from "@/lib/queries";

export default async function ProjektDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const projekte = await getProjekte();
  if (!projekte.some((p) => p.slug === slug)) notFound();
  return <ProjekteList projekte={projekte} />;
}

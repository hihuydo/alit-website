import { notFound } from "next/navigation";
import pool from "@/lib/db";

export default async function ProjektDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { rowCount } = await pool.query("SELECT 1 FROM projekte WHERE slug = $1", [slug]);
  if (!rowCount) notFound();
  // The list is rendered by projekte/layout.tsx; this page only validates the slug.
  return null;
}

import { ProjekteList } from "@/components/ProjekteList";

export default async function ProjektePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ProjekteList locale={locale} />;
}

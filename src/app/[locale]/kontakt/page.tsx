import { redirect } from "next/navigation";

export default async function KontaktPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}#alit`);
}

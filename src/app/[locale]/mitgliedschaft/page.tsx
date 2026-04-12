import { redirect } from "next/navigation";

export default async function MitgliedschaftPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}#mitgliedschaft`);
}

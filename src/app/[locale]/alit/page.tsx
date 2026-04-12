import { redirect } from "next/navigation";

export default async function AlitPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}#alit`);
}

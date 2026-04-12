import { redirect } from "next/navigation";

export default async function MedienPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/alit`);
}

import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";

export default async function MedienPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.medien} dict={dict} />
      <div className="flex-1 overflow-y-auto hide-scrollbar text-black" style={{ fontSize: "var(--text-body)", lineHeight: "normal" }}>
        <div className="border-b-3 border-black" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
          <h2 className="font-normal m-0" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-title)", lineHeight: "normal" }}>Logo</h2>
        </div>
        <div className="border-b-3 border-black" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
          <p className="m-0 p-0">Laden Sie hier das Logo von Alit für Druck und Web herunter: <a href="/Alit-Logo-GZD-191030_Presse.zip" download className="text-black no-underline border-b-2 border-dotted border-black hover:!not-italic">Wortmarke herunterladen.</a></p>
        </div>
      </div>
    </>
  );
}

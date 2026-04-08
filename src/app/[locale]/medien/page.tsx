import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";

export default async function MedienPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.medien} dict={dict} />
      <div className="page-content hide-scrollbar">
        <div className="border-b-3 border-black" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
          <h2 className="heading-title">Logo</h2>
        </div>
        <div className="border-b-3 border-black" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
          <p>Laden Sie hier das Logo von Alit für Druck und Web herunter: <a href="/Alit-Logo-GZD-191030_Presse.zip" download className="link-dotted">Wortmarke herunterladen.</a></p>
        </div>
      </div>
    </>
  );
}

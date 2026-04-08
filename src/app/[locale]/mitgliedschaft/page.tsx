import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";

export default async function MitgliedschaftPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.mitgliedschaft} dict={dict} />
      <div className="page-content hide-scrollbar">
        {/* Heading */}
        <div className="border-b-3 border-black" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
          <h2 className="heading-title">Mitglied werden</h2>
        </div>

        {/* Intro */}
        <p style={{ padding: "var(--spacing-content-top) var(--spacing-base) var(--spacing-base)" }}>
          Herzlich willkommen bei <em>Alit – Netzwerk für Literatur</em>! Sie werden als neues Mitglied des Vereins registriert, sobald Sie den jährlichen Beitrag von CHF 50.– bezahlt haben.
        </p>

        {/* Form */}
        <form className="mitglied-form">
          <div className="form-row">
            <input type="text" placeholder="Vorname" className="form-input" />
            <input type="text" placeholder="Nachname" className="form-input" />
          </div>
          <div className="form-row">
            <input type="text" placeholder="Strasse" className="form-input form-street" />
            <input type="text" placeholder="Nr." className="form-input form-nr" />
          </div>
          <div className="form-row">
            <input type="text" placeholder="PLZ" className="form-input form-plz" />
            <input type="text" placeholder="Stadt" className="form-input" />
          </div>
          <div className="form-row">
            <input type="email" placeholder="E-Mail" className="form-input" />
          </div>

          <label className="checkbox-label">
            <input type="checkbox" />
            <span>Ich bestätige hiermit meine Anmeldung</span>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" />
            <span>Ich melde mich für den viermal jährlich erscheinenden Newsletter an.</span>
          </label>

          <button type="submit" className="form-submit">Anmelden</button>
        </form>
      </div>
    </>
  );
}

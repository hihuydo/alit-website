import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Navigation } from "@/components/Navigation";

export default async function MitgliedschaftPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <Navigation locale={locale} title={dict.nav.mitgliedschaft} dict={dict} />
      <div className="flex-1 overflow-y-auto hide-scrollbar text-black" style={{ fontSize: "var(--text-body)", lineHeight: "normal" }}>
        {/* Heading */}
        <div className="border-b-3 border-black" style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
          <h2 className="font-normal m-0" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-title)", lineHeight: "normal" }}>Mitglied werden</h2>
        </div>

        {/* Intro */}
        <p style={{ padding: "28px var(--spacing-base) var(--spacing-base)" }}>
          Herzlich willkommen bei <em>Alit – Netzwerk für Literatur</em>! Sie werden als neues Mitglied des Vereins registriert, sobald Sie den jährlichen Beitrag von CHF 50.– bezahlt haben.
        </p>

        {/* Form */}
        <form className="border-t-3 border-black" style={{ padding: "40px var(--spacing-base) var(--spacing-base)" }}>
          <div className="flex gap-[6px] mb-[6px]">
            <input type="text" placeholder="Vorname" className="flex-1 rounded-[4px] border-none outline-none" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-journal)", lineHeight: "26px", padding: "10px 12px", background: "var(--color-form-bg)", color: "#c05020" }} />
            <input type="text" placeholder="Nachname" className="flex-1 rounded-[4px] border-none outline-none" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-journal)", lineHeight: "26px", padding: "10px 12px", background: "var(--color-form-bg)", color: "#c05020" }} />
          </div>
          <div className="flex gap-[6px] mb-[6px]">
            <input type="text" placeholder="Strasse" className="flex-[1_1_0%] rounded-[4px] border-none outline-none" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-journal)", lineHeight: "26px", padding: "10px 12px", background: "var(--color-form-bg)", color: "#c05020" }} />
            <input type="text" placeholder="Nr." className="flex-[0_0_120px] rounded-[4px] border-none outline-none" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-journal)", lineHeight: "26px", padding: "10px 12px", background: "var(--color-form-bg)", color: "#c05020" }} />
          </div>
          <div className="flex gap-[6px] mb-[6px]">
            <input type="text" placeholder="PLZ" className="flex-[0_0_140px] rounded-[4px] border-none outline-none" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-journal)", lineHeight: "26px", padding: "10px 12px", background: "var(--color-form-bg)", color: "#c05020" }} />
            <input type="text" placeholder="Stadt" className="flex-1 rounded-[4px] border-none outline-none" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-journal)", lineHeight: "26px", padding: "10px 12px", background: "var(--color-form-bg)", color: "#c05020" }} />
          </div>
          <div className="flex gap-[6px] mb-[6px]">
            <input type="email" placeholder="E-Mail" className="flex-1 rounded-[4px] border-none outline-none" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-journal)", lineHeight: "26px", padding: "10px 12px", background: "var(--color-form-bg)", color: "#c05020" }} />
          </div>

          <label className="flex items-start gap-2 mb-[6px] cursor-pointer text-black p-0" style={{ fontSize: "var(--text-journal)", fontFamily: "var(--font-mono)", lineHeight: "26px" }}>
            <input type="checkbox" className="w-4 h-4 mt-[5px] shrink-0 accent-black" />
            <span>Ich bestätige hiermit meine Anmeldung</span>
          </label>
          <label className="flex items-start gap-2 mb-[6px] cursor-pointer text-black p-0" style={{ fontSize: "var(--text-journal)", fontFamily: "var(--font-mono)", lineHeight: "26px" }}>
            <input type="checkbox" className="w-4 h-4 mt-[5px] shrink-0 accent-black" />
            <span>Ich melde mich für den viermal jährlich erscheinenden Newsletter an.</span>
          </label>

          <button type="submit" className="block w-full mt-[var(--spacing-half)] rounded-[4px] border-none cursor-pointer text-center text-meta hover:bg-white hover:text-black" style={{ padding: "12px var(--spacing-base)", fontFamily: "var(--font-mono)", fontSize: "var(--text-body)", background: "var(--color-form-bg)" }}>
            Anmelden
          </button>
        </form>
      </div>
    </>
  );
}

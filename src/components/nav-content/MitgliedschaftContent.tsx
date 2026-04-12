"use client";

import { useRef, useState } from "react";

export function MitgliedschaftContent() {
  const formRef = useRef<HTMLFormElement>(null);
  const [showWarning, setShowWarning] = useState(false);

  const handleCheckboxChange = () => {
    setShowWarning(!formRef.current?.checkValidity());
  };

  return (
    <>
      <h2 className="heading-title">Mitglied werden</h2>

      <p style={{ paddingTop: "var(--spacing-content-top)" }}>
        Herzlich willkommen bei <em>Alit – Netzwerk für Literatur</em>! Sie werden als neues Mitglied des Vereins registriert, sobald Sie den jährlichen Beitrag von CHF 50.– bezahlt haben.
      </p>

      <form ref={formRef} className="mitglied-form">
        <div className="form-row">
          <input type="text" placeholder="Vorname" className="form-input" required />
          <input type="text" placeholder="Nachname" className="form-input" required />
        </div>
        <div className="form-row">
          <input type="text" placeholder="Strasse" className="form-input form-street" required />
          <input type="text" placeholder="Nr." className="form-input form-nr" required />
        </div>
        <div className="form-row">
          <input type="text" placeholder="PLZ" className="form-input form-plz" required />
          <input type="text" placeholder="Stadt" className="form-input" required />
        </div>
        <div className="form-row">
          <input type="email" placeholder="E-Mail" className="form-input" required />
        </div>

        {showWarning && (
          <p
            style={{
              color: "var(--color-verein)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-journal)",
              marginTop: "var(--spacing-half)",
              marginBottom: "var(--spacing-half)",
            }}
          >
            Bitte alle Felder ausfüllen.
          </p>
        )}

        <label className="checkbox-label">
          <input type="checkbox" onChange={handleCheckboxChange} />
          <span>Ich bestätige hiermit meine Anmeldung</span>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" onChange={handleCheckboxChange} />
          <span>Ich melde mich für den viermal jährlich erscheinenden Newsletter an.</span>
        </label>

        <button type="submit" className="form-submit">Anmelden</button>
      </form>
    </>
  );
}

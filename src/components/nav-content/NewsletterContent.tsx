"use client";

import { useRef, useState } from "react";

export function NewsletterContent() {
  const formRef = useRef<HTMLFormElement>(null);
  const [showWarning, setShowWarning] = useState(false);

  const handleCheckboxChange = () => {
    setShowWarning(!formRef.current?.checkValidity());
  };

  return (
    <>
      <h2 className="heading-title">Bleibe auf dem Laufenden</h2>

      <p style={{ paddingTop: "var(--spacing-content-top)" }}>
        In unserem Newsletter teilen wir in unregelmässigen Abständen Neuigkeiten aus und mit unserem Netzwerk für Literatur. In diesem Jahr wird der Newsletter zudem von der diskursiven Essay-Reihe «Discours Agités» bespielt.
      </p>

      <form ref={formRef} className="mitglied-form">
        <div className="form-row">
          <input type="text" placeholder="Vorname" className="form-input" required />
          <input type="text" placeholder="Nachname" className="form-input" required />
        </div>
        <div className="form-row">
          <input type="text" placeholder="Woher" className="form-input" required />
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
          <span>Ich bestätige, dass ich auf folgendem Kanal über E-Mail kontaktiert werden darf</span>
        </label>

        <p style={{ marginTop: "var(--spacing-half)", marginBottom: "var(--spacing-half)", fontSize: "var(--text-journal)", lineHeight: 1.4 }}>
          Du kannst dich jederzeit abmelden, indem du auf den Link in der Fußzeile unserer E-Mails klickst. Informationen zu unseren Datenschutzpraktiken findest du auf unserer Website.
        </p>

        <button type="submit" className="form-submit">Anmelden</button>
      </form>
    </>
  );
}

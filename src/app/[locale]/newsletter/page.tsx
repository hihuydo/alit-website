"use client";

import { useRef, useState } from "react";

export default function NewsletterPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [showWarning, setShowWarning] = useState(false);

  // Same validation pattern as Mitgliedschaft: clicking the agreement
  // checkbox shows a warning if any required input is still empty.
  const handleCheckboxClick = () => {
    setShowWarning(!formRef.current?.checkValidity());
  };

  return (
    <div className="page-content hide-scrollbar">
      {/* Heading */}
      <div style={{ padding: "var(--spacing-half) var(--spacing-base) var(--spacing-base)" }}>
        <h2 className="heading-title">Newsletter</h2>
      </div>

      {/* Intro */}
      <p style={{ padding: "var(--spacing-content-top) var(--spacing-base) var(--spacing-base)" }}>
        In unserem Newsletter teilen wir in unregelmässigen Abständen Neuigkeiten aus und mit unserem Netzwerk für Literatur. In diesem Jahr wird der Newsletter zudem von der diskursiven Essay-Reihe «Discours Agités» bespielt.
      </p>

      {/* Form */}
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
          <input type="checkbox" onClick={handleCheckboxClick} />
          <span>Ich bestätige, dass ich auf folgendem Kanal über E-Mail kontaktiert werden darf</span>
        </label>

        <p style={{ marginTop: "var(--spacing-half)", marginBottom: "var(--spacing-half)", fontSize: "var(--text-journal)", lineHeight: 1.4 }}>
          Du kannst dich jederzeit abmelden, indem du auf den Link in der Fußzeile unserer E-Mails klickst. Informationen zu unseren Datenschutzpraktiken findest du auf unserer Website.
        </p>

        <button type="submit" className="form-submit">Anmelden</button>
      </form>
    </div>
  );
}

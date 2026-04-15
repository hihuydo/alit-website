"use client";

import { useId, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";

type MitgliedschaftDict = Dictionary["mitgliedschaft"];
type Status =
  | "idle"
  | "submitting"
  | "success"
  | "error-rate"
  | "error-duplicate"
  | "error-generic";

const labelSr = "absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0";

export function MitgliedschaftContent({ dict }: { dict: MitgliedschaftDict }) {
  const ids = {
    vorname: useId(),
    nachname: useId(),
    strasse: useId(),
    nr: useId(),
    plz: useId(),
    stadt: useId(),
    email: useId(),
    consent: useId(),
    optIn: useId(),
  };
  const [status, setStatus] = useState<Status>("idle");
  const [showMissing, setShowMissing] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      setShowMissing(true);
      return;
    }
    setShowMissing(false);
    setStatus("submitting");

    const data = new FormData(form);
    const payload = {
      vorname: String(data.get("vorname") ?? ""),
      nachname: String(data.get("nachname") ?? ""),
      strasse: String(data.get("strasse") ?? ""),
      nr: String(data.get("nr") ?? ""),
      plz: String(data.get("plz") ?? ""),
      stadt: String(data.get("stadt") ?? ""),
      email: String(data.get("email") ?? ""),
      company: String(data.get("company") ?? ""),
      newsletter_opt_in: data.get("newsletter_opt_in") === "on",
      consent: data.get("consent") === "on",
    };

    try {
      const res = await fetch("/api/signup/mitgliedschaft/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus("success");
        return;
      }
      if (res.status === 409) setStatus("error-duplicate");
      else if (res.status === 429) setStatus("error-rate");
      else setStatus("error-generic");
    } catch {
      setStatus("error-generic");
    }
  };

  if (status === "success") {
    return (
      <div role="status" aria-live="polite">
        <h2 className="heading-title">{dict.successTitle}</h2>
        <p style={{ paddingTop: "var(--spacing-content-top)" }}>{dict.successBody}</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="heading-title">{dict.heading}</h2>
      <p style={{ paddingTop: "var(--spacing-content-top)" }}>{dict.intro}</p>

      <form className="mitglied-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label htmlFor={ids.vorname} className={labelSr}>{dict.vorname}</label>
          <input id={ids.vorname} name="vorname" type="text" placeholder={dict.vorname} className="form-input" required autoComplete="given-name" />
          <label htmlFor={ids.nachname} className={labelSr}>{dict.nachname}</label>
          <input id={ids.nachname} name="nachname" type="text" placeholder={dict.nachname} className="form-input" required autoComplete="family-name" />
        </div>
        <div className="form-row">
          <label htmlFor={ids.strasse} className={labelSr}>{dict.strasse}</label>
          <input id={ids.strasse} name="strasse" type="text" placeholder={dict.strasse} className="form-input form-street" required autoComplete="address-line1" />
          <label htmlFor={ids.nr} className={labelSr}>{dict.nr}</label>
          <input id={ids.nr} name="nr" type="text" placeholder={dict.nr} className="form-input form-nr" required />
        </div>
        <div className="form-row">
          <label htmlFor={ids.plz} className={labelSr}>{dict.plz}</label>
          <input id={ids.plz} name="plz" type="text" placeholder={dict.plz} className="form-input form-plz" required autoComplete="postal-code" />
          <label htmlFor={ids.stadt} className={labelSr}>{dict.stadt}</label>
          <input id={ids.stadt} name="stadt" type="text" placeholder={dict.stadt} className="form-input" required autoComplete="address-level2" />
        </div>
        <div className="form-row">
          <label htmlFor={ids.email} className={labelSr}>{dict.email}</label>
          <input id={ids.email} name="email" type="email" placeholder={dict.email} className="form-input" required autoComplete="email" />
        </div>

        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: "1px", height: "1px", overflow: "hidden" }}>
          <label>Company<input type="text" name="company" tabIndex={-1} autoComplete="off" /></label>
        </div>

        <div role="status" aria-live="polite" style={{ minHeight: "1em" }}>
          {showMissing && (
            <p
              style={{
                color: "var(--color-verein)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-journal)",
                marginTop: "var(--spacing-half)",
                marginBottom: "var(--spacing-half)",
              }}
            >
              {dict.missing}
            </p>
          )}
          {status === "error-duplicate" && <p style={{ color: "var(--color-verein)", marginTop: "var(--spacing-half)" }}>{dict.errorDuplicate}</p>}
          {status === "error-rate" && <p style={{ color: "var(--color-verein)", marginTop: "var(--spacing-half)" }}>{dict.errorRate}</p>}
          {status === "error-generic" && <p style={{ color: "var(--color-verein)", marginTop: "var(--spacing-half)" }}>{dict.errorGeneric}</p>}
        </div>

        <label htmlFor={ids.consent} className="checkbox-label">
          <input id={ids.consent} type="checkbox" name="consent" required />
          <span>{dict.consent}</span>
        </label>
        <label htmlFor={ids.optIn} className="checkbox-label">
          <input id={ids.optIn} type="checkbox" name="newsletter_opt_in" />
          <span>{dict.newsletterOptIn}</span>
        </label>

        <button type="submit" className="form-submit" disabled={status === "submitting"}>
          {status === "submitting" ? dict.submitting : dict.submit}
        </button>
      </form>
    </>
  );
}

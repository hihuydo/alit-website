"use client";

import { useId, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";

type NewsletterDict = Dictionary["newsletter"];
type Status = "idle" | "submitting" | "success" | "error-rate" | "error-generic";

const labelSr = "absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0";

export function NewsletterContent({ dict }: { dict: NewsletterDict }) {
  const ids = {
    vorname: useId(),
    nachname: useId(),
    woher: useId(),
    email: useId(),
    consent: useId(),
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
      woher: String(data.get("woher") ?? ""),
      email: String(data.get("email") ?? ""),
      company: String(data.get("company") ?? ""),
      consent: data.get("consent") === "on",
    };

    try {
      const res = await fetch("/api/signup/newsletter/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus("success");
        return;
      }
      if (res.status === 429) setStatus("error-rate");
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

      <form className="mitglied-form" onSubmit={handleSubmit} noValidate={false}>
        <div className="form-row">
          <label htmlFor={ids.vorname} className={labelSr}>{dict.vorname}</label>
          <input id={ids.vorname} name="vorname" type="text" placeholder={dict.vorname} className="form-input" required autoComplete="given-name" />
          <label htmlFor={ids.nachname} className={labelSr}>{dict.nachname}</label>
          <input id={ids.nachname} name="nachname" type="text" placeholder={dict.nachname} className="form-input" required autoComplete="family-name" />
        </div>
        <div className="form-row">
          <label htmlFor={ids.woher} className={labelSr}>{dict.woher}</label>
          <input id={ids.woher} name="woher" type="text" placeholder={dict.woher} className="form-input" required />
        </div>
        <div className="form-row">
          <label htmlFor={ids.email} className={labelSr}>{dict.email}</label>
          <input id={ids.email} name="email" type="email" placeholder={dict.email} className="form-input" required autoComplete="email" />
        </div>

        {/* Honeypot — must stay visually hidden but not display:none (bots skip those). */}
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
          {status === "error-rate" && <p style={{ color: "var(--color-verein)", marginTop: "var(--spacing-half)" }}>{dict.errorRate}</p>}
          {status === "error-generic" && <p style={{ color: "var(--color-verein)", marginTop: "var(--spacing-half)" }}>{dict.errorGeneric}</p>}
        </div>

        <label htmlFor={ids.consent} className="checkbox-label">
          <input id={ids.consent} type="checkbox" name="consent" required />
          <span>{dict.consent}</span>
        </label>

        <p style={{ marginTop: "var(--spacing-half)", marginBottom: "var(--spacing-half)", fontSize: "var(--text-journal)", lineHeight: 1.4 }}>
          {dict.privacy}
        </p>

        <button type="submit" className="form-submit" disabled={status === "submitting"}>
          {status === "submitting" ? dict.submitting : dict.submit}
        </button>
      </form>
    </>
  );
}

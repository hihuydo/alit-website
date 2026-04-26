// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NewsletterSignupForm } from "./NewsletterSignupForm";
import type { Dictionary } from "@/i18n/dictionaries";

afterEach(() => cleanup());

const dict = {
  heading: "Bleibe auf dem Laufenden",
  intro: "Intro text",
  vorname: "Vorname",
  nachname: "Nachname",
  woher: "Woher",
  email: "E-Mail",
  consent: "Ich bestätige…",
  privacy: "Datenschutz-Text",
  submit: "Anmelden",
  submitting: "Wird gesendet…",
  missing: "Bitte alle Felder ausfüllen.",
  successTitle: "Danke!",
  successBody: "Du erhältst unseren Newsletter ab sofort.",
  errorGeneric: "Etwas ist schiefgelaufen.",
  errorRate: "Zu viele Versuche.",
} as unknown as Dictionary["newsletter"];

describe("NewsletterSignupForm", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true } as Response)),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders 4 required inputs + consent checkbox + submit button", () => {
    render(<NewsletterSignupForm dict={dict} />);
    expect(screen.getByPlaceholderText("Vorname")).not.toBeNull();
    expect(screen.getByPlaceholderText("Nachname")).not.toBeNull();
    expect(screen.getByPlaceholderText("Woher")).not.toBeNull();
    expect(screen.getByPlaceholderText("E-Mail")).not.toBeNull();
    expect(screen.getByRole("checkbox")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Anmelden" })).not.toBeNull();
  });

  it("submits to /api/signup/newsletter/ with form payload including honeypot field", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const { container } = render(<NewsletterSignupForm dict={dict} />);
    fireEvent.change(screen.getByPlaceholderText("Vorname"), { target: { value: "Max" } });
    fireEvent.change(screen.getByPlaceholderText("Nachname"), { target: { value: "Muster" } });
    fireEvent.change(screen.getByPlaceholderText("Woher"), { target: { value: "ZH" } });
    fireEvent.change(screen.getByPlaceholderText("E-Mail"), { target: { value: "max@example.com" } });
    fireEvent.click(screen.getByRole("checkbox"));
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/signup/newsletter/");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.email).toBe("max@example.com");
    expect(body.consent).toBe(true);
    // Honeypot is always sent (empty) so the API's honeypot check runs uniformly.
    expect(body.alit_hp_field).toBe("");
  });

  it("renders success copy after successful submit", async () => {
    const { container } = render(<NewsletterSignupForm dict={dict} />);
    fireEvent.change(screen.getByPlaceholderText("Vorname"), { target: { value: "Max" } });
    fireEvent.change(screen.getByPlaceholderText("Nachname"), { target: { value: "Muster" } });
    fireEvent.change(screen.getByPlaceholderText("Woher"), { target: { value: "ZH" } });
    fireEvent.change(screen.getByPlaceholderText("E-Mail"), { target: { value: "max@example.com" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => {
      expect(screen.getByText("Danke!")).not.toBeNull();
      expect(screen.getByText("Du erhältst unseren Newsletter ab sofort.")).not.toBeNull();
    });
  });
});

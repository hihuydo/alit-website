// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AgendaSupporters } from "./AgendaSupporters";
import type { SupporterLogo } from "@/lib/supporter-logos";

afterEach(() => cleanup());

function logo(over: Partial<SupporterLogo> = {}): SupporterLogo {
  return {
    public_id: "11111111-1111-1111-1111-111111111111",
    alt: null,
    width: 200,
    height: 80,
    ...over,
  };
}

describe("AgendaSupporters", () => {
  it("renders nothing when logos array is empty (no Section, no label)", () => {
    const { container } = render(
      <AgendaSupporters logos={[]} label="Mit freundlicher Unterstützung von" />,
    );
    expect(container.firstChild).toBeNull();
    expect(document.querySelector("[data-testid='agenda-supporters']")).toBeNull();
  });

  it("renders a section with label + 1 image when given a single logo", () => {
    render(
      <AgendaSupporters
        logos={[logo({ public_id: "abc" })]}
        label="Mit freundlicher Unterstützung von"
      />,
    );
    const section = document.querySelector("[data-testid='agenda-supporters']");
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain("Mit freundlicher Unterstützung von");
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("src")).toBe("/api/media/abc/");
  });

  it("renders all logos when given multiple", () => {
    render(
      <AgendaSupporters
        logos={[
          logo({ public_id: "a" }),
          logo({ public_id: "b" }),
          logo({ public_id: "c" }),
        ]}
        label="Mit freundlicher Unterstützung von"
      />,
    );
    expect(document.querySelectorAll("img").length).toBe(3);
  });

  it("passes alt text through (a11y)", () => {
    render(
      <AgendaSupporters
        logos={[logo({ public_id: "a", alt: "Pro Helvetia" })]}
        label="Mit freundlicher Unterstützung von"
      />,
    );
    expect(document.querySelector("img")!.getAttribute("alt")).toBe("Pro Helvetia");
  });

  it("renders alt='' (decorative) when alt is null", () => {
    render(
      <AgendaSupporters
        logos={[logo({ public_id: "a", alt: null })]}
        label="Mit freundlicher Unterstützung von"
      />,
    );
    expect(document.querySelector("img")!.getAttribute("alt")).toBe("");
  });

  it("uses fluid clamp() height in source (JSDOM-CSSOM strips clamp)", () => {
    // JSDOM's CSSOM silently drops unrecognized values like `clamp(...)`,
    // so the style attribute is unreliable here. Assert against the
    // component source instead — file-content-regex pattern from
    // `patterns/testing.md`.
    const source = readFileSync(
      join(__dirname, "AgendaSupporters.tsx"),
      "utf8",
    );
    expect(source).toMatch(/clamp\(20px,\s*2\.2vw,\s*28px\)/);
  });

  it("uses flex-wrap so logos can flow to multiple rows", () => {
    render(
      <AgendaSupporters
        logos={[logo({ public_id: "a" })]}
        label="X"
      />,
    );
    const ul = document.querySelector("ul")!;
    expect(ul.className).toContain("flex-wrap");
  });

  it("renders FR label when passed FR string", () => {
    render(
      <AgendaSupporters
        logos={[logo({ public_id: "a" })]}
        label="Avec le soutien aimable de"
      />,
    );
    expect(document.body.textContent).toContain("Avec le soutien aimable de");
  });
});

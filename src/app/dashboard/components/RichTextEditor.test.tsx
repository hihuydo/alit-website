// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RichTextEditor } from "./RichTextEditor";

afterEach(() => cleanup());

const EXPECTED_ARIA_LABELS = [
  "Fett",
  "Kursiv",
  "Überschrift 2",
  "Überschrift 3",
  "Zitat",
  "Link",
  "Link entfernen",
  "Bild/Video einfügen",
  "Bildunterschrift",
] as const;

function renderEditor(props?: { onOpenMediaPicker?: () => void }) {
  const onChange = vi.fn();
  return {
    onChange,
    ...render(
      <RichTextEditor
        value="<p>hello</p>"
        onChange={onChange}
        onOpenMediaPicker={props?.onOpenMediaPicker ?? (() => {})}
      />,
    ),
  };
}

describe("RichTextEditor — Toolbar A11y (Sprint B2c)", () => {
  it("T1: renders all 9 toolbar buttons with exact German aria-labels", () => {
    renderEditor();
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
      .filter((l): l is string => typeof l === "string");
    for (const expected of EXPECTED_ARIA_LABELS) {
      expect(labels).toContain(expected);
    }
    expect(labels.filter((l) => EXPECTED_ARIA_LABELS.includes(l as (typeof EXPECTED_ARIA_LABELS)[number])).length).toBe(
      EXPECTED_ARIA_LABELS.length,
    );
  });

  it("T1b: preserves title attribute on all toolbar buttons (Desktop-tooltip)", () => {
    renderEditor();
    const boldBtn = screen.getByRole("button", { name: "Fett" });
    expect(boldBtn.getAttribute("title")).toBe("Fett (Cmd+B)");
    const linkBtn = screen.getByRole("button", { name: "Link" });
    expect(linkBtn.getAttribute("title")).toBe("Link (Cmd+K)");
    const medienBtn = screen.getByRole("button", { name: "Bild/Video einfügen" });
    expect(medienBtn.getAttribute("title")).toBe("Bild/Video einfügen");
  });

  it("T1c: conditionally omits Medien + BU buttons when onOpenMediaPicker is undefined", () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
      .filter((l): l is string => typeof l === "string");
    expect(labels).not.toContain("Bild/Video einfügen");
    expect(labels).not.toContain("Bildunterschrift");
    expect(labels).toContain("Fett");
  });
});

describe("RichTextEditor — Toolbar Touch + Scroll classes (Sprint B2c)", () => {
  it("T2: toolbar wrapper has horizontal-scroll + hidden-scrollbar + md:flex-wrap tokens", () => {
    const { container } = renderEditor();
    // Find the toolbar wrapper by its known static combination.
    const toolbar = container.querySelector("div.border-b.bg-gray-50");
    expect(toolbar).toBeTruthy();
    const cls = toolbar!.className;
    expect(cls).toMatch(/\boverflow-x-auto\b/);
    expect(cls).toMatch(/\bmd:flex-wrap\b/);
    expect(cls).toMatch(/\bmd:overflow-visible\b/);
    expect(cls).toContain("[scrollbar-width:none]");
    expect(cls).toContain("[&::-webkit-scrollbar]:hidden");
  });

  it("T3: toolbar buttons have shrink-0 + min-h-11 + md:min-h-0 touch-target tokens", () => {
    renderEditor();
    const boldBtn = screen.getByRole("button", { name: "Fett" });
    expect(boldBtn.className).toMatch(/\bshrink-0\b/);
    expect(boldBtn.className).toMatch(/\bmin-h-11\b/);
    expect(boldBtn.className).toMatch(/\bmd:min-h-0\b/);
    // Check at least one other button too to avoid false positive from cached btn const.
    const linkBtn = screen.getByRole("button", { name: "Link" });
    expect(linkBtn.className).toMatch(/\bmin-h-11\b/);
    expect(linkBtn.className).toMatch(/\bmd:min-h-0\b/);
  });

  it("T3b: toolbar separators have shrink-0 (so they survive horizontal-scroll)", () => {
    const { container } = renderEditor();
    const separators = container.querySelectorAll("div.w-px.bg-gray-300");
    expect(separators.length).toBe(3);
    separators.forEach((sep) => {
      expect((sep as HTMLElement).className).toMatch(/\bshrink-0\b/);
    });
  });
});

describe("RichTextEditor — SVG icons (Sprint B2c follow-up)", () => {
  it("T5: each of the 9 toolbar buttons contains exactly one <svg> child (text glyphs replaced)", () => {
    renderEditor();
    for (const label of EXPECTED_ARIA_LABELS) {
      const btn = screen.getByRole("button", { name: label });
      const svgs = btn.querySelectorAll("svg");
      expect(svgs.length, `button "${label}" should have 1 svg`).toBe(1);
    }
  });

  it("T5b: SVGs have aria-hidden (button's aria-label is the accessible name)", () => {
    renderEditor();
    const boldBtn = screen.getByRole("button", { name: "Fett" });
    const svg = boldBtn.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    // Decorative inline SVGs inherit color from currentColor.
    expect(svg.getAttribute("stroke")).toBe("currentColor");
  });
});

describe("RichTextEditor — Behavior-Parity (Sprint B2c)", () => {
  it("T4: Link-button click opens the link input overlay (handler fires, URL-input appears)", () => {
    const { container } = renderEditor();
    // Link overlay is not present initially.
    expect(container.querySelector("input[type='url']")).toBeNull();
    // openLinkInput guards on selection being inside the editor, so set up a range
    // before simulating the click. JSDOM default selection isn't in the editor.
    const editor = container.querySelector("[contenteditable='true']") as HTMLElement | null;
    expect(editor).toBeTruthy();
    const range = document.createRange();
    range.selectNodeContents(editor!);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    // Click the Link button (uses onMouseDown, not onClick).
    const linkBtn = screen.getByRole("button", { name: "Link" });
    fireEvent.mouseDown(linkBtn);
    // Overlay input appears.
    const urlInput = container.querySelector("input[type='url']") as HTMLInputElement | null;
    expect(urlInput).toBeTruthy();
    expect(urlInput!.placeholder).toBe("https://...");
  });

  it("T4b: Medien-button click invokes onOpenMediaPicker callback (behavior-parity)", () => {
    const onOpen = vi.fn();
    renderEditor({ onOpenMediaPicker: onOpen });
    const medienBtn = screen.getByRole("button", { name: "Bild/Video einfügen" });
    fireEvent.mouseDown(medienBtn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("RichTextEditor — Scroll-fade indicators for mobile toolbar", () => {
  // Helpers to simulate toolbar scroll geometry. JSDOM doesn't compute layout,
  // so we redefine the properties on the ref element before/after triggering
  // `scroll` events.
  function mockGeometry(
    el: HTMLElement,
    { scrollLeft, clientWidth, scrollWidth }: {
      scrollLeft: number; clientWidth: number; scrollWidth: number;
    },
  ) {
    Object.defineProperty(el, "scrollLeft", { value: scrollLeft, configurable: true });
    Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
    Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  }

  it("T6: fade overlays render with md:hidden + pointer-events-none + bg-gradient classes", () => {
    const { container } = renderEditor();
    const leftFade = container.querySelector(
      ".absolute.left-0.bg-gradient-to-r.from-gray-50",
    );
    const rightFade = container.querySelector(
      ".absolute.right-0.bg-gradient-to-l.from-gray-50",
    );
    expect(leftFade).toBeTruthy();
    expect(rightFade).toBeTruthy();
    expect(leftFade!.className).toMatch(/\bmd:hidden\b/);
    expect(rightFade!.className).toMatch(/\bmd:hidden\b/);
    expect(leftFade!.className).toMatch(/\bpointer-events-none\b/);
    expect(rightFade!.className).toMatch(/\bpointer-events-none\b/);
    expect(leftFade!.getAttribute("aria-hidden")).toBeTruthy();
    expect(rightFade!.getAttribute("aria-hidden")).toBeTruthy();
  });

  it("T6b: initial mount with overflow hidden — only RIGHT fade is visible (scrollLeft=0, more content right)", async () => {
    const { container } = renderEditor();
    // Toolbar is the parent of all buttons — the element `ref={toolbarRef}` points at.
    const toolbar = container.querySelector(
      "div.flex.gap-0\\.5.overflow-x-auto",
    ) as HTMLElement;
    expect(toolbar).toBeTruthy();
    mockGeometry(toolbar, { scrollLeft: 0, clientWidth: 320, scrollWidth: 600 });
    // Force re-render of the scroll effect via a scroll event.
    fireEvent.scroll(toolbar);
    // Wait a tick for setState to flush.
    await Promise.resolve();
    const leftFade = container.querySelector(".absolute.left-0.bg-gradient-to-r")!;
    const rightFade = container.querySelector(".absolute.right-0.bg-gradient-to-l")!;
    expect(leftFade.className).toMatch(/\bopacity-0\b/);
    expect(rightFade.className).toMatch(/\bopacity-100\b/);
  });

  it("T6c: scrolled to middle — BOTH fades visible (more content on each side)", async () => {
    const { container } = renderEditor();
    const toolbar = container.querySelector(
      "div.flex.gap-0\\.5.overflow-x-auto",
    ) as HTMLElement;
    mockGeometry(toolbar, { scrollLeft: 100, clientWidth: 320, scrollWidth: 600 });
    fireEvent.scroll(toolbar);
    await Promise.resolve();
    const leftFade = container.querySelector(".absolute.left-0.bg-gradient-to-r")!;
    const rightFade = container.querySelector(".absolute.right-0.bg-gradient-to-l")!;
    expect(leftFade.className).toMatch(/\bopacity-100\b/);
    expect(rightFade.className).toMatch(/\bopacity-100\b/);
  });

  it("T6d: scrolled to end — only LEFT fade visible (no more content right)", async () => {
    const { container } = renderEditor();
    const toolbar = container.querySelector(
      "div.flex.gap-0\\.5.overflow-x-auto",
    ) as HTMLElement;
    // scrollLeft + clientWidth === scrollWidth → scrolled to end
    mockGeometry(toolbar, { scrollLeft: 280, clientWidth: 320, scrollWidth: 600 });
    fireEvent.scroll(toolbar);
    await Promise.resolve();
    const leftFade = container.querySelector(".absolute.left-0.bg-gradient-to-r")!;
    const rightFade = container.querySelector(".absolute.right-0.bg-gradient-to-l")!;
    expect(leftFade.className).toMatch(/\bopacity-100\b/);
    expect(rightFade.className).toMatch(/\bopacity-0\b/);
  });

  it("T6e: toolbar fits viewport (no overflow) — BOTH fades hidden", async () => {
    const { container } = renderEditor();
    const toolbar = container.querySelector(
      "div.flex.gap-0\\.5.overflow-x-auto",
    ) as HTMLElement;
    // scrollWidth == clientWidth → no overflow
    mockGeometry(toolbar, { scrollLeft: 0, clientWidth: 800, scrollWidth: 800 });
    fireEvent.scroll(toolbar);
    await Promise.resolve();
    const leftFade = container.querySelector(".absolute.left-0.bg-gradient-to-r")!;
    const rightFade = container.querySelector(".absolute.right-0.bg-gradient-to-l")!;
    expect(leftFade.className).toMatch(/\bopacity-0\b/);
    expect(rightFade.className).toMatch(/\bopacity-0\b/);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// JSDOM lacks IntersectionObserver and Element.prototype.scrollIntoView —
// stub both before importing the component so module-level code (and the
// useEffect-mount that follows) doesn't throw. Class-based mock weil
// `new IntersectionObserver()` ein Constructor-Call ist; vi.fn() ist nicht
// als Constructor callable.
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
Element.prototype.scrollIntoView = vi.fn();

// Deterministic reduced-motion behavior for the dot-click test (smooth path).
vi.mock("@/lib/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

import { AgendaImageSlider } from "./AgendaImageSlider";

const images = [
  { public_id: "p1", orientation: "landscape" as const, width: 1200, height: 800, alt: "First" },
  { public_id: "p2", orientation: "portrait" as const, width: 800, height: 1200, alt: "Second" },
  { public_id: "p3", orientation: "landscape" as const, width: 1200, height: 800, alt: null },
];

const dotLabel = "Bild {i} von {n} anzeigen";

afterEach(() => cleanup());

describe("AgendaImageSlider", () => {
  it("renders one <img> per image with explicit width/height + alt fallback", () => {
    const { container } = render(
      <AgendaImageSlider images={images} navLabel="Bilder-Navigation" dotLabel={dotLabel} />,
    );
    // <img alt=""> hat ARIA role=presentation, nicht img — querySelector statt getByRole.
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(3);
    expect(imgs[0].getAttribute("alt")).toBe("First");
    expect(imgs[2].getAttribute("alt")).toBe(""); // null alt → empty string
    expect(imgs[0].getAttribute("loading")).toBe("lazy");
    // CLS-fallback for non-null dimensions: explicit attributes from props.
    expect(imgs[0].getAttribute("width")).toBe("1200");
    expect(imgs[0].getAttribute("height")).toBe("800");
  });

  it("renders N dot buttons inside <nav> with locale-aware labels", () => {
    render(<AgendaImageSlider images={images} navLabel="Bilder-Navigation" dotLabel={dotLabel} />);
    const nav = screen.getByRole("navigation", { name: "Bilder-Navigation" });
    const dots = nav.querySelectorAll("button");
    expect(dots).toHaveLength(3);
    expect(dots[0].getAttribute("aria-label")).toBe("Bild 1 von 3 anzeigen");
    expect(dots[1].getAttribute("aria-label")).toBe("Bild 2 von 3 anzeigen");
    // Active-Dot initial = 0 → aria-current="true"; others undefined.
    expect(dots[0].getAttribute("aria-current")).toBe("true");
    expect(dots[1].getAttribute("aria-current")).toBeNull();
  });

  it("clicking a dot triggers scrollIntoView on the corresponding slide", () => {
    render(<AgendaImageSlider images={images} navLabel="Nav" dotLabel={dotLabel} />);
    const scrollMock = vi.mocked(Element.prototype.scrollIntoView);
    scrollMock.mockClear();
    const dots = screen.getAllByRole("button");
    fireEvent.click(dots[2]);
    expect(scrollMock).toHaveBeenCalledTimes(1);
    expect(scrollMock).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      }),
    );
  });

  it("uses 'auto' scroll behavior when prefers-reduced-motion is on", async () => {
    vi.resetModules();
    vi.doMock("@/lib/use-reduced-motion", () => ({
      useReducedMotion: () => true,
    }));
    const { AgendaImageSlider: SliderRM } = await import("./AgendaImageSlider");
    render(<SliderRM images={images} navLabel="Nav" dotLabel={dotLabel} />);
    const scrollMock = vi.mocked(Element.prototype.scrollIntoView);
    scrollMock.mockClear();
    const dots = screen.getAllByRole("button");
    fireEvent.click(dots[1]);
    expect(scrollMock).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto" }),
    );
  });
});

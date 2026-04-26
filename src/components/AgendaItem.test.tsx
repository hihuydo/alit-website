// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "de" }),
}));

// Mock the slider so branching tests stay isolated from its internals
// (IntersectionObserver / scrollIntoView setup is covered separately).
vi.mock("./AgendaImageSlider", () => ({
  AgendaImageSlider: vi.fn(() => <div data-testid="slider-mock" />),
}));

import { AgendaItem, type AgendaItemData } from "./AgendaItem";

const baseItem: AgendaItemData = {
  datum: "15.03.2025",
  zeit: "15:00 Uhr",
  ort: "Zürich",
  ortUrl: null,
  titel: "Titel",
  lead: null,
  beschrieb: [],
  hashtags: [],
  images: [],
};

const landscape = (id: string) => ({
  public_id: id,
  orientation: "landscape" as const,
  width: 1200,
  height: 800,
  alt: null,
});

afterEach(() => cleanup());

describe("AgendaItem — image rendering branch", () => {
  it("renders <AgendaImageSlider> when images.length >= 2 && imagesAsSlider === true", () => {
    const item: AgendaItemData = {
      ...baseItem,
      images: [landscape("p1"), landscape("p2"), landscape("p3")],
      imagesAsSlider: true,
    };
    render(<AgendaItem item={item} defaultExpanded />);
    expect(screen.getByTestId("slider-mock")).toBeTruthy();
    // Grid path's <img> tags must NOT be rendered.
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("renders Grid (not Slider) when only 1 image, even with imagesAsSlider=true (single-image fallback)", () => {
    const item: AgendaItemData = {
      ...baseItem,
      images: [landscape("p1")],
      imagesAsSlider: true,
    };
    const { container } = render(<AgendaItem item={item} defaultExpanded />);
    expect(screen.queryByTestId("slider-mock")).toBeNull();
    // <img alt=""> hat ARIA role=presentation; querySelector statt getByRole.
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("renders Grid when imagesAsSlider is false (default behavior)", () => {
    const item: AgendaItemData = {
      ...baseItem,
      images: [landscape("p1"), landscape("p2"), landscape("p3")],
      imagesAsSlider: false,
    };
    const { container } = render(<AgendaItem item={item} defaultExpanded />);
    expect(screen.queryByTestId("slider-mock")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(3);
  });

  it("renders Grid when imagesAsSlider is undefined (legacy seed fixtures)", () => {
    const item: AgendaItemData = {
      ...baseItem,
      images: [landscape("p1"), landscape("p2")],
      // imagesAsSlider intentionally omitted — optional field.
    };
    const { container } = render(<AgendaItem item={item} defaultExpanded />);
    expect(screen.queryByTestId("slider-mock")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });
});

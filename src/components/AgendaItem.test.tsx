// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AgendaItem, type AgendaItemData, type AgendaImage } from "./AgendaItem";

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "de" }),
}));

afterEach(() => cleanup());

function makeItem(overrides: Partial<AgendaItemData> = {}): AgendaItemData {
  return {
    datum: "01.06.2026",
    zeit: "19:00",
    ort: "Bern",
    ortUrl: null,
    titel: "Test-Eintrag",
    beschrieb: [],
    ...overrides,
  };
}

function landscape(over: Partial<AgendaImage> = {}): AgendaImage {
  return { public_id: "img-l", orientation: "landscape", width: 1600, height: 900, alt: null, ...over };
}
function portrait(over: Partial<AgendaImage> = {}): AgendaImage {
  return { public_id: "img-p", orientation: "portrait", width: 800, height: 1200, alt: null, ...over };
}

describe("AgendaItem renderer — 12 image branches", () => {
  // Branch 1: 0 images → kein Bild-Block.
  it("renders no image block when images is empty", () => {
    render(<AgendaItem item={makeItem({ images: [] })} defaultExpanded />);
    expect(document.querySelectorAll("img").length).toBe(0);
  });

  // Branch 2: cols=1 + 1 landscape + cover (mit width/height).
  it("renders single-image landscape with object-fit:cover and full width", () => {
    render(
      <AgendaItem
        item={makeItem({ images: [landscape()], imagesGridColumns: 1, imagesFit: "cover" })}
        defaultExpanded
      />,
    );
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.style.objectFit).toBe("cover");
    // Container is full-width (no w-1/2 class).
    const container = img!.parentElement!;
    expect(container.className).toContain("w-full");
    expect(container.className).not.toContain("w-1/2");
    expect(container.style.aspectRatio).toBe("1600 / 900");
  });

  // Branch 3: cols=1 + 1 landscape + contain.
  it("renders single-image landscape with object-fit:contain", () => {
    render(
      <AgendaItem
        item={makeItem({ images: [landscape()], imagesGridColumns: 1, imagesFit: "contain" })}
        defaultExpanded
      />,
    );
    const img = document.querySelector("img");
    expect(img!.style.objectFit).toBe("contain");
  });

  // Branch 4: cols=1 + 1 portrait + cover (50% mx-auto).
  it("renders single-image portrait at 50% width centered with cover", () => {
    render(
      <AgendaItem
        item={makeItem({ images: [portrait()], imagesGridColumns: 1, imagesFit: "cover" })}
        defaultExpanded
      />,
    );
    const img = document.querySelector("img");
    const container = img!.parentElement!;
    expect(container.className).toContain("w-1/2");
    expect(container.className).toContain("mx-auto");
    expect(container.style.aspectRatio).toBe("800 / 1200");
    expect(img!.style.objectFit).toBe("cover");
  });

  // Branch 5: cols=1 + 1 portrait + contain.
  it("renders single-image portrait with contain", () => {
    render(
      <AgendaItem
        item={makeItem({ images: [portrait()], imagesGridColumns: 1, imagesFit: "contain" })}
        defaultExpanded
      />,
    );
    expect(document.querySelector("img")!.style.objectFit).toBe("contain");
  });

  // Branch 6: cols=1 + 1 landscape ohne width/height → Fallback 4:3.
  it("falls back to 4:3 aspect-ratio for landscape image without width/height", () => {
    const img: AgendaImage = { public_id: "x", orientation: "landscape", width: null, height: null, alt: null };
    render(
      <AgendaItem item={makeItem({ images: [img], imagesGridColumns: 1, imagesFit: "cover" })} defaultExpanded />,
    );
    const container = document.querySelector("img")!.parentElement!;
    expect(container.style.aspectRatio).toBe("4 / 3");
  });

  // Branch 7: cols=1 + 1 portrait ohne width/height → Fallback 3:4.
  it("falls back to 3:4 aspect-ratio for portrait image without width/height", () => {
    const img: AgendaImage = { public_id: "x", orientation: "portrait", width: null, height: null, alt: null };
    render(
      <AgendaItem item={makeItem({ images: [img], imagesGridColumns: 1, imagesFit: "cover" })} defaultExpanded />,
    );
    const container = document.querySelector("img")!.parentElement!;
    expect(container.style.aspectRatio).toBe("3 / 4");
  });

  // Branch 8: cols=2 + 2 images → 2-Spalten-Grid mit aspect-[2/3] cells.
  it("renders multi-image grid with cols=2 and 2 images", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ public_id: "a" }), portrait({ public_id: "b" })],
          imagesGridColumns: 2,
          imagesFit: "cover",
        })}
        defaultExpanded
      />,
    );
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(2);
    const grid = imgs[0].parentElement!.parentElement!; // cell → grid
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
    // cells have aspect-[2/3]
    expect(imgs[0].parentElement!.className).toContain("aspect-[2/3]");
  });

  // Branch 9: cols=4 + 2 images → cap auf min(4,2)=2 Spalten.
  it("caps effectiveCols to images.length when cols > images.length", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ public_id: "a" }), landscape({ public_id: "b" })],
          imagesGridColumns: 4,
          imagesFit: "cover",
        })}
        defaultExpanded
      />,
    );
    const grid = document.querySelectorAll("img")[0].parentElement!.parentElement!;
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
  });

  // Branch 10: cols=1 + length>=2 → defensive Multi-Image-Grid mit min(2,length) Spalten.
  it("falls into defensive multi-image grid when cols=1 but length>=2", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ public_id: "a" }), landscape({ public_id: "b" }), landscape({ public_id: "c" })],
          imagesGridColumns: 1,
          imagesFit: "cover",
        })}
        defaultExpanded
      />,
    );
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(3);
    const grid = imgs[0].parentElement!.parentElement!;
    // min(2, 3) = 2 spalten
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
  });

  // Branch 11: cover-vs-contain im Multi-Image-Grid bewirkt object-fit am img.
  it("applies object-fit:contain to all imgs in multi-image grid when fit=contain", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ public_id: "a" }), landscape({ public_id: "b" })],
          imagesGridColumns: 2,
          imagesFit: "contain",
        })}
        defaultExpanded
      />,
    );
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(2);
    imgs.forEach((img) => expect((img as HTMLImageElement).style.objectFit).toBe("contain"));
  });

  // Branch 12: imagesGridColumns: undefined + 1 image → defensive `?? 1` →
  // single-image-Branch fires, kein silent blank für Legacy-seeds.
  it("renders single-image branch when imagesGridColumns is undefined and images.length=1", () => {
    render(
      <AgendaItem
        item={makeItem({ images: [landscape()] /* imagesGridColumns: undefined */ })}
        defaultExpanded
      />,
    );
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    // Single-image-branch container has aspect-ratio inline style.
    expect(img!.parentElement!.style.aspectRatio).toBe("1600 / 900");
  });
});

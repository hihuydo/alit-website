// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
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

describe("AgendaItem renderer — image branches (cover-only after letterbox removal)", () => {
  // Branch: 0 images → kein Bild-Block.
  it("renders no image block when images is empty", () => {
    render(<AgendaItem item={makeItem({ images: [] })} defaultExpanded />);
    expect(document.querySelectorAll("img").length).toBe(0);
  });

  // Branch: cols=1 + 1 landscape (mit width/height) → full-width.
  it("renders single-image landscape with object-fit:cover and full width", () => {
    render(
      <AgendaItem
        item={makeItem({ images: [landscape()], imagesGridColumns: 1 })}
        defaultExpanded
      />,
    );
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.style.objectFit).toBe("cover");
    const container = img!.parentElement!;
    expect(container.className).toContain("w-full");
    expect(container.className).not.toContain("w-1/2");
    expect(container.style.aspectRatio).toBe("1600 / 900");
  });

  // Branch: cols=1 + 1 portrait → 50% mx-auto.
  it("renders single-image portrait at 50% width centered", () => {
    render(
      <AgendaItem
        item={makeItem({ images: [portrait()], imagesGridColumns: 1 })}
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

  // Branch: cols=1 + 1 landscape ohne width/height → Fallback 4:3.
  it("falls back to 4:3 aspect-ratio for landscape image without width/height", () => {
    const img: AgendaImage = { public_id: "x", orientation: "landscape", width: null, height: null, alt: null };
    render(
      <AgendaItem item={makeItem({ images: [img], imagesGridColumns: 1 })} defaultExpanded />,
    );
    const container = document.querySelector("img")!.parentElement!;
    expect(container.style.aspectRatio).toBe("4 / 3");
  });

  // Branch: cols=1 + 1 portrait ohne width/height → Fallback 3:4.
  it("falls back to 3:4 aspect-ratio for portrait image without width/height", () => {
    const img: AgendaImage = { public_id: "x", orientation: "portrait", width: null, height: null, alt: null };
    render(
      <AgendaItem item={makeItem({ images: [img], imagesGridColumns: 1 })} defaultExpanded />,
    );
    const container = document.querySelector("img")!.parentElement!;
    expect(container.style.aspectRatio).toBe("3 / 4");
  });

  // Branch: cols=2 + 2 images → 2-Spalten-Grid mit aspect-[2/3] cells.
  it("renders multi-image grid with cols=2 and 2 images", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ public_id: "a" }), portrait({ public_id: "b" })],
          imagesGridColumns: 2,
        })}
        defaultExpanded
      />,
    );
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(2);
    const grid = imgs[0].parentElement!.parentElement!;
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
    expect(imgs[0].parentElement!.className).toContain("aspect-[2/3]");
  });

  // Branch: cols=4 + 2 images → cap auf min(4,2)=2 Spalten.
  it("caps effectiveCols to images.length when cols > images.length", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ public_id: "a" }), landscape({ public_id: "b" })],
          imagesGridColumns: 4,
        })}
        defaultExpanded
      />,
    );
    const grid = document.querySelectorAll("img")[0].parentElement!.parentElement!;
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
  });

  // Branch: cols=1 + length>=2 → defensive Multi-Image-Grid mit min(2,length) Spalten.
  it("falls into defensive multi-image grid when cols=1 but length>=2", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ public_id: "a" }), landscape({ public_id: "b" }), landscape({ public_id: "c" })],
          imagesGridColumns: 1,
        })}
        defaultExpanded
      />,
    );
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(3);
    const grid = imgs[0].parentElement!.parentElement!;
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
  });

  // Branch: alle imgs in Multi-Grid haben hartkodiertes object-fit:cover.
  it("applies object-fit:cover to all imgs in multi-image grid", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ public_id: "a" }), landscape({ public_id: "b" })],
          imagesGridColumns: 2,
        })}
        defaultExpanded
      />,
    );
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(2);
    imgs.forEach((img) => expect((img as HTMLImageElement).style.objectFit).toBe("cover"));
  });

  // Branch: imagesGridColumns: undefined + 1 image → defensive `?? 1` →
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
    expect(img!.parentElement!.style.aspectRatio).toBe("1600 / 900");
  });

  // Sprint 2: object-position from cropX/cropY (single-image branch, default 50/50).
  it("single-image branch defaults objectPosition to '50% 50%' when no crop set", () => {
    render(
      <AgendaItem
        item={makeItem({ images: [landscape()], imagesGridColumns: 1 })}
        defaultExpanded
      />,
    );
    const img = document.querySelector("img")!;
    expect(img.style.objectPosition).toBe("50% 50%");
  });

  // Sprint 2: object-position from cropX/cropY (single-image branch, custom crop).
  it("single-image branch applies objectPosition from cropX/cropY", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ cropX: 20, cropY: 70 })],
          imagesGridColumns: 1,
        })}
        defaultExpanded
      />,
    );
    const img = document.querySelector("img")!;
    expect(img.style.objectPosition).toBe("20% 70%");
  });

  // Sprint 2: object-position default in multi-grid branch.
  it("multi-image branch defaults objectPosition to '50% 50%' when no crop", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ public_id: "a" }), landscape({ public_id: "b" })],
          imagesGridColumns: 2,
        })}
        defaultExpanded
      />,
    );
    const imgs = document.querySelectorAll("img");
    imgs.forEach((img) => expect((img as HTMLImageElement).style.objectPosition).toBe("50% 50%"));
  });

  // Sprint 2: object-position from cropX/cropY in multi-grid branch.
  it("multi-image branch applies objectPosition from cropX/cropY", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [
            landscape({ public_id: "a", cropX: 33, cropY: 67 }),
            landscape({ public_id: "b", cropX: 75, cropY: 25 }),
          ],
          imagesGridColumns: 2,
        })}
        defaultExpanded
      />,
    );
    const imgs = document.querySelectorAll("img");
    expect((imgs[0] as HTMLImageElement).style.objectPosition).toBe("33% 67%");
    expect((imgs[1] as HTMLImageElement).style.objectPosition).toBe("75% 25%");
  });

  // Sprint 2: cropX=0 boundary — `??` not `||` regression-guard. With ||, 0 falls
  // back to 50; with ??, 0 stays 0. Asserts the correct nullish-coalescing.
  it("cropX=0 boundary renders '0% Y%' (??-vs-||-regression)", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ cropX: 0, cropY: 50 })],
          imagesGridColumns: 1,
        })}
        defaultExpanded
      />,
    );
    const img = document.querySelector("img")!;
    expect(img.style.objectPosition).toBe("0% 50%");
  });

  // Image-Fit-Toggle (Option 1): single-image branch with fit='contain' uses
  // object-fit:contain and DROPS object-position (irrelevant for letterboxing).
  it("single-image branch with fit='contain' uses objectFit:contain + no objectPosition", () => {
    render(
      <AgendaItem
        item={makeItem({
          images: [landscape({ fit: "contain", cropX: 30, cropY: 60 })],
          imagesGridColumns: 1,
        })}
        defaultExpanded
      />,
    );
    const img = document.querySelector("img")!;
    expect(img.style.objectFit).toBe("contain");
    // Position must NOT be set in contain-mode (would constrain letterbox layout).
    expect(img.style.objectPosition).toBe("");
    // Letterbox bars are white (not panel-background bleed-through).
    expect(img.style.background).toBe("rgb(255, 255, 255)");
  });

  // Image-Fit-Toggle: multi-image grid honors per-image fit independently.
  it("multi-image branch with fit='contain' uses objectFit:contain (per-image, mixed grid OK)", () => {
    const coverImg: AgendaImage = { public_id: "c", orientation: "portrait", width: 800, height: 1200, alt: null, cropX: 50, cropY: 50 };
    const containImg: AgendaImage = { public_id: "x", orientation: "landscape", width: 1600, height: 900, alt: null, fit: "contain" };
    render(
      <AgendaItem
        item={makeItem({ images: [coverImg, containImg], imagesGridColumns: 2 })}
        defaultExpanded
      />,
    );
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(2);
    expect((imgs[0] as HTMLImageElement).style.objectFit).toBe("cover");
    expect((imgs[0] as HTMLImageElement).style.objectPosition).toBe("50% 50%");
    expect((imgs[1] as HTMLImageElement).style.objectFit).toBe("contain");
    expect((imgs[1] as HTMLImageElement).style.objectPosition).toBe("");
    expect((imgs[1] as HTMLImageElement).style.background).toBe("rgb(255, 255, 255)");
    // The cover-image must NOT have a white background (no leaking).
    expect((imgs[0] as HTMLImageElement).style.background).toBe("");
  });

  // Backwards-compat: legacy AgendaImage without `fit` field defaults to cover.
  it("legacy image without fit field defaults to cover (backwards-compat)", () => {
    const legacy: AgendaImage = { public_id: "x", orientation: "landscape", width: 1600, height: 900, alt: null /* no fit */ };
    render(
      <AgendaItem
        item={makeItem({ images: [legacy], imagesGridColumns: 1 })}
        defaultExpanded
      />,
    );
    const img = document.querySelector("img")!;
    expect(img.style.objectFit).toBe("cover");
    expect(img.style.objectPosition).toBe("50% 50%");
  });
});

describe("AgendaItem — supporter logos (Sprint M3)", () => {
  it("renders no supporters section when supporterLogos is undefined (legacy compat)", () => {
    render(<AgendaItem item={makeItem()} defaultExpanded />);
    expect(document.querySelector("[data-testid='agenda-supporters']")).toBeNull();
  });

  it("renders no supporters section when supporterLogos is empty array", () => {
    render(
      <AgendaItem
        item={makeItem({ supporterLogos: [] })}
        defaultExpanded
        supportersLabel="Mit freundlicher Unterstützung von"
      />,
    );
    expect(document.querySelector("[data-testid='agenda-supporters']")).toBeNull();
  });

  it("renders supporters section when supporterLogos has items", () => {
    render(
      <AgendaItem
        item={makeItem({
          supporterLogos: [
            { public_id: "logo-1", alt: "Pro Helvetia", width: 200, height: 80 },
          ],
        })}
        defaultExpanded
        supportersLabel="Mit freundlicher Unterstützung von"
      />,
    );
    const section = document.querySelector("[data-testid='agenda-supporters']");
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain("Mit freundlicher Unterstützung von");
  });

  it("renders supporters section AFTER images and content but BEFORE hashtags", () => {
    render(
      <AgendaItem
        item={makeItem({
          beschrieb: ["Body text here"],
          supporterLogos: [
            { public_id: "logo-1", alt: null, width: 200, height: 80 },
          ],
          hashtags: [{ tag: "test", projekt_slug: "irrelevant" }],
        })}
        defaultExpanded
        supportersLabel="Mit freundlicher Unterstützung von"
      />,
    );
    const supporters = document.querySelector("[data-testid='agenda-supporters']")!;
    const hashtagSpan = Array.from(document.querySelectorAll("span")).find((s) =>
      s.textContent?.includes("#test"),
    );
    expect(supporters).not.toBeNull();
    expect(hashtagSpan).toBeTruthy();
    // DOCUMENT_POSITION_FOLLOWING = 4 → supporters comes BEFORE hashtag in DOM order
    const pos = supporters.compareDocumentPosition(hashtagSpan!);
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MediaSection, type MediaItem } from "./MediaSection";

afterEach(() => cleanup());

const image = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: 1,
  public_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  filename: "example.jpg",
  mime_type: "image/jpeg",
  size: 12345,
  created_at: "2026-04-10T10:00:00.000Z",
  ...overrides,
});

function stubReloadFetch(items: MediaItem[] = [image()]) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, data: items }),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  stubReloadFetch([image()]);
  // MediaSection toggles view to "list" by default (set in useState).
});

describe("MediaSection — Grid-View dual-DOM (hover-cluster + ActionsMenuButton)", () => {
  it("Grid-Tile renders BOTH the hover-cluster (hidden md:hoverable:flex) AND the ActionsMenuButton (md:hoverable:hidden)", () => {
    const { container } = render(<MediaSection initial={[image()]} />);
    // Toggle to Grid view
    fireEvent.click(screen.getByTitle("Grid"));
    // Hover-cluster: div mit hidden md:hoverable:flex
    const hoverCluster = container.querySelector("div.hidden.md\\:hoverable\\:flex");
    expect(hoverCluster).toBeTruthy();
    expect(hoverCluster!.className).toMatch(/hidden/);
    expect(hoverCluster!.className).toMatch(/md:hoverable:flex/);
    // ActionsMenuButton trigger: button with md:hoverable:hidden
    const triggerBtns = screen.getAllByRole("button", { name: "Medien-Aktionen" });
    expect(triggerBtns.length).toBeGreaterThanOrEqual(1);
    const gridTrigger = triggerBtns.find((b) => b.className.match(/md:hoverable:hidden/));
    expect(gridTrigger).toBeTruthy();
    expect(gridTrigger!.className).toMatch(/absolute/);
    expect(gridTrigger!.className).toMatch(/top-1/);
    expect(gridTrigger!.className).toMatch(/right-1/);
  });

  it("Grid-Tile Mobile '…'-click opens Modal with exactly 5 action-buttons", () => {
    render(<MediaSection initial={[image()]} />);
    fireEvent.click(screen.getByTitle("Grid"));
    const trigger = screen.getByRole("button", { name: "Medien-Aktionen" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Medien-Aktionen" });
    const actions = dialog.querySelectorAll("ul button");
    expect(actions.length).toBe(5);
    const labels = Array.from(actions).map((b) => b.textContent);
    expect(labels).toEqual([
      "Link intern",
      "Link extern",
      "Download",
      "Umbenennen",
      "Löschen",
    ]);
  });
});

describe("MediaSection — List-View on ListRow primitive", () => {
  it("List-View renders each row as a <ListRow> (no standalone .flex.items-center.gap-3.p-2 rows)", () => {
    const { container } = render(<MediaSection initial={[image()]} />);
    // Default view is "list"
    expect(container.querySelector("ul")).toBeTruthy();
    // Old markup pattern must be gone.
    const old = container.querySelector(
      ".flex.items-center.gap-3.p-2.bg-white.border.rounded",
    );
    expect(old).toBeNull();
    // ListRow applies base `flex items-center justify-between gap-3 p-3`.
    const row = container.querySelector("li > .flex.items-center.justify-between.gap-3.p-3");
    expect(row).toBeTruthy();
  });

  it("List-Row renders the mobile '…'-ActionsMenuButton via ListRow's md:hidden slot", () => {
    render(<MediaSection initial={[image()]} />);
    const triggers = screen.getAllByRole("button", { name: "Aktionen" });
    // ListRow's internal trigger has triggerClassName="md:hidden"
    const listTrigger = triggers.find((b) => b.className.match(/md:hidden/));
    expect(listTrigger).toBeTruthy();
  });

  it("Desktop cluster: each action button renders an inline SVG icon with aria-label + title", () => {
    render(<MediaSection initial={[image()]} />);
    // ListRow desktop cluster is `hidden md:flex` — JSDOM doesn't honor
    // breakpoints, so the buttons are still in the DOM. Query by aria-label.
    const actionLabels = ["Link intern", "Link extern", "Download", "Umbenennen", "Löschen"];
    for (const label of actionLabels) {
      // getAllByRole because the mobile modal may also have a button with the same label
      // once opened — but in this test it's closed, so only the desktop cluster buttons exist.
      const buttons = screen.getAllByRole("button", { name: label });
      // One in desktop cluster; there's also no open mobile modal → exactly one match.
      expect(buttons.length).toBe(1);
      const btn = buttons[0];
      expect(btn.getAttribute("title")).toBe(label);
      // Icon-mode renders an SVG child; text labels would leave textContent set.
      expect(btn.querySelector("svg")).toBeTruthy();
      expect(btn.textContent?.trim()).toBe(""); // no visible text in icon-mode
    }
  });
});

describe("MediaSection — rename state in ListRow content-slot", () => {
  it("clicking mobile-menu 'Umbenennen' shows inline <input> in the ListRow content slot", async () => {
    const { container } = render(<MediaSection initial={[image()]} />);
    // Default view = list. Open mobile "…"-menu
    const trigger = screen.getByRole("button", { name: "Aktionen" });
    fireEvent.click(trigger);
    // Scope the query to the Modal dialog — ListRow's Desktop cluster
    // also renders a "Umbenennen" button (md:flex, always in DOM).
    const dialog = screen.getByRole("dialog", { name: "Aktionen" });
    const renameBtn = dialog.querySelector<HTMLButtonElement>(
      'button:not([disabled])',
    );
    // First non-disabled button in the dialog is "Link intern"; walk to find "Umbenennen"
    const renameInMenu = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Umbenennen",
    );
    expect(renameInMenu).toBeTruthy();
    void renameBtn;
    await act(async () => {
      fireEvent.click(renameInMenu!);
      await Promise.resolve();
    });
    // After close + rename-start, an inline <input> should be mounted.
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Dateiname bearbeiten für example.jpg"]',
    );
    expect(input).toBeTruthy();
  });

  it("rename-input receives document.activeElement focus after menu-triggered rename (focus-handoff contract)", async () => {
    const { container } = render(<MediaSection initial={[image()]} />);
    const trigger = screen.getByRole("button", { name: "Aktionen" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Aktionen" });
    const renameInMenu = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Umbenennen",
    )!;
    await act(async () => {
      fireEvent.click(renameInMenu);
      // Allow useEffect + autoFocus commit phases to run.
      await Promise.resolve();
      await Promise.resolve();
    });
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Dateiname bearbeiten für example.jpg"]',
    );
    expect(input).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });
});

describe("MediaSection — copy-state label transition", () => {
  it("clicking 'Link intern' in menu changes the label to 'Kopiert' after copy succeeds", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => {}) },
    });
    render(<MediaSection initial={[image()]} />);
    const trigger = screen.getAllByRole("button", { name: "Aktionen" })[0];
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Aktionen" });
    const linkInternal = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Link intern",
    )!;
    await act(async () => {
      fireEvent.click(linkInternal);
      await Promise.resolve();
      await Promise.resolve();
    });
    // Re-open menu, label should now be "Kopiert" (in the dialog).
    fireEvent.click(screen.getAllByRole("button", { name: "Aktionen" })[0]);
    const dialog2 = screen.getByRole("dialog", { name: "Aktionen" });
    const hasKopiert = Array.from(dialog2.querySelectorAll<HTMLButtonElement>("button")).some(
      (b) => b.textContent === "Kopiert",
    );
    expect(hasKopiert).toBe(true);
    const hasLinkIntern = Array.from(dialog2.querySelectorAll<HTMLButtonElement>("button")).some(
      (b) => b.textContent === "Link intern",
    );
    expect(hasLinkIntern).toBe(false);
  });
});

describe("MediaSection — download action uses programmatic anchor", () => {
  it("clicking 'Download' creates an <a> with download=filename and clicks it", async () => {
    const realCreate = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") anchors.push(el as HTMLAnchorElement);
      return el;
    });
    try {
      render(<MediaSection initial={[image({ filename: "Report.pdf" })]} />);
      const trigger = screen.getAllByRole("button", { name: "Aktionen" })[0];
      fireEvent.click(trigger);
      const dialog = screen.getByRole("dialog", { name: "Aktionen" });
      const downloadBtn = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent === "Download",
      )!;
      fireEvent.click(downloadBtn);
      const anchor = anchors.find((a) => a.download === "Report.pdf");
      expect(anchor).toBeTruthy();
      // Browser-level click() fires — in JSDOM `.click()` doesn't navigate,
      // but we still get the attribute/string check done.
      expect(anchor!.href).toMatch(/\/api\/media\/[a-z0-9-]+\/\?download=1/);
    } finally {
      spy.mockRestore();
    }
  });
});

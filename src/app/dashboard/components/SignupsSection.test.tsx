// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  SignupsSection,
  type MembershipRow,
  type NewsletterRow,
} from "./SignupsSection";

afterEach(() => cleanup());

const membership = (overrides: Partial<MembershipRow> = {}): MembershipRow => ({
  id: 1,
  vorname: "Anna",
  nachname: "Beispiel",
  strasse: "Musterweg",
  nr: "12",
  plz: "8000",
  stadt: "Zürich",
  email: "anna@example.com",
  newsletter_opt_in: true,
  paid: false,
  paid_at: null,
  consent_at: "2026-04-10T10:00:00.000Z",
  created_at: "2026-04-10T10:00:00.000Z",
  ...overrides,
});

const newsletter = (overrides: Partial<NewsletterRow> = {}): NewsletterRow => ({
  id: 101,
  vorname: "Bruno",
  nachname: "Muster",
  woher: "Veranstaltung",
  email: "bruno@example.com",
  source: "form",
  consent_at: "2026-04-11T10:00:00.000Z",
  created_at: "2026-04-11T10:00:00.000Z",
  ...overrides,
});

const defaultInitial = () => ({
  memberships: [
    membership({ id: 1 }),
    membership({ id: 2, vorname: "Clara", nachname: "Test", paid: true, paid_at: "2026-04-09T08:00:00.000Z" }),
  ],
  newsletter: [newsletter({ id: 101 })],
});

function stubReloadFetch(data = defaultInitial()) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, data }),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  stubReloadFetch();
});

describe("SignupsSection — dual-DOM CSS", () => {
  it("renders BOTH the desktop table (hidden md:block) and mobile card list (md:hidden) for memberships", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    const desktopTable = container.querySelector(".hidden.md\\:block");
    const mobileList = container.querySelector("ul.md\\:hidden");
    expect(desktopTable).toBeTruthy();
    expect(mobileList).toBeTruthy();
    expect(desktopTable!.querySelector("table")).toBeTruthy();
    expect(mobileList!.querySelectorAll("li").length).toBe(2);
  });

  it("desktop header (bulk-action buttons) is hidden on mobile via hidden md:flex", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    const headers = container.querySelectorAll("header.hidden.md\\:flex");
    expect(headers.length).toBeGreaterThanOrEqual(1);
  });
});

describe("SignupsSection — Memberships mobile card", () => {
  it("renders core fields + 44x44 touch targets for select, history, delete", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    // Use getAllByLabelText because desktop + mobile both render same labels.
    const selectChecks = screen.getAllByLabelText("Anna Beispiel auswählen");
    expect(selectChecks.length).toBe(2); // desktop + mobile
    // Paid checkbox: desktop says "— Beitrag bezahlt", mobile says "— Bezahlt".
    // Presence check by id-scope: mobile paid checkbox lives in the ul.md:hidden.
    const mobileList = container.querySelector("ul.md\\:hidden")!;
    const mobilePaid = mobileList.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label*="Bezahlt"]',
    );
    expect(mobilePaid).toBeTruthy();
    const historyBtns = screen.getAllByLabelText(/Verlauf für Anna Beispiel/);
    expect(historyBtns.length).toBe(2);
    const mobileHistory = historyBtns.find((b) => b.className.match(/min-w-11/) && b.className.match(/min-h-11/));
    expect(mobileHistory).toBeTruthy();
  });

  it("collapse button has aria-expanded=false by default and aria-controls=member-details-{id}", () => {
    render(<SignupsSection initial={defaultInitial()} />);
    const toggles = screen.getAllByRole("button", { name: /Details einblenden/ });
    expect(toggles.length).toBeGreaterThanOrEqual(1);
    const toggle = toggles[0];
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe("member-details-1");
  });

  it("collapse toggle flips aria-expanded on click and renders <dl> with matching id", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    const toggle = screen.getAllByRole("button", { name: /Details einblenden/ })[0];
    fireEvent.click(toggle);
    const after = screen.getAllByRole("button", { name: /Details ausblenden/ })[0];
    expect(after.getAttribute("aria-expanded")).toBe("true");
    const dl = container.querySelector("#member-details-1");
    expect(dl).toBeTruthy();
    expect(dl!.tagName).toBe("DL");
  });
});

describe("SignupsSection — Newsletter mobile card", () => {
  it("renders newsletter fields stacked (no collapse toggle)", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    // Switch to newsletter tab
    fireEvent.click(screen.getByRole("tab", { name: /Newsletter/ }));
    const mobileList = container.querySelector("ul.md\\:hidden");
    expect(mobileList).toBeTruthy();
    expect(mobileList!.textContent).toMatch(/Bruno Muster/);
    expect(mobileList!.textContent).toMatch(/bruno@example.com/);
    // No Details toggle in newsletter cards.
    const newsletterDetailsToggles = mobileList!.querySelectorAll("button[aria-expanded]");
    expect(newsletterDetailsToggles.length).toBe(0);
  });
});

describe("SignupsSection — MobileBulkBar + BulkFlowSpacer", () => {
  it("does NOT render MobileBulkBar when selection is empty", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    const region = container.querySelector('[role="region"][aria-label="Auswahl-Aktionen"]');
    expect(region).toBeNull();
  });

  it("renders MobileBulkBar with aria-live selection count when a membership is selected", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    // Mobile checkbox for Anna — pick the one inside the mobile ul.
    const mobileList = container.querySelector("ul.md\\:hidden")!;
    const annaCheckbox = mobileList.querySelector<HTMLInputElement>(
      'input[aria-label="Anna Beispiel auswählen"]',
    );
    expect(annaCheckbox).toBeTruthy();
    fireEvent.click(annaCheckbox!);
    const region = container.querySelector('[role="region"][aria-label="Auswahl-Aktionen"]');
    expect(region).toBeTruthy();
    const live = region!.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(live!.textContent).toMatch(/1 ausgewählt/);
  });

  it("MobileBulkBar has z-30 + md:hidden + safe-area-inset-bottom classes", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    const mobileList = container.querySelector("ul.md\\:hidden")!;
    const cb = mobileList.querySelector<HTMLInputElement>(
      'input[aria-label="Anna Beispiel auswählen"]',
    )!;
    fireEvent.click(cb);
    const region = container.querySelector<HTMLElement>(
      '[role="region"][aria-label="Auswahl-Aktionen"]',
    )!;
    expect(region.className).toMatch(/z-30/);
    expect(region.className).toMatch(/md:hidden/);
    expect(region.className).toMatch(/pb-\[env\(safe-area-inset-bottom\)\]/);
  });

  it("MobileBulkBar and BulkFlowSpacer use the same height class token (BULK_BAR_HEIGHT)", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    const mobileList = container.querySelector("ul.md\\:hidden")!;
    const cb = mobileList.querySelector<HTMLInputElement>(
      'input[aria-label="Anna Beispiel auswählen"]',
    )!;
    fireEvent.click(cb);
    const region = container.querySelector<HTMLElement>(
      '[role="region"][aria-label="Auswahl-Aktionen"]',
    )!;
    // Extract the hN class (h-20, h-24 etc.) used on the bar.
    const heightClass = Array.from(region.classList).find((c) => /^h-\d+$/.test(c));
    expect(heightClass).toBeTruthy();
    // The spacer is md:hidden + aria-hidden sibling somewhere below the ul.
    const spacer = container.querySelector<HTMLElement>('[aria-hidden="true"].md\\:hidden');
    expect(spacer).toBeTruthy();
    expect(spacer!.className).toMatch(new RegExp(`\\b${heightClass}\\b`));
    expect(spacer!.className).toMatch(/pb-\[env\(safe-area-inset-bottom\)\]/);
  });

  it("Behavior-parity: clicking sticky delete opens the same Bulk-Delete dialog as desktop header", () => {
    render(<SignupsSection initial={defaultInitial()} />);
    // Select 1 row via mobile checkbox.
    const selectChecks = screen.getAllByLabelText("Anna Beispiel auswählen");
    // mobile is index 1 (desktop is 0) but order isn't guaranteed — pick any and select.
    fireEvent.click(selectChecks[selectChecks.length - 1]);
    // Sticky bar appears. Click "Ausgewählte löschen" inside it.
    const region = screen.getByRole("region", { name: "Auswahl-Aktionen" });
    const stickyDelete = region.querySelector<HTMLButtonElement>(
      "button.border-red-600",
    );
    expect(stickyDelete).toBeTruthy();
    fireEvent.click(stickyDelete!);
    // A dialog with the Bulk-Delete title must open.
    const dialog = screen.getByRole("dialog", { name: /Mehrere Einträge löschen/ });
    expect(dialog).toBeTruthy();
  });

  it("Sticky-Bar z-30 < Modal z-50: both can be in the DOM but modal visually overlays", () => {
    render(<SignupsSection initial={defaultInitial()} />);
    const selectChecks = screen.getAllByLabelText("Anna Beispiel auswählen");
    fireEvent.click(selectChecks[selectChecks.length - 1]);
    const region = screen.getByRole("region", { name: "Auswahl-Aktionen" });
    const stickyDelete = region.querySelector<HTMLButtonElement>("button.border-red-600")!;
    fireEvent.click(stickyDelete);
    // Modal backdrop carries z-50 in Modal.tsx.
    const dialogs = document.querySelectorAll('[role="dialog"]');
    expect(dialogs.length).toBe(1);
    expect(region.className).toMatch(/z-30/);
    const backdrop = dialogs[0].parentElement;
    expect(backdrop?.className).toMatch(/z-50/);
  });
});

describe("SignupsSection — memberExpanded state matrix", () => {
  it("expansion survives sort-toggle (id-based, not index-based)", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    const toggle1 = screen.getAllByRole("button", { name: /Details einblenden/ })[0];
    fireEvent.click(toggle1);
    // Toggle sort via desktop header (function is shared).
    fireEvent.click(screen.getByRole("button", { name: /Datum absteigend sortieren/ }));
    // After sort, id=1 card should still be expanded.
    expect(container.querySelector("#member-details-1")).toBeTruthy();
  });

  it("expansion survives sub-tab switch Memberships ↔ Newsletter ↔ Memberships", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    const toggle = screen.getAllByRole("button", { name: /Details einblenden/ })[0];
    fireEvent.click(toggle);
    expect(container.querySelector("#member-details-1")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Newsletter/ }));
    expect(container.querySelector("#member-details-1")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Mitgliedschaften/ }));
    expect(container.querySelector("#member-details-1")).toBeTruthy();
  });

  it("orphan-cleanup: expanded id disappears after reload drops the row", async () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    const toggle = screen.getAllByRole("button", { name: /Details einblenden/ })[0];
    fireEvent.click(toggle);
    expect(container.querySelector("#member-details-1")).toBeTruthy();
    // Simulate reload that returns a dataset without id=1.
    const reduced = { ...defaultInitial(), memberships: defaultInitial().memberships.filter((m) => m.id !== 1) };
    stubReloadFetch(reduced);
    // Simulate the delete-flow: user deletes id=1.
    const deleteBtn = screen.getAllByLabelText(/Anna Beispiel löschen/)[0];
    fireEvent.click(deleteBtn);
    // DeleteConfirm Modal now open. Scope the confirm button to the dialog.
    const dialog = screen.getByRole("dialog", { name: /Löschen bestätigen/ });
    const confirmBtn = dialog.querySelector<HTMLButtonElement>("button.bg-red-600")!;
    expect(confirmBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(confirmBtn);
      await Promise.resolve();
      await Promise.resolve();
    });
    // After delete + reload, id=1 is gone and memberExpanded pruned.
    expect(container.querySelector("#member-details-1")).toBeNull();
  });
});

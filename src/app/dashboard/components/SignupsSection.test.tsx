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

describe("SignupsSection — mobile mini-header (CSV + Select-All, always visible)", () => {
  it("renders a mobile-only mini-header with 'Alle' checkbox + CSV button when selection is empty (Codex R1 regression)", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    // No selection yet, so MobileBulkBar is absent.
    const region = container.querySelector('[role="region"][aria-label="Auswahl-Aktionen"]');
    expect(region).toBeNull();
    // Mini-header lives in a md:hidden flex container above the ul.
    const mobileList = container.querySelector("ul.md\\:hidden")!;
    const miniHeader = mobileList.previousElementSibling as HTMLElement | null;
    expect(miniHeader).toBeTruthy();
    expect(miniHeader!.className).toMatch(/md:hidden/);
    // Select-All checkbox + CSV button both present and enabled.
    const selectAll = miniHeader!.querySelector<HTMLInputElement>(
      'input[aria-label="Alle auswählen"]',
    );
    expect(selectAll).toBeTruthy();
    expect(selectAll!.checked).toBe(false);
    const csvBtn = Array.from(miniHeader!.querySelectorAll("button")).find((b) =>
      /CSV/.test(b.textContent ?? ""),
    );
    expect(csvBtn).toBeTruthy();
    expect(csvBtn!.disabled).toBe(false);
  });

  it("mobile Select-All checkbox selects all memberships", () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    const mobileList = container.querySelector("ul.md\\:hidden")!;
    const miniHeader = mobileList.previousElementSibling as HTMLElement;
    const selectAll = miniHeader.querySelector<HTMLInputElement>(
      'input[aria-label="Alle auswählen"]',
    )!;
    fireEvent.click(selectAll);
    // After click, all 2 membership checkboxes (inside mobile ul) are checked.
    const mobileChecks = mobileList.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][aria-label*="auswählen"]',
    );
    expect(mobileChecks.length).toBe(2);
    mobileChecks.forEach((cb) => expect(cb.checked).toBe(true));
    // Sticky-Bar now visible with count=2.
    const region = container.querySelector('[role="region"][aria-label="Auswahl-Aktionen"]');
    expect(region).toBeTruthy();
    expect(region!.textContent).toMatch(/2 ausgewählt/);
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

  it("Behavior-parity (a): clicking sticky delete opens the same Bulk-Delete dialog as desktop header", () => {
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

  it("Behavior-parity (b): sticky CSV triggers download with same filename pattern as header CSV", () => {
    // Spy on document.createElement to capture the <a> that downloadCsv creates.
    const realCreate = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") anchors.push(el as HTMLAnchorElement);
      return el;
    });
    // URL.createObjectURL / revokeObjectURL are not in jsdom by default.
    const urlProto = URL as unknown as {
      createObjectURL: (b: Blob) => string;
      revokeObjectURL: (u: string) => void;
    };
    urlProto.createObjectURL = () => "blob:fake";
    urlProto.revokeObjectURL = () => {};
    try {
      render(<SignupsSection initial={defaultInitial()} />);
      const selectChecks = screen.getAllByLabelText("Anna Beispiel auswählen");
      fireEvent.click(selectChecks[selectChecks.length - 1]);
      const region = screen.getByRole("region", { name: "Auswahl-Aktionen" });
      const stickyCsv = Array.from(region.querySelectorAll("button")).find((b) =>
        /CSV/.test(b.textContent ?? ""),
      );
      expect(stickyCsv).toBeTruthy();
      fireEvent.click(stickyCsv!);
      const downloadAnchor = anchors.find((a) => a.download);
      expect(downloadAnchor).toBeTruthy();
      expect(downloadAnchor!.download).toMatch(/^mitgliedschaften-\d{4}-\d{2}-\d{2}\.csv$/);
    } finally {
      spy.mockRestore();
    }
  });

  it("Behavior-parity (c): bulkDeleting=true disables BOTH sticky and header delete buttons identically", async () => {
    // Stub fetch to hang on bulk-delete so bulkDeleting stays true.
    let holdResolve: (() => void) | null = null;
    const holdPromise = new Promise<void>((res) => {
      holdResolve = res;
    });
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("/bulk-delete")) {
        await holdPromise;
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: defaultInitial() }),
      } as Response;
    }) as unknown as typeof fetch;
    try {
      const { container } = render(<SignupsSection initial={defaultInitial()} />);
      const selectChecks = screen.getAllByLabelText("Anna Beispiel auswählen");
      fireEvent.click(selectChecks[selectChecks.length - 1]);
      const region = screen.getByRole("region", { name: "Auswahl-Aktionen" });
      const stickyDelete = region.querySelector<HTMLButtonElement>("button.border-red-600")!;
      fireEvent.click(stickyDelete);
      // Bulk-Delete dialog open. Confirm.
      const dialog = screen.getByRole("dialog", { name: /Mehrere Einträge löschen/ });
      const confirmBtn = dialog.querySelector<HTMLButtonElement>("button.bg-red-600")!;
      await act(async () => {
        fireEvent.click(confirmBtn);
        await Promise.resolve();
      });
      // bulkDeleting=true now. Find the desktop header delete button for memberships
      // (outside the region, in the hidden md:flex header).
      const headerDelete = container.querySelector<HTMLButtonElement>(
        "header.hidden.md\\:flex button.border-red-600",
      );
      expect(headerDelete).toBeTruthy();
      // Sticky-Bar delete button should also be disabled now.
      const stickyNow = region.querySelector<HTMLButtonElement>("button.border-red-600")!;
      expect(stickyNow.disabled).toBe(true);
      expect(headerDelete!.disabled).toBe(true);
    } finally {
      (holdResolve as (() => void) | null)?.();
    }
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

  it("expansion survives paid-toggle (optimistic + server-win, id stable)", async () => {
    // Stub fetch: GET reload returns initial data, PATCH returns server-win.
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/paid")) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { paid: true, paid_at: "2026-04-18T10:00:00.000Z" } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: defaultInitial() }),
      } as Response;
    }) as unknown as typeof fetch;
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    // Expand id=1 (unpaid in fixture, OFF→ON paid-toggle is direct, no modal).
    const toggle = screen.getAllByRole("button", { name: /Details einblenden/ })[0];
    fireEvent.click(toggle);
    expect(container.querySelector("#member-details-1")).toBeTruthy();
    // Mobile paid checkbox for id=1 — inside mobile ul only.
    const mobileList = container.querySelector("ul.md\\:hidden")!;
    const mobilePaidCb = mobileList.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label*="Bezahlt"]',
    )!;
    await act(async () => {
      fireEvent.click(mobilePaidCb);
      await Promise.resolve();
      await Promise.resolve();
    });
    // After optimistic + server-win, expansion must still be present.
    expect(container.querySelector("#member-details-1")).toBeTruthy();
  });

  it("orphan-cleanup: expanded id disappears after Bulk-Delete removes the row", async () => {
    const { container } = render(<SignupsSection initial={defaultInitial()} />);
    const toggle = screen.getAllByRole("button", { name: /Details einblenden/ })[0];
    fireEvent.click(toggle);
    expect(container.querySelector("#member-details-1")).toBeTruthy();
    // Select id=1 mobile checkbox.
    const mobileList = container.querySelector("ul.md\\:hidden")!;
    const annaCb = mobileList.querySelector<HTMLInputElement>(
      'input[aria-label="Anna Beispiel auswählen"]',
    )!;
    fireEvent.click(annaCb);
    // Bulk-delete fetch returns success; reload returns data without id=1.
    const reduced = {
      ...defaultInitial(),
      memberships: defaultInitial().memberships.filter((m) => m.id !== 1),
    };
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("/bulk-delete")) {
        return { ok: true, json: async () => ({ success: true }) } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: reduced }) } as Response;
    }) as unknown as typeof fetch;
    const region = screen.getByRole("region", { name: "Auswahl-Aktionen" });
    const stickyDelete = region.querySelector<HTMLButtonElement>("button.border-red-600")!;
    fireEvent.click(stickyDelete);
    const dialog = screen.getByRole("dialog", { name: /Mehrere Einträge löschen/ });
    const confirmBtn = dialog.querySelector<HTMLButtonElement>("button.bg-red-600")!;
    await act(async () => {
      fireEvent.click(confirmBtn);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector("#member-details-1")).toBeNull();
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

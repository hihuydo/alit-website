// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MobileTabMenu } from "./MobileTabMenu";

afterEach(() => cleanup());

type Tab = "agenda" | "journal" | "projekte";

const TABS: { key: Tab; label: string }[] = [
  { key: "agenda", label: "Agenda" },
  { key: "journal", label: "Discours Agités" },
  { key: "projekte", label: "Projekte" },
];

describe("MobileTabMenu — burger button", () => {
  it("renders with aria-label, aria-expanded=false, and min-w-11 min-h-11", () => {
    render(
      <MobileTabMenu
        tabs={TABS}
        active="agenda"
        activeLabel="Agenda"
        isOpen={false}
        onOpenChange={() => {}}
        onSelect={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: "Menü öffnen" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.className).toMatch(/min-w-11/);
    expect(btn.className).toMatch(/min-h-11/);
  });

  it("shows the active-tab label next to the burger icon", () => {
    render(
      <MobileTabMenu
        tabs={TABS}
        active="journal"
        activeLabel="Discours Agités"
        isOpen={false}
        onOpenChange={() => {}}
        onSelect={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: "Menü öffnen" });
    expect(btn.textContent).toContain("Discours Agités");
  });

  it("shows explicit activeLabel even when active key is not in tabs (e.g. 'konto')", () => {
    // Codex PR #73 R1 [P2]: "konto" is a valid active state set from the
    // header button, but lives outside the `tabs` array. The burger
    // trigger must still show human-readable context, not just "☰".
    render(
      <MobileTabMenu
        tabs={TABS}
        active={"konto" as Tab}
        activeLabel="Konto"
        isOpen={false}
        onOpenChange={() => {}}
        onSelect={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: "Menü öffnen" });
    expect(btn.textContent).toContain("Konto");
  });

  it("click triggers onOpenChange(true)", () => {
    const onOpenChange = vi.fn();
    render(
      <MobileTabMenu
        tabs={TABS}
        active="agenda"
        activeLabel="Agenda"
        isOpen={false}
        onOpenChange={onOpenChange}
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});

describe("MobileTabMenu — panel", () => {
  it("renders all tabs when open", () => {
    render(
      <MobileTabMenu
        tabs={TABS}
        active="agenda"
        activeLabel="Agenda"
        isOpen={true}
        onOpenChange={() => {}}
        onSelect={() => {}}
      />,
    );
    // Burger-Button shows "Agenda", and the dialog's active option also shows
    // "Agenda" — use getAllByText to avoid the disambiguation error.
    expect(screen.getAllByText("Agenda").length).toBeGreaterThan(0);
    expect(screen.getByText("Discours Agités")).toBeTruthy();
    expect(screen.getByText("Projekte")).toBeTruthy();
  });

  it("disables the active tab (click does not call onSelect)", () => {
    const onSelect = vi.fn();
    render(
      <MobileTabMenu
        tabs={TABS}
        active="agenda"
        activeLabel="Agenda"
        isOpen={true}
        onOpenChange={() => {}}
        onSelect={onSelect}
      />,
    );
    // Grab the tab-list button inside the dialog (not the burger button)
    const dialog = screen.getByRole("dialog");
    const agendaBtn = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.trim() === "Agenda",
    )!;
    expect(agendaBtn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(agendaBtn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("non-active tab click calls onSelect unconditionally (no dirty-guard inside the menu)", () => {
    const onSelect = vi.fn();
    render(
      <MobileTabMenu
        tabs={TABS}
        active="agenda"
        activeLabel="Agenda"
        isOpen={true}
        onOpenChange={() => {}}
        onSelect={onSelect}
      />,
    );
    const dialog = screen.getByRole("dialog");
    const journalBtn = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.trim() === "Discours Agités",
    )!;
    fireEvent.click(journalBtn);
    expect(onSelect).toHaveBeenCalledWith("journal");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

/**
 * Parent-Integration-Test (Codex R2 C4 REQUIRED).
 * Verifies the `setBurgerOpen(false) → goToTab → confirmDiscard` chain
 * mechanically. A minimal parent wires the burger menu to a mock
 * confirmDiscard and asserts call ordering + argument shape.
 */
describe("MobileTabMenu × Dirty-Guard integration (parent-owned)", () => {
  function MockParent({
    confirmDiscard,
    initialActive = "agenda",
  }: {
    confirmDiscard: (action: () => void) => void;
    initialActive?: Tab;
  }) {
    const [active, setActive] = useState<Tab>(initialActive);
    const [burgerOpen, setBurgerOpen] = useState(false);

    const goToTab = (key: Tab) => {
      if (key === active) return;
      confirmDiscard(() => setActive(key));
    };

    const handleBurgerSelect = (key: Tab) => {
      setBurgerOpen(false);
      goToTab(key);
    };

    return (
      <div>
        <div data-testid="active-tab">{active}</div>
        <div data-testid="burger-open">{burgerOpen ? "open" : "closed"}</div>
        <MobileTabMenu
          tabs={TABS}
          active={active}
          activeLabel={TABS.find((t) => t.key === active)?.label ?? ""}
          isOpen={burgerOpen}
          onOpenChange={setBurgerOpen}
          onSelect={handleBurgerSelect}
        />
        <button onClick={() => setBurgerOpen(true)} data-testid="open-panel">open</button>
      </div>
    );
  }

  it("closes burger-panel BEFORE invoking confirmDiscard on non-active tab click", () => {
    const call_order: string[] = [];
    // Capture state-change via spy-callback: confirmDiscard runs the callback
    // SYNCHRONOUSLY here (mimics the "Verwerfen" branch) so we can assert
    // the order of operations in the same render pass.
    const confirmDiscard = vi.fn((action: () => void) => {
      call_order.push("confirmDiscard");
      action();
      call_order.push("action-ran");
    });

    render(<MockParent confirmDiscard={confirmDiscard} />);

    // Open the burger panel
    fireEvent.click(screen.getByTestId("open-panel"));
    expect(screen.getByTestId("burger-open").textContent).toBe("open");

    // Click a non-active tab inside the panel
    const dialog = screen.getByRole("dialog");
    const journalBtn = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.trim() === "Discours Agités",
    )!;
    fireEvent.click(journalBtn);

    // Panel closed
    expect(screen.getByTestId("burger-open").textContent).toBe("closed");
    // confirmDiscard was called
    expect(confirmDiscard).toHaveBeenCalledTimes(1);
    // Synchronous callback ran → active state changed
    expect(screen.getByTestId("active-tab").textContent).toBe("journal");
    // Call order: confirmDiscard fired, then its action ran
    expect(call_order).toEqual(["confirmDiscard", "action-ran"]);
  });

  it("does NOT call confirmDiscard when the user clicks the already-active tab", () => {
    const confirmDiscard = vi.fn();
    render(<MockParent confirmDiscard={confirmDiscard} initialActive="agenda" />);

    fireEvent.click(screen.getByTestId("open-panel"));
    const dialog = screen.getByRole("dialog");
    const agendaBtn = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.trim() === "Agenda",
    )!;
    // Active tab is disabled → click is a no-op
    fireEvent.click(agendaBtn);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it('keeps the panel closed on the "Zurück" (cancel) branch of confirmDiscard', () => {
    // Simulates: user clicks a non-active tab while editor is dirty; user
    // chooses "Zurück" in the confirm modal → action is NEVER invoked.
    const confirmDiscard = vi.fn(() => {
      /* intentionally drops the action — user cancelled */
    });

    render(<MockParent confirmDiscard={confirmDiscard} />);
    fireEvent.click(screen.getByTestId("open-panel"));

    const dialog = screen.getByRole("dialog");
    const journalBtn = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.trim() === "Discours Agités",
    )!;
    fireEvent.click(journalBtn);

    // Burger panel is closed (handleBurgerSelect's first line)
    expect(screen.getByTestId("burger-open").textContent).toBe("closed");
    // Active tab has NOT changed (confirmDiscard never invoked the action)
    expect(screen.getByTestId("active-tab").textContent).toBe("agenda");
  });
});

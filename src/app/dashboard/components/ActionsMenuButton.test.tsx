// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ActionsMenuButton,
  ACTIONS_MENU_TRIGGER_BASE_CLASS,
} from "./ActionsMenuButton";
import type { RowAction } from "./actions-menu-types";

afterEach(() => cleanup());

function actions(): RowAction[] {
  return [
    { label: "Bearbeiten", onClick: vi.fn() },
    { label: "Löschen", onClick: vi.fn(), variant: "danger" },
  ];
}

describe("ActionsMenuButton — trigger a11y", () => {
  it("trigger button has aria-label, aria-expanded=false, aria-haspopup=menu", () => {
    render(<ActionsMenuButton actions={actions()} />);
    const trigger = screen.getByRole("button", { name: "Aktionen" });
    expect(trigger.getAttribute("aria-label")).toBe("Aktionen");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("custom triggerLabel overrides aria-label", () => {
    render(<ActionsMenuButton actions={actions()} triggerLabel="Medien-Aktionen" />);
    expect(screen.getByRole("button", { name: "Medien-Aktionen" })).toBeTruthy();
  });

  it("aria-expanded flips to true after click", () => {
    render(<ActionsMenuButton actions={actions()} />);
    const trigger = screen.getByRole("button", { name: "Aktionen" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("ActionsMenuButton — trigger-class append-not-replace", () => {
  it("base class is always applied, triggerClassName is appended", () => {
    render(
      <ActionsMenuButton
        actions={actions()}
        triggerClassName="md:hoverable:hidden absolute top-1 right-1"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Aktionen" });
    // Base class tokens must all be present.
    ACTIONS_MENU_TRIGGER_BASE_CLASS.split(/\s+/).forEach((token) => {
      expect(trigger.className).toMatch(new RegExp(`(^|\\s)${token.replace(/\//g, "\\/")}(\\s|$)`));
    });
    // Caller-supplied tokens must also be present.
    expect(trigger.className).toMatch(/md:hoverable:hidden/);
    expect(trigger.className).toMatch(/absolute/);
    expect(trigger.className).toMatch(/top-1/);
    expect(trigger.className).toMatch(/right-1/);
  });

  it("base class contains no visibility tokens (no `hidden`/`md:hidden`/`hoverable:`)", () => {
    expect(ACTIONS_MENU_TRIGGER_BASE_CLASS).not.toMatch(/\bhidden\b/);
    expect(ACTIONS_MENU_TRIGGER_BASE_CLASS).not.toMatch(/md:hidden/);
    expect(ACTIONS_MENU_TRIGGER_BASE_CLASS).not.toMatch(/hoverable:/);
  });

  it("base class includes 44x44 touch target", () => {
    expect(ACTIONS_MENU_TRIGGER_BASE_CLASS).toMatch(/min-w-11/);
    expect(ACTIONS_MENU_TRIGGER_BASE_CLASS).toMatch(/min-h-11/);
  });
});

describe("ActionsMenuButton — open/close + actions", () => {
  it("clicking trigger opens Modal with all actions as buttons", () => {
    render(<ActionsMenuButton actions={actions()} />);
    fireEvent.click(screen.getByRole("button", { name: "Aktionen" }));
    const dialog = screen.getByRole("dialog", { name: "Aktionen" });
    const actionButtons = dialog.querySelectorAll("ul button");
    expect(actionButtons.length).toBe(2);
    expect(actionButtons[0].textContent).toBe("Bearbeiten");
    expect(actionButtons[1].textContent).toBe("Löschen");
  });

  it("danger variant has text-red-600 class", () => {
    render(<ActionsMenuButton actions={actions()} />);
    fireEvent.click(screen.getByRole("button", { name: "Aktionen" }));
    const dialog = screen.getByRole("dialog");
    const danger = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Löschen",
    );
    expect(danger?.className).toMatch(/text-red-600/);
  });

  it("disabled action renders as <button disabled>", () => {
    const disabledActions: RowAction[] = [
      { label: "Bearbeiten", onClick: vi.fn(), disabled: true },
    ];
    render(<ActionsMenuButton actions={disabledActions} />);
    fireEvent.click(screen.getByRole("button", { name: "Aktionen" }));
    const btn = screen.getByRole("dialog").querySelector<HTMLButtonElement>("button[disabled]");
    expect(btn?.textContent).toBe("Bearbeiten");
  });
});

describe("ActionsMenuButton — close-before-action (outcome test)", () => {
  // The B1 lesson on close-menu-before-action is tested via outcome, not
  // via spy-on-call-order: if the menu-modal closes BEFORE the action's
  // follow-up modal opens, there should be exactly 1 dialog in the DOM
  // after the action completes (the follow-up, not the menu).
  // (patterns/react.md close-menu-before-action-test-outcome-not-order)
  function Harness() {
    const [showFollowUp, setShowFollowUp] = useState(false);
    const acts: RowAction[] = [
      { label: "Trigger follow-up", onClick: () => setShowFollowUp(true) },
    ];
    return (
      <>
        <ActionsMenuButton actions={acts} />
        {showFollowUp && (
          <div role="dialog" aria-label="Follow-up">
            Follow-up
          </div>
        )}
      </>
    );
  }

  it("after action click, exactly one dialog is present (menu closed + follow-up opened)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Aktionen" }));
    const menu = screen.getByRole("dialog", { name: "Aktionen" });
    fireEvent.click(menu.querySelector<HTMLButtonElement>("ul button")!);
    // Menu-modal must be closed, follow-up-modal open. Total = 1 dialog.
    const dialogs = document.querySelectorAll('[role="dialog"]');
    expect(dialogs.length).toBe(1);
    expect(dialogs[0].getAttribute("aria-label")).toBe("Follow-up");
  });
});

describe("ActionsMenuButton — matchMedia close-on-resize", () => {
  it("subscribes to matchMedia (min-width: 768px) change event", () => {
    const addSpy = vi.fn();
    const removeSpy = vi.fn();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: addSpy,
      removeEventListener: removeSpy,
      media: "(min-width: 768px)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    try {
      const { unmount } = render(<ActionsMenuButton actions={actions()} />);
      expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 768px)");
      expect(addSpy).toHaveBeenCalledWith("change", expect.any(Function));
      unmount();
      expect(removeSpy).toHaveBeenCalled();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});

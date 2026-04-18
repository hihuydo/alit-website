// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ListRow, type RowAction } from "./ListRow";
import { Modal } from "./Modal";

afterEach(() => cleanup());

function actions(): RowAction[] {
  return [
    { label: "Bearbeiten", onClick: vi.fn() },
    { label: "Löschen", onClick: vi.fn(), variant: "danger" },
  ];
}

describe("ListRow — render & structure", () => {
  it("renders dragHandle, content, badges slots as ReactNode", () => {
    render(
      <ListRow
        dragHandle={<span data-testid="drag">≡</span>}
        content={<span data-testid="content">Title</span>}
        badges={<span data-testid="badges">DE</span>}
        actions={actions()}
      />,
    );
    expect(screen.getByTestId("drag")).toBeTruthy();
    expect(screen.getByTestId("content")).toBeTruthy();
    expect(screen.getByTestId("badges")).toBeTruthy();
  });

  it("desktop cluster has `hidden md:flex` class and renders all actions as buttons", () => {
    const { container } = render(<ListRow content="x" actions={actions()} />);
    const desktopCluster = container.querySelector(".hidden.md\\:flex");
    expect(desktopCluster).toBeTruthy();
    const btns = desktopCluster!.querySelectorAll("button");
    expect(btns.length).toBe(2);
    expect(btns[0].textContent).toBe("Bearbeiten");
    expect(btns[1].textContent).toBe("Löschen");
  });

  it("mobile cluster has `md:hidden` class and renders a single '…'-button", () => {
    render(<ListRow content="x" actions={actions()} />);
    const triggerBtn = screen.getByRole("button", { name: "Aktionen" });
    expect(triggerBtn.className).toMatch(/md:hidden/);
    expect(triggerBtn.textContent?.trim()).toBe("…");
  });
});

describe("ListRow — '…' trigger a11y + touch target", () => {
  it("has aria-label, aria-expanded, aria-haspopup, min-w-11 min-h-11", () => {
    render(<ListRow content="x" actions={actions()} />);
    const btn = screen.getByRole("button", { name: "Aktionen" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.getAttribute("aria-haspopup")).toBe("menu");
    expect(btn.className).toMatch(/min-w-11/);
    expect(btn.className).toMatch(/min-h-11/);
  });
});

describe("ListRow — mobile menu open/close", () => {
  it("click '…' opens the menu Modal with all actions", () => {
    render(<ListRow content="x" actions={actions()} />);
    fireEvent.click(screen.getByRole("button", { name: "Aktionen" }));
    // Dialog appears
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    // Both actions rendered inside the menu panel
    const menuButtons = Array.from(dialog.querySelectorAll("button"));
    const labels = menuButtons.map((b) => b.textContent?.trim());
    expect(labels).toContain("Bearbeiten");
    expect(labels).toContain("Löschen");
  });
});

describe("ListRow — single-modal-stack invariant (Codex R1 #3)", () => {
  it("menu-modal is gone after action-click (action ran + modal closed)", () => {
    const editSpy = vi.fn();
    render(
      <ListRow
        content="x"
        actions={[
          { label: "Bearbeiten", onClick: editSpy },
          { label: "Löschen", onClick: vi.fn(), variant: "danger" },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aktionen" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    const dialog = screen.getByRole("dialog");
    const editBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Bearbeiten",
    )!;
    fireEvent.click(editBtn);

    // Action ran AND menu-modal is unmounted after the render cycle
    expect(editSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("when action opens a follow-up modal, only ONE dialog is mounted afterwards (no stack)", () => {
    // Stronger invariant: menu-modal must close BEFORE a follow-up modal
    // renders. This is the real-world scenario — e.g. Delete opens a
    // DeleteConfirm modal. If both modals ended up open simultaneously,
    // focus-trap and aria-modal semantics would collide.
    function Harness() {
      const [confirmOpen, setConfirmOpen] = useState(false);
      return (
        <>
          <ListRow
            content="x"
            actions={[
              { label: "Löschen", onClick: () => setConfirmOpen(true), variant: "danger" },
            ]}
          />
          <Modal
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            title="Follow-up"
          >
            <p>Folgemodale Body</p>
          </Modal>
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Aktionen" }));
    // Only the menu-modal is open
    expect(screen.getAllByRole("dialog").length).toBe(1);

    const dialog = screen.getByRole("dialog");
    const deleteBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Löschen",
    )!;
    fireEvent.click(deleteBtn);

    // Only ONE dialog exists after the click cycle — follow-up replaced menu
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs.length).toBe(1);
    expect(dialogs[0].textContent).toContain("Folgemodale Body");
  });
});

describe("ListRow — desktop button click hits action directly (no menu roundtrip)", () => {
  it("clicking a desktop inline button triggers action.onClick immediately", () => {
    const editSpy = vi.fn();
    const deleteSpy = vi.fn();
    const { container } = render(
      <ListRow
        content="x"
        actions={[
          { label: "Bearbeiten", onClick: editSpy },
          { label: "Löschen", onClick: deleteSpy, variant: "danger" },
        ]}
      />,
    );

    const desktopCluster = container.querySelector(".hidden.md\\:flex")!;
    const editBtn = Array.from(desktopCluster.querySelectorAll("button")).find(
      (b) => b.textContent === "Bearbeiten",
    )!;
    fireEvent.click(editBtn);

    expect(editSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).not.toHaveBeenCalled();
    // No dialog opened — direct action
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ListRow — variant & disabled", () => {
  it("variant='danger' applies text-red-600 styling in both desktop + mobile paths", () => {
    const { container } = render(
      <ListRow
        content="x"
        actions={[
          { label: "Bearbeiten", onClick: vi.fn() },
          { label: "Löschen", onClick: vi.fn(), variant: "danger" },
        ]}
      />,
    );

    // Desktop danger button
    const desktopCluster = container.querySelector(".hidden.md\\:flex")!;
    const desktopDelete = Array.from(desktopCluster.querySelectorAll("button")).find(
      (b) => b.textContent === "Löschen",
    )!;
    expect(desktopDelete.className).toMatch(/text-red-600/);

    // Open menu, inspect mobile danger button
    fireEvent.click(screen.getByRole("button", { name: "Aktionen" }));
    const dialog = screen.getByRole("dialog");
    const mobileDelete = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Löschen",
    )!;
    expect(mobileDelete.className).toMatch(/text-red-600/);
  });

  it("disabled action is rendered as <button disabled> in mobile menu and does not call onClick", () => {
    const onClickSpy = vi.fn();
    render(
      <ListRow
        content="x"
        actions={[
          { label: "Bearbeiten", onClick: vi.fn() },
          { label: "Gesperrt", onClick: onClickSpy, disabled: true },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aktionen" }));
    const dialog = screen.getByRole("dialog");
    const lockedBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Gesperrt",
    )!;
    expect(lockedBtn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(lockedBtn);
    expect(onClickSpy).not.toHaveBeenCalled();
  });
});

describe("ListRow — drag-drop prop forwarding (Codex R1 #1)", () => {
  it("forwards draggable + onDragStart + rowId onto the container div", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const { container } = render(
      <ListRow
        content={<span>x</span>}
        actions={actions()}
        draggable={true}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        rowId="row-42"
      />,
    );

    // Container is the first div child (has the row flex classes)
    const row = container.querySelector("[data-row-id='row-42']") as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.getAttribute("draggable")).toBe("true");

    fireEvent.dragStart(row);
    expect(onDragStart).toHaveBeenCalledTimes(1);

    fireEvent.dragEnd(row);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });
});

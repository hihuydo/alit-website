// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Modal } from "./Modal";

afterEach(() => cleanup());

describe("Modal A11y", () => {
  it("exposes role=dialog and aria-modal=true when open", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Titel">
        <button>OK</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("labels itself via aria-labelledby pointing at the title", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Meine Überschrift">
        <button>OK</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const title = document.getElementById(labelId!);
    expect(title?.textContent).toBe("Meine Überschrift");
  });

  it("moves initial focus into the dialog after open", () => {
    render(
      <Modal open={true} onClose={() => {}} title="T">
        <button>Erstes</button>
        <button>Zweites</button>
      </Modal>,
    );
    // First focusable inside the dialog is the X close button (rendered before children).
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Schließen");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="T">
        <button>OK</button>
      </Modal>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has an aria-label on the close button", () => {
    render(
      <Modal open={true} onClose={() => {}} title="T">
        <button>OK</button>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Schließen" })).toBeTruthy();
  });

  it("renders nothing when open=false", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="T">
        <button>OK</button>
      </Modal>,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("wraps Tab focus from last focusable back to first (focus-trap)", () => {
    render(
      <Modal open={true} onClose={() => {}} title="T">
        <button>Erstes</button>
        <button>Letztes</button>
      </Modal>,
    );
    const firstEl = screen.getByRole("button", { name: "Schließen" }); // × rendered first
    const lastEl = screen.getByRole("button", { name: "Letztes" });
    lastEl.focus();
    expect(document.activeElement).toBe(lastEl);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(firstEl);
  });

  it("wraps Shift+Tab focus from first focusable to last", () => {
    render(
      <Modal open={true} onClose={() => {}} title="T">
        <button>Erstes</button>
        <button>Letztes</button>
      </Modal>,
    );
    const firstEl = screen.getByRole("button", { name: "Schließen" });
    const lastEl = screen.getByRole("button", { name: "Letztes" });
    firstEl.focus();
    expect(document.activeElement).toBe(firstEl);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastEl);
  });

  it("returns focus to the opener element on close", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button data-testid="opener" onClick={() => setOpen(true)}>
            Öffnen
          </button>
          <Modal open={open} onClose={() => setOpen(false)} title="T">
            <button>OK</button>
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    fireEvent.click(opener);
    // Modal now open; first focusable is the × Schließen.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Schließen");
    fireEvent.keyDown(window, { key: "Escape" });
    // Modal closed → focus returned to opener.
    expect(document.activeElement).toBe(opener);
  });

  it("does NOT call onClose on Escape when disableClose=true", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="T" disableClose={true}>
        <button>OK</button>
      </Modal>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hides the × close button when disableClose=true", () => {
    render(
      <Modal open={true} onClose={() => {}} title="T" disableClose={true}>
        <button>OK</button>
      </Modal>,
    );
    expect(screen.queryByRole("button", { name: "Schließen" })).toBeNull();
  });

  it("does NOT call onClose on backdrop click when disableClose=true", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose} title="T" disableClose={true}>
        <button>OK</button>
      </Modal>,
    );
    const backdrop = container.querySelector(".fixed.inset-0");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
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
});

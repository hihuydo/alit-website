// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, renderHook, screen } from "@testing-library/react";
import { DirtyProvider, useDirty } from "./DirtyContext";

function mount() {
  const { result } = renderHook(() => useDirty(), {
    wrapper: ({ children }) => <DirtyProvider>{children}</DirtyProvider>,
  });
  return result;
}

afterEach(() => cleanup());

describe("DirtyProvider", () => {
  it("runs action immediately when no key is dirty", () => {
    const h = mount();
    const action = vi.fn();
    act(() => h.current.confirmDiscard(action));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Ungesicherte Änderungen verwerfen?")).toBeNull();
  });

  it("opens modal and defers action when a key is dirty", () => {
    const h = mount();
    act(() => h.current.setDirty("agenda", true));
    const action = vi.fn();
    act(() => h.current.confirmDiscard(action));
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByText("Ungesicherte Änderungen verwerfen?")).not.toBeNull();
  });

  it("runs the action when user clicks Verwerfen", () => {
    const h = mount();
    act(() => h.current.setDirty("journal", true));
    const action = vi.fn();
    act(() => h.current.confirmDiscard(action));
    fireEvent.click(screen.getByText("Verwerfen"));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Ungesicherte Änderungen verwerfen?")).toBeNull();
  });

  it("does NOT run the action when user clicks Zurück", () => {
    const h = mount();
    act(() => h.current.setDirty("journal", true));
    const action = vi.fn();
    act(() => h.current.confirmDiscard(action));
    fireEvent.click(screen.getByText("Zurück"));
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByText("Ungesicherte Änderungen verwerfen?")).toBeNull();
  });

  it("stays dirty while any single key is true", () => {
    const h = mount();
    act(() => {
      h.current.setDirty("agenda", true);
      h.current.setDirty("journal", true);
    });
    act(() => h.current.setDirty("agenda", false));
    const action = vi.fn();
    act(() => h.current.confirmDiscard(action));
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByText("Ungesicherte Änderungen verwerfen?")).not.toBeNull();
  });

  it("ignores further confirmDiscard calls while modal is open", () => {
    const h = mount();
    act(() => h.current.setDirty("projekte", true));
    const actionA = vi.fn();
    const actionB = vi.fn();
    act(() => h.current.confirmDiscard(actionA));
    // Second call must be ignored even though still dirty.
    act(() => h.current.confirmDiscard(actionB));
    fireEvent.click(screen.getByText("Verwerfen"));
    expect(actionA).toHaveBeenCalledTimes(1);
    expect(actionB).not.toHaveBeenCalled();
  });

  it("accepts a fresh confirmDiscard after the previous modal closed", () => {
    const h = mount();
    act(() => h.current.setDirty("alit", true));
    const actionA = vi.fn();
    act(() => h.current.confirmDiscard(actionA));
    fireEvent.click(screen.getByText("Zurück"));
    expect(actionA).not.toHaveBeenCalled();
    const actionB = vi.fn();
    act(() => h.current.confirmDiscard(actionB));
    // Still dirty, so second modal should open for actionB.
    fireEvent.click(screen.getByText("Verwerfen"));
    expect(actionB).toHaveBeenCalledTimes(1);
  });
});

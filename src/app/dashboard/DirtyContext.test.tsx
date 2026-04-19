// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { DirtyProvider, useDirty, type DirtyKey } from "./DirtyContext";

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

  // --- Flush-handler tests (spec v3.2 T1-T5) ---

  it("T1: Zurück runs flush handler synchronously while modal is still present", () => {
    const h = mount();
    act(() => h.current.setDirty("journal", true));
    let modalPresentAtCall = false;
    const handler = vi.fn(() => {
      modalPresentAtCall = screen.queryByText("Ungesicherte Änderungen verwerfen?") !== null;
    });
    act(() => {
      h.current.registerFlushHandler("journal", handler);
    });
    act(() => h.current.confirmDiscard(vi.fn()));
    fireEvent.click(screen.getByText("Zurück"));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(modalPresentAtCall).toBe(true);
    expect(screen.queryByText("Ungesicherte Änderungen verwerfen?")).toBeNull();
  });

  it("T2: Verwerfen does NOT call flush handlers", () => {
    const h = mount();
    act(() => h.current.setDirty("journal", true));
    const handler = vi.fn();
    act(() => {
      h.current.registerFlushHandler("journal", handler);
    });
    const action = vi.fn();
    act(() => h.current.confirmDiscard(action));
    fireEvent.click(screen.getByText("Verwerfen"));
    expect(handler).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("T3: selective flush — handler for non-dirty key is not called on Zurück", () => {
    const h = mount();
    // Agenda is dirty, journal handler is registered but NOT dirty.
    act(() => h.current.setDirty("agenda", true));
    const journalHandler = vi.fn();
    act(() => {
      h.current.registerFlushHandler("journal", journalHandler);
    });
    act(() => h.current.confirmDiscard(vi.fn()));
    fireEvent.click(screen.getByText("Zurück"));
    expect(journalHandler).not.toHaveBeenCalled();
  });

  it("T4: throw in flush handler does NOT block modal close (structured flush_failed log)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const h = mount();
      act(() => h.current.setDirty("journal", true));
      const thrower = vi.fn(() => {
        throw new Error("boom");
      });
      act(() => {
        h.current.registerFlushHandler("journal", thrower);
      });
      act(() => h.current.confirmDiscard(vi.fn()));
      fireEvent.click(screen.getByText("Zurück"));
      expect(thrower).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Ungesicherte Änderungen verwerfen?")).toBeNull();
      // Structured telemetry log: `{type: "flush_failed", key, error}`
      const firstCall = errorSpy.mock.calls[0]?.[0];
      expect(typeof firstCall).toBe("string");
      const parsed = JSON.parse(firstCall as string);
      expect(parsed).toMatchObject({ type: "flush_failed", key: "journal" });
      expect(parsed.error).toContain("boom");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("T7: successful flush emits structured flush_invoked log", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const h = mount();
      act(() => h.current.setDirty("journal", true));
      act(() => {
        h.current.registerFlushHandler("journal", vi.fn());
      });
      act(() => h.current.confirmDiscard(vi.fn()));
      fireEvent.click(screen.getByText("Zurück"));
      const matching = logSpy.mock.calls.find((c) => {
        if (typeof c[0] !== "string") return false;
        try {
          const p = JSON.parse(c[0]);
          return p.type === "flush_invoked" && p.key === "journal";
        } catch {
          return false;
        }
      });
      expect(matching).toBeDefined();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("T6: StrictMode double-mount — flush handler registered inside useEffect fires exactly once on Zurück", () => {
    // StrictMode dev-mode double-invokes useEffect:
    //   mount → effect run (register) → cleanup (unregister) → effect run (register)
    // After all that, the handler should end up registered exactly once.
    // If our register/unregister logic ever regressed to non-idempotent
    // cleanup (e.g. always `delete flushHandlersRef[key]`), the second
    // cleanup would wipe the newer registration and this test would fail.
    const handler = vi.fn();

    function FlushRegistrar({ dirtyKey }: { dirtyKey: DirtyKey }) {
      const { registerFlushHandler, setDirty } = useDirty();
      useEffect(() => {
        setDirty(dirtyKey, true);
        return registerFlushHandler(dirtyKey, handler);
      }, [registerFlushHandler, setDirty, dirtyKey]);
      return null;
    }

    // Capture the live context off a sibling so we can trigger confirmDiscard.
    let ctx!: ReturnType<typeof useDirty>;
    function Probe() {
      ctx = useDirty();
      return null;
    }

    render(
      <StrictMode>
        <DirtyProvider>
          <FlushRegistrar dirtyKey="journal" />
          <Probe />
        </DirtyProvider>
      </StrictMode>,
    );

    // Open confirm modal — must be dirty at this point (setDirty ran in effect).
    act(() => ctx.confirmDiscard(vi.fn()));
    expect(screen.queryByText("Ungesicherte Änderungen verwerfen?")).not.toBeNull();

    // Zurück flushes registered handlers — expect EXACTLY ONE invocation.
    fireEvent.click(screen.getByText("Zurück"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("T5: unregister is idempotent (newest-wins — stale cleanup does not clear newer handler)", () => {
    const h = mount();
    act(() => h.current.setDirty("journal", true));
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    let unregisterA!: () => void;
    let unregisterB!: () => void;
    act(() => {
      unregisterA = h.current.registerFlushHandler("journal", handlerA);
      unregisterB = h.current.registerFlushHandler("journal", handlerB);
    });
    // A's stale cleanup must be a no-op because B is now registered.
    act(() => unregisterA());
    act(() => h.current.confirmDiscard(vi.fn()));
    fireEvent.click(screen.getByText("Zurück"));
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledTimes(1);
    // Explicitly call B's unregister so the test harness has no leftover.
    act(() => unregisterB());
  });
});

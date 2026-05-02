// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import LoginPage from "./page";

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}));

vi.mock("../lib/dashboardFetch", () => ({
  seedCsrfToken: vi.fn(),
}));

afterEach(() => cleanup());
beforeEach(() => {
  replaceMock.mockReset();
  pushMock.mockReset();
});

describe("LoginPage", () => {
  it("uses router.replace (not push) on success so browser-back skips login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: async () => ({ success: true, csrfToken: "abc" }),
        } as Response),
      ),
    );
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("E-Mail"), {
      target: { value: "a@b.c" },
    });
    fireEvent.change(screen.getByLabelText("Passwort"), {
      target: { value: "pw12345678" },
    });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /Anmelden/i }).closest("form")!);
    });
    expect(replaceMock).toHaveBeenCalledWith("/dashboard/");
    expect(pushMock).not.toHaveBeenCalled();
  });
});

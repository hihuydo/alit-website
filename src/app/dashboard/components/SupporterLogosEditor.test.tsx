// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  SupporterLogosEditor,
  SUPPORTER_LOGOS_HARD_CAP,
  DASHBOARD_SUPPORTER_STRINGS,
} from "./SupporterLogosEditor";
import type { SupporterLogo } from "@/lib/supporter-logos";

interface LibraryItem {
  id: number;
  public_id: string;
  filename: string;
  mime_type: string;
  size: number;
}

const libraryItems: LibraryItem[] = [
  {
    id: 1,
    public_id: "logo-pro-helvetia",
    filename: "pro-helvetia.png",
    mime_type: "image/png",
    size: 5_000,
  },
  {
    id: 2,
    public_id: "logo-migros",
    filename: "migros.png",
    mime_type: "image/png",
    size: 6_000,
  },
];

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, data: libraryItems }),
  })) as unknown as typeof fetch;

  const OriginalImage = globalThis.Image;
  vi.stubGlobal(
    "Image",
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 200;
      naturalHeight = 80;
      _src = "";
      get src() {
        return this._src;
      }
      set src(value: string) {
        this._src = value;
        Promise.resolve().then(() => {
          if (value.includes("__probe_fail__")) {
            this.onerror?.();
          } else {
            this.onload?.();
          }
        });
      }
    } as unknown as typeof OriginalImage,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function logo(over: Partial<SupporterLogo> = {}): SupporterLogo {
  return {
    public_id: "logo-x",
    alt: null,
    width: 200,
    height: 80,
    ...over,
  };
}

describe("SupporterLogosEditor — empty state", () => {
  it("renders the section label and Add-button when value is empty", () => {
    render(<SupporterLogosEditor value={[]} onChange={() => {}} />);
    expect(screen.getByTestId("supporter-logos-editor")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: DASHBOARD_SUPPORTER_STRINGS.addLogo }),
    ).toBeTruthy();
    // No grid rendered while empty
    expect(screen.queryByTestId("supporter-logo-grid")).toBeNull();
  });

  it("Add-button is enabled when value is below cap", () => {
    render(<SupporterLogosEditor value={[]} onChange={() => {}} />);
    const btn = screen.getByRole("button", {
      name: DASHBOARD_SUPPORTER_STRINGS.addLogo,
    });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("SupporterLogosEditor — grid rendering (Sprint M3 follow-up: image-grid parity)", () => {
  it("renders one tile per logo with edit + remove buttons", () => {
    render(
      <SupporterLogosEditor
        value={[logo({ public_id: "a" }), logo({ public_id: "b" })]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("supporter-logo-grid")).toBeTruthy();
    expect(screen.getByTestId("supporter-logo-tile-0")).toBeTruthy();
    expect(screen.getByTestId("supporter-logo-tile-1")).toBeTruthy();
    expect(screen.getByTestId("supporter-logo-edit-0")).toBeTruthy();
    expect(screen.getByTestId("supporter-logo-remove-0")).toBeTruthy();
    expect(document.querySelectorAll("img").length).toBe(2);
  });

  it("calls onChange with filtered list when remove (✕) clicked", () => {
    const onChange = vi.fn();
    render(
      <SupporterLogosEditor
        value={[logo({ public_id: "a" }), logo({ public_id: "b" })]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("supporter-logo-remove-0"));
    expect(onChange).toHaveBeenCalledWith([logo({ public_id: "b" })]);
  });

  it("opens the alt-edit modal when tile clicked", () => {
    render(
      <SupporterLogosEditor
        value={[logo({ public_id: "a", alt: "Pro Helvetia" })]}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("supporter-logo-edit-0"));
    expect(screen.getByTestId("supporter-alt-input")).toBeTruthy();
    expect(screen.getByTestId("supporter-alt-save")).toBeTruthy();
    expect(screen.getByTestId("supporter-alt-cancel")).toBeTruthy();
    // Pre-filled with current alt
    expect((screen.getByTestId("supporter-alt-input") as HTMLInputElement).value)
      .toBe("Pro Helvetia");
  });
});

describe("SupporterLogosEditor — alt edit modal", () => {
  it("Save writes trimmed alt back into onChange", () => {
    const onChange = vi.fn();
    render(
      <SupporterLogosEditor
        value={[logo({ public_id: "a", alt: null })]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("supporter-logo-edit-0"));
    fireEvent.change(screen.getByTestId("supporter-alt-input") as HTMLInputElement, {
      target: { value: "  Pro Helvetia  " },
    });
    fireEvent.click(screen.getByTestId("supporter-alt-save"));
    expect(onChange).toHaveBeenCalledWith([
      { public_id: "a", alt: "Pro Helvetia", width: 200, height: 80 },
    ]);
  });

  it("Save with empty/whitespace-only alt writes null", () => {
    const onChange = vi.fn();
    render(
      <SupporterLogosEditor
        value={[logo({ public_id: "a", alt: "Old" })]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("supporter-logo-edit-0"));
    fireEvent.change(screen.getByTestId("supporter-alt-input") as HTMLInputElement, {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("supporter-alt-save"));
    expect(onChange).toHaveBeenCalledWith([
      { public_id: "a", alt: null, width: 200, height: 80 },
    ]);
  });

  it("Cancel does NOT call onChange", () => {
    const onChange = vi.fn();
    render(
      <SupporterLogosEditor
        value={[logo({ public_id: "a", alt: "Old" })]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("supporter-logo-edit-0"));
    fireEvent.change(screen.getByTestId("supporter-alt-input") as HTMLInputElement, {
      target: { value: "Other" },
    });
    fireEvent.click(screen.getByTestId("supporter-alt-cancel"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("SupporterLogosEditor — drag-reorder (Codex PR #142 R1 [P2] regression guard)", () => {
  function fakeDataTransfer() {
    return {
      effectAllowed: "",
      types: [],
      getData: () => "",
      setData: () => {},
    };
  }

  it("forward drag (A→C in [A,B,C,D]) lands A in C's slot, not past it", () => {
    const onChange = vi.fn();
    render(
      <SupporterLogosEditor
        value={[
          logo({ public_id: "a" }),
          logo({ public_id: "b" }),
          logo({ public_id: "c" }),
          logo({ public_id: "d" }),
        ]}
        onChange={onChange}
      />,
    );
    const tileA = screen.getByTestId("supporter-logo-tile-0");
    const tileC = screen.getByTestId("supporter-logo-tile-2");
    fireEvent.dragStart(tileA, { dataTransfer: fakeDataTransfer() });
    fireEvent.drop(tileC, { dataTransfer: fakeDataTransfer() });
    const result = onChange.mock.calls[0][0] as SupporterLogo[];
    // A lands in C's slot — buggy behaviour was [b,c,a,d] (one too far right).
    expect(result.map((l) => l.public_id)).toEqual(["b", "a", "c", "d"]);
  });

  it("backward drag (D→B in [A,B,C,D]) lands D in B's slot", () => {
    const onChange = vi.fn();
    render(
      <SupporterLogosEditor
        value={[
          logo({ public_id: "a" }),
          logo({ public_id: "b" }),
          logo({ public_id: "c" }),
          logo({ public_id: "d" }),
        ]}
        onChange={onChange}
      />,
    );
    const tileD = screen.getByTestId("supporter-logo-tile-3");
    const tileB = screen.getByTestId("supporter-logo-tile-1");
    fireEvent.dragStart(tileD, { dataTransfer: fakeDataTransfer() });
    fireEvent.drop(tileB, { dataTransfer: fakeDataTransfer() });
    const result = onChange.mock.calls[0][0] as SupporterLogo[];
    expect(result.map((l) => l.public_id)).toEqual(["a", "d", "b", "c"]);
  });

  it("drop on self is a no-op (no onChange call)", () => {
    const onChange = vi.fn();
    render(
      <SupporterLogosEditor
        value={[logo({ public_id: "a" }), logo({ public_id: "b" })]}
        onChange={onChange}
      />,
    );
    const tileA = screen.getByTestId("supporter-logo-tile-0");
    fireEvent.dragStart(tileA, { dataTransfer: fakeDataTransfer() });
    fireEvent.drop(tileA, { dataTransfer: fakeDataTransfer() });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("SupporterLogosEditor — cap-disable", () => {
  it("disables Add-button at cap", () => {
    const fullList = Array.from({ length: SUPPORTER_LOGOS_HARD_CAP }, (_, i) =>
      logo({ public_id: `a-${i}` }),
    );
    render(<SupporterLogosEditor value={fullList} onChange={() => {}} />);
    const btn = screen.getByRole("button", {
      name: new RegExp(DASHBOARD_SUPPORTER_STRINGS.addLogo),
    });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SupporterLogosEditor — picker integration + probe", () => {
  it("opens MediaPicker in multi-mode when Add-button clicked", async () => {
    render(<SupporterLogosEditor value={[]} onChange={() => {}} />);
    fireEvent.click(
      screen.getByRole("button", { name: DASHBOARD_SUPPORTER_STRINGS.addLogo }),
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Bestätigen/ })).toBeTruthy();
    });
  });

  it("appends probed logos to value on confirm", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <SupporterLogosEditor value={[]} onChange={onChange} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: DASHBOARD_SUPPORTER_STRINGS.addLogo }),
    );
    await waitFor(() => {
      expect(
        container.querySelector("img[alt='pro-helvetia.png']"),
      ).toBeTruthy();
    });
    fireEvent.click(
      container.querySelector("img[alt='pro-helvetia.png']")!.closest("button")!,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Bestätigen \(1\)/ }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([
      {
        public_id: "logo-pro-helvetia",
        alt: null,
        width: 200,
        height: 80,
      },
    ]);
  });

  it("renders probe-failure-inline-banner with dismiss-X-button when probe throws", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 99,
            public_id: "__probe_fail__",
            filename: "broken.png",
            mime_type: "image/png",
            size: 1,
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const onChange = vi.fn();
    const { container } = render(
      <SupporterLogosEditor value={[]} onChange={onChange} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: DASHBOARD_SUPPORTER_STRINGS.addLogo }),
    );
    await waitFor(() => {
      expect(container.querySelector("img[alt='broken.png']")).toBeTruthy();
    });
    fireEvent.click(
      container.querySelector("img[alt='broken.png']")!.closest("button")!,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Bestätigen \(1\)/ }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByTestId("supporter-probe-failure-banner")).toBeTruthy();
    expect(onChange.mock.calls[0][0]).toEqual([
      { public_id: "__probe_fail__", alt: null, width: null, height: null },
    ]);
  });
});

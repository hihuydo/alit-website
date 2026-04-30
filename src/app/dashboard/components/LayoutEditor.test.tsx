// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// NO static import of LayoutEditor — would bypass vi.doMock.

describe("LayoutEditor", () => {
  const mockDashboardFetch = vi.fn();
  let LayoutEditor: typeof import("./LayoutEditor").LayoutEditor;

  beforeEach(async () => {
    vi.resetModules();
    mockDashboardFetch.mockReset();
    vi.doMock("@/app/dashboard/lib/dashboardFetch", () => ({
      dashboardFetch: mockDashboardFetch,
    }));
    ({ LayoutEditor } = await import("./LayoutEditor"));
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  function mockGetResponse(body: object) {
    mockDashboardFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response);
  }

  function mockPutResponse(status: number, body: object = {}) {
    mockDashboardFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response);
  }

  function mockDeleteResponse(status: number) {
    mockDashboardFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({}),
    } as unknown as Response);
  }

  function makeBlocks(ids: string[]) {
    return ids.map((id) => ({ id, text: `text-${id}`, isHeading: false }));
  }

  function autoBody(opts?: {
    slides?: { blocks: { id: string; text: string; isHeading: boolean }[] }[];
    layoutVersion?: string | null;
    contentHash?: string;
    imageCount?: number;
    availableImages?: number;
    warnings?: string[];
    mode?: "auto" | "manual" | "stale";
  }) {
    return {
      mode: opts?.mode ?? "auto",
      // 16 lowercase hex chars to match the server's
      // contentHash: z.string().regex(/^[0-9a-f]{16}$/) Zod schema.
      contentHash: opts?.contentHash ?? "deadbeef12345678",
      layoutVersion: opts?.layoutVersion ?? null,
      imageCount: opts?.imageCount ?? 0,
      availableImages: opts?.availableImages ?? 0,
      warnings: opts?.warnings ?? [],
      slides: opts?.slides ?? [
        { blocks: makeBlocks(["b1", "b2"]) },
        { blocks: makeBlocks(["b3", "b4"]) },
      ],
    };
  }

  // ── C-1 ─────────────────────────────────────────────────────────────────
  it("C-1: renders loading text while fetch in flight", async () => {
    // Pending fetch — never resolves during the test.
    mockDashboardFetch.mockReturnValueOnce(new Promise(() => {}));
    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);
    expect(screen.getByText("Lädt …")).toBeTruthy();
  });

  // ── C-2 ─────────────────────────────────────────────────────────────────
  it("C-2: GET 200 mode=auto: shows slide-cards, no banner, save disabled, reset hidden", async () => {
    mockGetResponse(autoBody());
    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);

    await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());
    expect(screen.getByText("text-b2")).toBeTruthy();
    expect(screen.getByText("text-b3")).toBeTruthy();
    expect(screen.getByText("text-b4")).toBeTruthy();
    // No banners.
    expect(screen.queryByRole("alert")).toBeNull();
    // Save disabled (not dirty).
    const saveBtn = screen.getByRole("button", { name: "Speichern" });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    // Reset NOT shown (layoutVersion === null).
    expect(screen.queryByRole("button", { name: "Auf Auto-Layout zurücksetzen" })).toBeNull();
  });

  // ── C-3 ─────────────────────────────────────────────────────────────────
  it("C-3: GET fails, retry-button increments refetchKey and recovers", async () => {
    mockDashboardFetch.mockRejectedValueOnce(new Error("network"));
    mockGetResponse(autoBody());

    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);

    await waitFor(() => expect(screen.getByText("Erneut versuchen")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());
    expect(mockDashboardFetch.mock.calls.length).toBe(2);
    expect(screen.queryByText("Erneut versuchen")).toBeNull();
  });

  // ── C-4 ─────────────────────────────────────────────────────────────────
  it("C-4: clicking Nächste Slide moves block, save becomes enabled (isDirty=true)", async () => {
    mockGetResponse(autoBody());
    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);

    await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

    // Find b1's "Nächste Slide" button (first block, slide 0).
    const moveNextButtons = screen.getAllByRole("button", { name: "Nächste Slide →" });
    fireEvent.click(moveNextButtons[0]);

    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
  });

  // ── C-5 ─────────────────────────────────────────────────────────────────
  it("C-5: round-trip revert restores isDirty=false (snapshot-diff regression)", async () => {
    mockGetResponse(autoBody());
    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);

    await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

    // Move b2 (slide 0, blockIdx 1) to next slide → [[b1],[b2,b3,b4]]
    const moveNextButtons = screen.getAllByRole("button", { name: "Nächste Slide →" });
    // moveNextButtons[0]=b1, [1]=b2, [2]=b3, [3]=b4
    fireEvent.click(moveNextButtons[1]);

    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });

    // Now b2 is at slide 1 / blockIdx 0. Move it back via "Vorherige Slide".
    // Re-query buttons after re-render.
    const movePrevButtons = screen.getAllByRole("button", { name: "← Vorherige Slide" });
    // After move: slide 0 has [b1]; slide 1 has [b2,b3,b4]. b2 is the
    // first block of slide 1 → 2nd "Vorherige Slide" button overall.
    fireEvent.click(movePrevButtons[1]);

    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });
  });

  // ── C-6 ─────────────────────────────────────────────────────────────────
  it("C-6: clicking Neue Slide ab hier splits, slide count grows by 1", async () => {
    mockGetResponse(autoBody());
    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);

    await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

    // Initially 2 slides.
    expect(screen.getAllByText(/^Slide \d+$/).length).toBe(2);

    // Click "Neue Slide ab hier" on b2 (slide 0, blockIdx 1).
    const splitButtons = screen.getAllByRole("button", { name: "Neue Slide ab hier" });
    fireEvent.click(splitButtons[1]);

    await waitFor(() => {
      expect(screen.getAllByText(/^Slide \d+$/).length).toBe(3);
    });
  });

  // ── C-7 ─────────────────────────────────────────────────────────────────
  it("C-7: Save 200 → refetchKey++ → re-fetch with new layoutVersion, isDirty=false", async () => {
    mockGetResponse(autoBody());
    mockPutResponse(200);
    mockGetResponse(
      autoBody({
        layoutVersion: "newversionhash16",
        mode: "manual",
      }),
    );

    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);
    await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

    // Make an edit so save is enabled.
    fireEvent.click(screen.getAllByRole("button", { name: "Nächste Slide →" })[0]);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    // After re-fetch with manual + new layoutVersion: reset button appears.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Auf Auto-Layout zurücksetzen" }),
      ).toBeTruthy();
    });

    const saveBtn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    expect(mockDashboardFetch.mock.calls.length).toBe(3); // GET, PUT, GET
  });

  // ── C-8 ─────────────────────────────────────────────────────────────────
  it("C-8: Save 409 → content_changed banner + save disabled", async () => {
    mockGetResponse(autoBody());
    mockPutResponse(409, { success: false, error: "content_changed" });

    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);
    await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Nächste Slide →" })[0]);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Der Beitragsinhalt hat sich geändert/),
      ).toBeTruthy();
    });
    const saveBtn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  // ── C-9 ─────────────────────────────────────────────────────────────────
  it("C-9: Save 412 → layout_modified banner (save still enabled for retry)", async () => {
    mockGetResponse(autoBody());
    mockPutResponse(412, { success: false, error: "layout_modified" });

    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);
    await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Nächste Slide →" })[0]);
    // Wait for save to enable (matching C-8 pattern — without this the
    // second click can fire while React hasn't flushed setEditedSlides).
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Layout wurde von einem anderen Admin geändert/),
      ).toBeTruthy();
    });
    // Save NOT disabled (not in saveDisabled list — user can retry).
    const saveBtn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  // ── C-10 ────────────────────────────────────────────────────────────────
  it("C-10: too_many_slides_for_grid client-side validation, no PUT fired", async () => {
    // Fixture: 5 slides × 2 blocks each, hasGrid=true (imageCount>=1 AND
    // availableImages>=1).
    mockGetResponse(
      autoBody({
        imageCount: 1,
        availableImages: 1,
        slides: [
          { blocks: makeBlocks(["b0", "b1"]) },
          { blocks: makeBlocks(["b2", "b3"]) },
          { blocks: makeBlocks(["b4", "b5"]) },
          { blocks: makeBlocks(["b6", "b7"]) },
          { blocks: makeBlocks(["b8", "b9"]) },
        ],
      }),
    );

    render(<LayoutEditor itemId={42} locale="de" imageCount={1} />);
    await waitFor(() => expect(screen.getByText("text-b0")).toBeTruthy());

    // Each iteration: click the first ENABLED split-button. canSplit is
    // false for blockIdx=0 (button disabled), true for blockIdx>=1. After
    // a split the source slide becomes two single-block slides whose
    // split-buttons are both disabled, so the next "first enabled" is
    // automatically the next still-2-block slide. Repeat 5 times to grow
    // 5 slides → 10.
    const clickFirstEnabledSplit = () => {
      const enabled = screen
        .getAllByRole("button", { name: "Neue Slide ab hier" })
        .filter((b) => !(b as HTMLButtonElement).disabled);
      fireEvent.click(enabled[0]);
    };

    clickFirstEnabledSplit();
    await waitFor(() => expect(screen.getAllByText(/^Slide \d+$/).length).toBe(6));
    clickFirstEnabledSplit();
    await waitFor(() => expect(screen.getAllByText(/^Slide \d+$/).length).toBe(7));
    clickFirstEnabledSplit();
    await waitFor(() => expect(screen.getAllByText(/^Slide \d+$/).length).toBe(8));
    clickFirstEnabledSplit();
    await waitFor(() => expect(screen.getAllByText(/^Slide \d+$/).length).toBe(9));
    clickFirstEnabledSplit();
    await waitFor(() => expect(screen.getAllByText(/^Slide \d+$/).length).toBe(10));

    // Now click Save. validateSlideCount fails (10>9 with hasGrid=true) →
    // banner shown, NO PUT fired.
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Bei aktivem Bild-Grid maximal 9 Text-Slides/),
      ).toBeTruthy();
    });

    // Only the initial GET — no PUT.
    expect(mockDashboardFetch.mock.calls.length).toBe(1);

    // Banner-auto-clear regression-guard (R2 [HIGH-1] adjust-state-during-
    // render pattern): merge a slide back below the cap → the banner
    // MUST disappear without any explicit "dismiss" action. If a future
    // refactor removes the snapshotForBannerClear block (or converts it
    // to a useEffect), this assertion fails.
    const movePrevButtons = screen
      .getAllByRole("button", { name: "← Vorherige Slide" })
      .filter((b) => !(b as HTMLButtonElement).disabled);
    fireEvent.click(movePrevButtons[0]);

    await waitFor(() => {
      expect(
        screen.queryByText(/Bei aktivem Bild-Grid maximal 9 Text-Slides/),
      ).toBeNull();
    });
  });

  // ── C-11 ────────────────────────────────────────────────────────────────
  describe("C-11: stale + orphan flows", () => {
    it("(a) GET mode=stale → stale banner + reset visible", async () => {
      mockGetResponse(
        autoBody({
          mode: "stale",
          layoutVersion: "abc1234567890def",
        }),
      );
      render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);

      await waitFor(() =>
        expect(screen.getByText("Inhalt wurde verändert")).toBeTruthy(),
      );
      // Reset button visible inside stale banner.
      const resetButtons = screen.getAllByRole("button", {
        name: "Auf Auto-Layout zurücksetzen",
      });
      expect(resetButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("(b) Click reset (stale) → DELETE 204 → re-fetch shows auto + reset gone", async () => {
      mockGetResponse(
        autoBody({
          mode: "stale",
          layoutVersion: "abc1234567890def",
        }),
      );
      mockDeleteResponse(204);
      mockGetResponse(autoBody({ layoutVersion: null }));

      render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);
      await waitFor(() =>
        expect(screen.getByText("Inhalt wurde verändert")).toBeTruthy(),
      );

      // Click reset (the one inside the stale banner).
      fireEvent.click(
        screen.getAllByRole("button", {
          name: "Auf Auto-Layout zurücksetzen",
        })[0],
      );

      // After re-fetch: auto mode, no stale banner, no reset button.
      await waitFor(() => expect(screen.queryByText("Inhalt wurde verändert")).toBeNull());
      expect(
        screen.queryByRole("button", { name: "Auf Auto-Layout zurücksetzen" }),
      ).toBeNull();
    });

    it("(c) GET orphan + layoutVersion=null → orphan banner + empty placeholder + NO reset button", async () => {
      mockGetResponse(
        autoBody({
          mode: "stale",
          slides: [],
          warnings: ["orphan_image_count"],
          layoutVersion: null,
          imageCount: 3,
          availableImages: 1,
        }),
      );

      render(<LayoutEditor itemId={42} locale="de" imageCount={3} />);
      await waitFor(() =>
        expect(
          screen.getByText("Bild-Anzahl überschreitet verfügbare Bilder"),
        ).toBeTruthy(),
      );
      expect(screen.getByText(/Keine Slides — bitte Bild-Anzahl/)).toBeTruthy();
      // Stale banner is suppressed by orphan precedence.
      expect(screen.queryByText("Inhalt wurde verändert")).toBeNull();
      // No reset button.
      expect(
        screen.queryByRole("button", { name: "Verwaisten Override entfernen" }),
      ).toBeNull();
    });

    it("(e) DELETE non-204 → delete_failed banner + editorMode back to ready (DK-9)", async () => {
      // Regression-guard for the else-branch of handleReset. A refactor
      // collapsing if/204/else into a single setRefetchKey would pass
      // every other test in this file but silently break the error path.
      mockGetResponse(
        autoBody({
          mode: "manual",
          layoutVersion: "abc1234567890def",
        }),
      );
      mockDeleteResponse(500);

      render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);
      await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

      const resetBtn = screen.getByRole("button", {
        name: "Auf Auto-Layout zurücksetzen",
      });
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Zurücksetzen fehlgeschlagen/),
        ).toBeTruthy();
      });

      // editorMode must return to "ready" so user can retry. Reset button
      // remains enabled (resetDisabled checks layoutVersion + editorMode,
      // both of which are now in the retry-friendly state).
      const resetAfter = screen.getByRole("button", {
        name: "Auf Auto-Layout zurücksetzen",
      }) as HTMLButtonElement;
      expect(resetAfter.disabled).toBe(false);

      // Initial GET + failed DELETE — no second GET (refetch only on 204).
      expect(mockDashboardFetch.mock.calls.length).toBe(2);
    });

    it("(d) GET orphan + layoutVersion!=null → resetOrphan button → DELETE → re-fetch", async () => {
      mockGetResponse(
        autoBody({
          mode: "stale",
          slides: [],
          warnings: ["orphan_image_count"],
          layoutVersion: "aabbccdd11223344",
          imageCount: 3,
          availableImages: 1,
        }),
      );
      mockDeleteResponse(204);
      mockGetResponse(autoBody({ layoutVersion: null }));

      render(<LayoutEditor itemId={42} locale="de" imageCount={3} />);
      await waitFor(() =>
        expect(
          screen.getByText("Bild-Anzahl überschreitet verfügbare Bilder"),
        ).toBeTruthy(),
      );

      const orphanResetBtn = screen.getByRole("button", {
        name: "Verwaisten Override entfernen",
      });
      fireEvent.click(orphanResetBtn);

      // After post-delete GET: auto state with layoutVersion=null →
      // orphan banner gone, resetOrphan button gone.
      await waitFor(() =>
        expect(
          screen.queryByText("Bild-Anzahl überschreitet verfügbare Bilder"),
        ).toBeNull(),
      );
      expect(
        screen.queryByRole("button", { name: "Verwaisten Override entfernen" }),
      ).toBeNull();
    });
  });

  // ── C-12 ────────────────────────────────────────────────────────────────
  it("C-12: Save 422 incomplete_layout → banner + save disabled, no refetch", async () => {
    mockGetResponse(autoBody());
    mockPutResponse(422, { success: false, error: "incomplete_layout" });

    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);
    await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Nächste Slide →" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Nicht alle Inhalts-Blöcke sind im Layout enthalten/),
      ).toBeTruthy();
    });
    const saveBtn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    // Only initial GET + the failed PUT — no third fetch.
    expect(mockDashboardFetch.mock.calls.length).toBe(2);
  });

  // ── C-13 ────────────────────────────────────────────────────────────────
  describe("C-13: discardKey-revert + first-render-guard (all REQUIRED)", () => {
    it("(a) discardKey 0→1 reverts editedSlides to initialSlides", async () => {
      mockGetResponse(autoBody());

      const { rerender } = render(
        <LayoutEditor itemId={42} locale="de" imageCount={0} discardKey={0} />,
      );
      await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

      fireEvent.click(screen.getAllByRole("button", { name: "Nächste Slide →" })[0]);
      await waitFor(() => {
        const btn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
      });

      // Bump discardKey → effect reverts editedSlides.
      rerender(
        <LayoutEditor itemId={42} locale="de" imageCount={0} discardKey={1} />,
      );

      await waitFor(() => {
        const btn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
      });
    });

    it("(b) re-render with unchanged discardKey does NOT re-revert", async () => {
      mockGetResponse(autoBody());

      const { rerender } = render(
        <LayoutEditor itemId={42} locale="de" imageCount={0} discardKey={1} />,
      );
      await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

      // Edit.
      fireEvent.click(screen.getAllByRole("button", { name: "Nächste Slide →" })[0]);
      await waitFor(() => {
        const btn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
      });

      // Re-render with SAME discardKey → effect should NOT fire.
      rerender(
        <LayoutEditor itemId={42} locale="de" imageCount={0} discardKey={1} />,
      );

      // Still dirty.
      const btn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it("(c) initial mount with high discardKey does NOT revert (isFirstDiscardKey-guard)", async () => {
      mockGetResponse(autoBody());

      render(
        <LayoutEditor itemId={42} locale="de" imageCount={0} discardKey={5} />,
      );
      await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

      // Edit.
      fireEvent.click(screen.getAllByRole("button", { name: "Nächste Slide →" })[0]);

      // Wait one tick so any erroneous discardKey-effect would have fired.
      await waitFor(() => {
        const btn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
      });

      // Edit must persist — guard skipped first-render effect even with
      // non-zero discardKey.
      const btn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });

  // ── C-14 ────────────────────────────────────────────────────────────────
  it("C-14: onDirtyChange fires with false on init, true on edit, false on revert", async () => {
    const mockSpy = vi.fn();
    mockGetResponse(autoBody());

    const { rerender } = render(
      <LayoutEditor
        itemId={42}
        locale="de"
        imageCount={0}
        discardKey={0}
        onDirtyChange={mockSpy}
      />,
    );

    await waitFor(() => expect(screen.getByText("text-b1")).toBeTruthy());

    // After initial fetch the spy was called with false (clean state).
    expect(mockSpy.mock.calls.some(([v]) => v === false)).toBe(true);

    mockSpy.mockClear();

    // Edit.
    fireEvent.click(screen.getAllByRole("button", { name: "Nächste Slide →" })[0]);
    await waitFor(() => expect(mockSpy).toHaveBeenCalledWith(true));

    mockSpy.mockClear();

    // Revert via discardKey.
    rerender(
      <LayoutEditor
        itemId={42}
        locale="de"
        imageCount={0}
        discardKey={1}
        onDirtyChange={mockSpy}
      />,
    );
    await waitFor(() => expect(mockSpy).toHaveBeenCalledWith(false));
  });

  // ── C-15b (Codex R1 [P2] regression) ───────────────────────────────────
  it("C-15b: auto-mode + too_many_blocks_for_layout warning → save STAYS disabled without edit", async () => {
    // The route emits this warning ALSO for auto/stale layouts where it
    // slice()s the tail (drops block IDs). Saving without an edit would
    // PUT a body with missing block-IDs and hit the server's
    // incomplete_layout 422. canSaveMergedLayout MUST require mode==="manual".
    mockGetResponse(
      autoBody({
        mode: "auto",
        warnings: ["too_many_blocks_for_layout"],
        slides: Array.from({ length: 9 }, (_, i) => ({
          blocks: makeBlocks([`b${i}`]),
        })),
        layoutVersion: null,
      }),
    );

    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);
    await waitFor(() =>
      expect(screen.getByText("Layout zu lang für die Anzeige")).toBeTruthy(),
    );

    // Save MUST be disabled — no merged-layout shortcut for auto-mode.
    const saveBtn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    // Reset NOT shown (layoutVersion === null).
    expect(
      screen.queryByRole("button", { name: "Auf Auto-Layout zurücksetzen" }),
    ).toBeNull();

    // Only the initial GET — no PUT.
    expect(mockDashboardFetch.mock.calls.length).toBe(1);
  });

  // ── C-15c (Codex R2 [P2] regression) ───────────────────────────────────
  it("C-15c: auto over-cap + EDIT → save STAYS disabled (incomplete-block PUT prevented)", async () => {
    // Codex R2: even after editing visible slides, auto-mode + warning
    // means hidden tail blocks were sliced (route.ts:184-200). Any PUT
    // would 422 with incomplete_layout. saveDisabled MUST include
    // isAutoOverCap to block this regardless of isDirty.
    mockGetResponse(
      autoBody({
        mode: "auto",
        warnings: ["too_many_blocks_for_layout"],
        // 9 slides × 2 blocks each (auto-mode happens to have multi-block
        // groups so we can edit and trigger isDirty).
        slides: [
          { blocks: makeBlocks(["b0", "b1"]) },
          { blocks: makeBlocks(["b2", "b3"]) },
          { blocks: makeBlocks(["b4", "b5"]) },
          { blocks: makeBlocks(["b6", "b7"]) },
          { blocks: makeBlocks(["b8", "b9"]) },
        ],
        layoutVersion: null,
      }),
    );

    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);
    await waitFor(() =>
      expect(screen.getByText("Layout zu lang für die Anzeige")).toBeTruthy(),
    );

    // Auto-specific banner body (NOT the manual one).
    expect(
      screen.getByText(/Renderer kürzt automatisch das Ende/),
    ).toBeTruthy();

    // Edit: move b1 to next slide → editedSlides changes, isDirty=true.
    fireEvent.click(screen.getAllByRole("button", { name: "Nächste Slide →" })[1]);

    // Wait one tick to make sure any erroneous save-enable would have fired.
    await waitFor(() => {
      // Slide structure changed (b1 moved away from slide 0 → slide 0 now
      // has 1 block instead of 2).
      const slides = screen.getAllByText(/^Slide \d+$/);
      expect(slides.length).toBeGreaterThanOrEqual(5);
    });

    // CRITICAL: save MUST remain disabled despite isDirty=true.
    const saveBtn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    // Only the initial GET — no PUT fired.
    expect(mockDashboardFetch.mock.calls.length).toBe(1);
  });

  // ── C-15 ────────────────────────────────────────────────────────────────
  it("C-15: canSaveMergedLayout — save enabled without edit, PUT with merged slides", async () => {
    const mergedSlides = Array.from({ length: 9 }, (_, i) => ({
      blocks: makeBlocks([`b${i}`]),
    }));
    mockGetResponse(
      autoBody({
        mode: "manual",
        warnings: ["too_many_blocks_for_layout"],
        slides: mergedSlides,
        layoutVersion: "deadbeefcafe1234",
      }),
    );
    mockPutResponse(200);
    mockGetResponse(
      autoBody({
        mode: "manual",
        slides: mergedSlides,
        layoutVersion: "newversion000001",
      }),
    );

    render(<LayoutEditor itemId={42} locale="de" imageCount={0} />);
    await waitFor(() =>
      expect(screen.getByText("Layout zu lang für die Anzeige")).toBeTruthy(),
    );

    // Manual-specific banner body (NOT the auto one).
    expect(
      screen.getByText(/zusammengeführten Stand als neuen Override/),
    ).toBeTruthy();

    // Save MUST be enabled despite no user edit (canSaveMergedLayout path).
    const saveBtn = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);

    await waitFor(() => expect(mockDashboardFetch.mock.calls.length).toBe(3));

    // Inspect the PUT call (2nd fetch).
    const putCall = mockDashboardFetch.mock.calls[1];
    const putOpts = putCall[1] as RequestInit;
    expect(putOpts.method).toBe("PUT");
    const putBody = JSON.parse(putOpts.body as string);
    expect(putBody.slides.length).toBe(9);
    expect(putBody.slides[0].blocks).toEqual(["b0"]);
    expect(putBody.slides[8].blocks).toEqual(["b8"]);
    expect(putBody.layoutVersion).toBe("deadbeefcafe1234");
  });
});

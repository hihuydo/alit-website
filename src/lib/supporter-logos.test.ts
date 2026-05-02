import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockQuery = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockQuery.mockReset();
  vi.doMock("@/lib/db", () => ({ default: { query: mockQuery } }));
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/db");
});

function baseLogo(overrides: Record<string, unknown> = {}) {
  return {
    public_id: "11111111-1111-1111-1111-111111111111",
    alt: null,
    width: 200,
    height: 80,
    ...overrides,
  };
}

describe("validateSupporterLogos — basic shape", () => {
  it("returns empty array on undefined input (Partial-PUT-friendly)", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos(undefined);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it("returns empty array on empty array (no FK-call needed)", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects non-array input", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos(
      "not-an-array" as unknown as never,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/must be an array/i);
  });
});

describe("validateSupporterLogos — cap enforcement", () => {
  it("accepts 8 logos (boundary)", async () => {
    const ids = Array.from(
      { length: 8 },
      (_, i) => `aaaaaaaa-${i.toString().padStart(4, "0")}-aaaa-aaaa-aaaaaaaaaaaa`,
    );
    mockQuery.mockResolvedValueOnce({
      rows: ids.map((id) => ({ public_id: id, mime_type: "image/png" })),
    });
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos(
      ids.map((id) => baseLogo({ public_id: id })),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(8);
  });

  it("rejects 9 logos with 'Too many supporter logos'", async () => {
    const ids = Array.from(
      { length: 9 },
      (_, i) => `aaaaaaaa-${i.toString().padStart(4, "0")}-aaaa-aaaa-aaaaaaaaaaaa`,
    );
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos(
      ids.map((id) => baseLogo({ public_id: id })),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/too many supporter logos/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("validateSupporterLogos — public_id checks", () => {
  it("rejects missing public_id with 'Each logo needs a public_id'", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([
      baseLogo({ public_id: undefined }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/each logo needs a public_id/i);
  });

  it("rejects whitespace-only public_id", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([baseLogo({ public_id: "   " })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/each logo needs a public_id/i);
  });

  it("rejects public_id > 100 chars", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const longId = "a".repeat(101);
    const result = await validateSupporterLogos([baseLogo({ public_id: longId })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/public_id too long/i);
  });

  it("rejects duplicate public_id", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([
      baseLogo({ public_id: "dupe" }),
      baseLogo({ public_id: "dupe" }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/duplicate supporter logo/i);
  });
});

describe("validateSupporterLogos — alt handling", () => {
  it("trims alt and stores trimmed value", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc", mime_type: "image/png" }] });
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([
      baseLogo({ public_id: "abc", alt: "  Pro Helvetia  " }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].alt).toBe("Pro Helvetia");
  });

  it("treats whitespace-only alt as null", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc", mime_type: "image/png" }] });
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([
      baseLogo({ public_id: "abc", alt: "   " }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].alt).toBeNull();
  });

  it("treats undefined alt as null", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc", mime_type: "image/png" }] });
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([
      baseLogo({ public_id: "abc", alt: undefined }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].alt).toBeNull();
  });

  it("rejects non-string alt", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([
      baseLogo({ alt: 42 as unknown as string }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/alt must be a string/i);
  });

  it("rejects alt longer than 500 chars", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const longAlt = "x".repeat(501);
    const result = await validateSupporterLogos([baseLogo({ alt: longAlt })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/alt text too long/i);
  });
});

describe("validateSupporterLogos — width/height", () => {
  it("accepts numeric width/height and rounds them", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc", mime_type: "image/png" }] });
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([
      baseLogo({ public_id: "abc", width: 200.6, height: 80.4 }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].width).toBe(201);
    expect(result.value[0].height).toBe(80);
  });

  it("accepts null width/height (probe-failed path)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc", mime_type: "image/png" }] });
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([
      baseLogo({ public_id: "abc", width: null, height: null }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].width).toBeNull();
    expect(result.value[0].height).toBeNull();
  });

  it("treats undefined width as null", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc", mime_type: "image/png" }] });
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([
      baseLogo({ public_id: "abc", width: undefined, height: undefined }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].width).toBeNull();
    expect(result.value[0].height).toBeNull();
  });

  it("rejects negative width", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([baseLogo({ width: -10 })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/width must be a positive number/i);
  });

  it("rejects width above MAX_PIXEL_DIMENSION", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([baseLogo({ width: 999_999 })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/width must be a positive number/i);
  });

  it("rejects string height (parseInt-trap regression)", async () => {
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([
      baseLogo({ height: "80" as unknown as number }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/height must be a positive number/i);
  });
});

describe("validateSupporterLogos — FK checks", () => {
  it("rejects unknown media reference", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([
      baseLogo({ public_id: "non-existent" }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unknown media reference/i);
  });

  it("accepts image/png mime", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ public_id: "abc", mime_type: "image/png" }],
    });
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([baseLogo({ public_id: "abc" })]);
    expect(result.ok).toBe(true);
  });

  it("rejects video/mp4 with 'Supporter logo must be an image' (Codex PR-R1 [P2])", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ public_id: "vid-1", mime_type: "video/mp4" }],
    });
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([baseLogo({ public_id: "vid-1" })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/supporter logo must be an image/i);
  });

  it("rejects application/pdf with 'Supporter logo must be an image'", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ public_id: "doc-1", mime_type: "application/pdf" }],
    });
    const { validateSupporterLogos } = await import("./supporter-logos");
    const result = await validateSupporterLogos([baseLogo({ public_id: "doc-1" })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/supporter logo must be an image/i);
  });

  it("propagates DB errors (caller turns them into 500)", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));
    const { validateSupporterLogos } = await import("./supporter-logos");
    await expect(
      validateSupporterLogos([baseLogo({ public_id: "abc" })]),
    ).rejects.toThrow(/connection refused/i);
  });
});

describe("loadSupporterSlideLogos", () => {
  it("returns SupporterSlideLogo with dataUrl from media + dimensions from JSONB", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ mime_type: "image/png", data: Buffer.from("PNGbytes") }],
    });
    const { loadSupporterSlideLogos } = await import("./supporter-logos");
    const result = await loadSupporterSlideLogos([
      { public_id: "abc", alt: "Pro Helvetia", width: 200, height: 80 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      public_id: "abc",
      alt: "Pro Helvetia",
      width: 200,
      height: 80,
    });
    expect(result[0].dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("filters out null results when media row is missing", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ mime_type: "image/png", data: Buffer.from("ok") }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const { loadSupporterSlideLogos } = await import("./supporter-logos");
    const result = await loadSupporterSlideLogos([
      { public_id: "have", alt: null, width: 100, height: 50 },
      { public_id: "missing", alt: null, width: 100, height: 50 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].public_id).toBe("have");
  });

  it("isolates per-logo failures via try/catch (Promise.all does not abort)", async () => {
    mockQuery
      .mockRejectedValueOnce(new Error("DB down"))
      .mockResolvedValueOnce({
        rows: [{ mime_type: "image/png", data: Buffer.from("ok") }],
      });
    const { loadSupporterSlideLogos } = await import("./supporter-logos");
    const result = await loadSupporterSlideLogos([
      { public_id: "fail", alt: null, width: 100, height: 50 },
      { public_id: "ok", alt: null, width: 100, height: 50 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].public_id).toBe("ok");
  });

  it("preserves null width/height from JSONB (probe-failed roundtrip)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ mime_type: "image/png", data: Buffer.from("ok") }],
    });
    const { loadSupporterSlideLogos } = await import("./supporter-logos");
    const result = await loadSupporterSlideLogos([
      { public_id: "abc", alt: null, width: null, height: null },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].width).toBeNull();
    expect(result[0].height).toBeNull();
  });
});

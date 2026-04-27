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

function baseImage(overrides: Record<string, unknown> = {}) {
  return {
    public_id: "abc-123",
    orientation: "landscape" as const,
    width: 1200,
    height: 800,
    alt: null,
    ...overrides,
  };
}

describe("validateImages — crop validation", () => {
  it("accepts cropX=50, cropY=50 and includes them in output", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc-123" }] });
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([baseImage({ cropX: 50, cropY: 50 })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].cropX).toBe(50);
    expect(result.value[0].cropY).toBe(50);
  });

  it("rejects cropX=-1 with 'crop value out of range'", async () => {
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([baseImage({ cropX: -1 })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/crop value out of range/i);
  });

  it("rejects cropX=101 with 'crop value out of range'", async () => {
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([baseImage({ cropX: 101 })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/crop value out of range/i);
  });

  it("rejects cropX as string '50' (parseInt-trap regression)", async () => {
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([
      baseImage({ cropX: "50" as unknown as number }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/crop value out of range/i);
  });

  it("accepts cropX=0 boundary and includes it in output", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc-123" }] });
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([baseImage({ cropX: 0, cropY: 50 })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].cropX).toBe(0);
  });

  it("accepts cropX=100 boundary and includes it in output", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc-123" }] });
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([baseImage({ cropX: 100, cropY: 50 })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].cropX).toBe(100);
  });

  it("accepts cropX=33.33 fraction and includes it in output", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc-123" }] });
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([baseImage({ cropX: 33.33, cropY: 50 })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].cropX).toBeCloseTo(33.33, 5);
  });

  it("preserves output without cropX/cropY when both are undefined", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc-123" }] });
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([baseImage()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].cropX).toBeUndefined();
    expect(result.value[0].cropY).toBeUndefined();
  });

  it("treats cropX=null as preserve (output without cropX, no 400)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc-123" }] });
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([
      baseImage({ cropX: null, cropY: 70 }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].cropX).toBeUndefined();
    expect(result.value[0].cropY).toBe(70);
  });

  it("treats cropY=null as preserve (output without cropY, no 400) — symmetry", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc-123" }] });
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([
      baseImage({ cropX: 30, cropY: null }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].cropX).toBe(30);
    expect(result.value[0].cropY).toBeUndefined();
  });

  it("accepts fit='cover' and 'contain'", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc-123" }, { public_id: "def-456" }] });
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([
      baseImage({ public_id: "abc-123", fit: "cover" }),
      baseImage({ public_id: "def-456", fit: "contain" }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].fit).toBe("cover");
    expect(result.value[1].fit).toBe("contain");
  });

  it("rejects invalid fit value with 400", async () => {
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([baseImage({ fit: "stretch" })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/fit/i);
  });

  it("treats fit=null and fit=undefined as preserve (output without fit field)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ public_id: "abc-123" }, { public_id: "def-456" }] });
    const { validateImages } = await import("./agenda-images");
    const result = await validateImages([
      baseImage({ public_id: "abc-123", fit: null }),
      baseImage({ public_id: "def-456" /* no fit */ }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].fit).toBeUndefined();
    expect(result.value[1].fit).toBeUndefined();
  });
});

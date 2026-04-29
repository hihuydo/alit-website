// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("loadGridImageDataUrls — per-image try/catch isolation (DK-20, Codex R1 #3)", () => {
  // Bug class commit 4bfe4ce reproduced: a single broken row used to take
  // down the whole slide because Promise.all rejects on the first throw.
  // Per-image try/catch turns failed loads into null → empty cell, no 5xx.
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    mockQuery.mockReset();
    vi.doMock("./db", () => ({ default: { query: mockQuery } }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("./db");
  });

  it("(a) all loads succeed → returns array of dataUrls in order", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ mime_type: "image/png", data: Buffer.from("AAA") }],
      })
      .mockResolvedValueOnce({
        rows: [{ mime_type: "image/jpeg", data: Buffer.from("BBB") }],
      })
      .mockResolvedValueOnce({
        rows: [{ mime_type: "image/png", data: Buffer.from("CCC") }],
      });

    const { loadGridImageDataUrls } = await import("./instagram-images");
    const out = await loadGridImageDataUrls(["a", "b", "c"], 0);

    expect(out).toHaveLength(3);
    expect(out[0]).toMatch(/^data:image\/png;base64,/);
    expect(out[1]).toMatch(/^data:image\/jpeg;base64,/);
    expect(out[2]).toMatch(/^data:image\/png;base64,/);
  });

  it("(b) one row missing → that slot is null, others succeed", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ mime_type: "image/png", data: Buffer.from("AAA") }],
      })
      .mockResolvedValueOnce({ rows: [] }) // missing row
      .mockResolvedValueOnce({
        rows: [{ mime_type: "image/png", data: Buffer.from("CCC") }],
      });

    const { loadGridImageDataUrls } = await import("./instagram-images");
    const out = await loadGridImageDataUrls(["a", "b", "c"], 0);

    expect(out).toHaveLength(3);
    expect(out[0]).toMatch(/^data:image\/png;base64,/);
    expect(out[1]).toBeNull();
    expect(out[2]).toMatch(/^data:image\/png;base64,/);
  });

  it("(c) one row throws → that slot is null, others succeed (Promise.all all-or-nothing prevented)", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ mime_type: "image/png", data: Buffer.from("AAA") }],
      })
      .mockRejectedValueOnce(new Error("DB blew up on uuid-b"))
      .mockResolvedValueOnce({
        rows: [{ mime_type: "image/png", data: Buffer.from("CCC") }],
      });

    const { loadGridImageDataUrls } = await import("./instagram-images");
    const out = await loadGridImageDataUrls(["a", "b", "c"], 0);

    expect(out).toHaveLength(3);
    expect(out[0]).toMatch(/^data:image\/png;base64,/);
    expect(out[1]).toBeNull();
    expect(out[2]).toMatch(/^data:image\/png;base64,/);
  });

  it("(d) non-image MIME type → that slot is null", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ mime_type: "application/pdf", data: Buffer.from("PDF") }],
    });

    const { loadGridImageDataUrls } = await import("./instagram-images");
    const out = await loadGridImageDataUrls(["x"], 0);

    expect(out).toEqual([null]);
  });

  it("(e) empty input → empty output, no DB calls", async () => {
    const { loadGridImageDataUrls } = await import("./instagram-images");
    const out = await loadGridImageDataUrls([], 0);

    expect(out).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { SignJWT } from "jose";

const JWT_SECRET = "test-secret-at-least-32-chars-long-submission-form-aa";

async function makeToken(sub: string, tv: number): Promise<string> {
  return new SignJWT({ sub, tv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function buildCsrf(userId: number, tv: number): Promise<string> {
  const { buildCsrfToken } = await import("@/lib/csrf");
  return buildCsrfToken(JWT_SECRET, userId, tv);
}

function fakeReq(opts: {
  method: "GET" | "PUT";
  sessionCookie?: string;
  csrfCookie?: string;
  csrfHeader?: string;
  body?: unknown;
  contentLengthOverride?: number;
}) {
  const cookies = new Map<string, { value: string }>();
  if (opts.sessionCookie) {
    cookies.set("__Host-session", { value: opts.sessionCookie });
    cookies.set("session", { value: opts.sessionCookie });
  }
  if (opts.csrfCookie) cookies.set("__Host-csrf", { value: opts.csrfCookie });
  const bodyText = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const headers = new Map<string, string>();
  if (opts.csrfHeader) headers.set("x-csrf-token", opts.csrfHeader);
  if (opts.body !== undefined) {
    headers.set(
      "content-length",
      String(opts.contentLengthOverride ?? bodyText.length),
    );
  }
  return {
    method: opts.method,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: (name: string) => cookies.get(name) },
    text: async () => bodyText,
  } as unknown as import("next/server").NextRequest;
}

const FULL_VALID_DATA = {
  mitgliedschaft: { de: {}, fr: {} },
  newsletter: { de: {}, fr: {} },
};

describe("/api/dashboard/site-settings/submission-form-texts/", () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  const mockClientQuery = vi.fn();
  const mockClientRelease = vi.fn();
  const mockAuditLog = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockAuditLog.mockReset();
    mockConnect.mockImplementation(async () => ({
      query: mockClientQuery,
      release: mockClientRelease,
    }));
    vi.doMock("@/lib/db", () => ({
      default: { query: mockQuery, connect: mockConnect },
    }));
    vi.doMock("@/lib/audit", () => ({ auditLog: mockAuditLog }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/audit");
  });

  describe("GET", () => {
    it("401 without session cookie", async () => {
      const { GET } = await import("./route");
      const res = await GET(fakeReq({ method: "GET" }));
      expect(res).toBeInstanceOf(NextResponse);
      expect(res.status).toBe(401);
    });

    it("returns canonical empty shape + null etag when row absent", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ token_version: 5 }] }) // requireAuth
        .mockResolvedValueOnce({ rows: [] }); // route SELECT
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({ method: "GET", sessionCookie: await makeToken("42", 5) }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true, data: FULL_VALID_DATA, etag: null });
    });

    it("returns canonical-ISO etag (Date.toISOString format) when row present", async () => {
      const updatedAt = new Date("2026-05-01T13:42:08.123Z");
      mockQuery
        .mockResolvedValueOnce({ rows: [{ token_version: 5 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              value: JSON.stringify({
                mitgliedschaft: { de: { heading: "Custom DE" }, fr: {} },
                newsletter: { de: {}, fr: {} },
              }),
              updated_at: updatedAt,
            },
          ],
        });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({ method: "GET", sessionCookie: await makeToken("42", 5) }),
      );
      const body = await res.json();
      expect(body.etag).toBe("2026-05-01T13:42:08.123Z");
      expect(body.data.mitgliedschaft.de.heading).toBe("Custom DE");
      // Structurally-normalized: missing leaves get backfilled to {}.
      expect(body.data.mitgliedschaft.fr).toEqual({});
      expect(body.data.newsletter.de).toEqual({});
      expect(body.data.newsletter.fr).toEqual({});
    });

    it("backfills missing top-level keys when stored partial", async () => {
      const updatedAt = new Date("2026-05-01T00:00:00.000Z");
      mockQuery
        .mockResolvedValueOnce({ rows: [{ token_version: 5 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              value: JSON.stringify({
                mitgliedschaft: { de: { heading: "X" } },
                // newsletter missing entirely
              }),
              updated_at: updatedAt,
            },
          ],
        });
      const { GET } = await import("./route");
      const res = await GET(
        fakeReq({ method: "GET", sessionCookie: await makeToken("42", 5) }),
      );
      const body = await res.json();
      expect(body.data.newsletter).toEqual({ de: {}, fr: {} });
      expect(body.data.mitgliedschaft.fr).toEqual({});
    });
  });

  describe("PUT validation", () => {
    it("401 without session cookie", async () => {
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({ method: "PUT", body: { data: FULL_VALID_DATA, etag: null } }),
      );
      expect(res.status).toBe(401);
    });

    it("403 when CSRF missing", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          body: { data: FULL_VALID_DATA, etag: null },
        }),
      );
      expect(res.status).toBe(403);
    });

    it("400 when body lacks data wrapper", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: FULL_VALID_DATA, // missing { data, etag } wrapper
        }),
      );
      expect(res.status).toBe(400);
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("400 when body missing etag wrapper", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { data: FULL_VALID_DATA }, // missing etag
        }),
      );
      expect(res.status).toBe(400);
    });

    it("400 when missing top-level form key", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { data: { mitgliedschaft: { de: {}, fr: {} } }, etag: null },
        }),
      );
      expect(res.status).toBe(400);
    });

    it("400 when missing locale key", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            data: {
              mitgliedschaft: { de: {} }, // fr missing
              newsletter: { de: {}, fr: {} },
            },
            etag: null,
          },
        }),
      );
      expect(res.status).toBe(400);
    });

    it("400 on Zod-strict unknown leaf field", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            data: {
              mitgliedschaft: { de: { bogus: "leak" }, fr: {} },
              newsletter: { de: {}, fr: {} },
            },
            etag: null,
          },
        }),
      );
      expect(res.status).toBe(400);
    });

    it("400 on oversized body (>256KB content-length)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { data: FULL_VALID_DATA, etag: null },
          contentLengthOverride: 257 * 1024,
        }),
      );
      expect(res.status).toBe(400);
      expect(mockConnect).not.toHaveBeenCalled();
    });
  });

  describe("PUT happy path + transaction sequencing", () => {
    it("first save (DB row missing AND body etag null) succeeds, returns new canonical-ISO etag", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ token_version: 5 }] }) // requireAuth
        .mockResolvedValueOnce({ rows: [{ email: "admin@a.ch" }] }); // resolveActorEmail
      const updatedAt = new Date("2026-05-01T10:00:00.000Z");
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE — empty (first save)
        .mockResolvedValueOnce({ rows: [{ updated_at: updatedAt }] }) // INSERT ... RETURNING
        .mockResolvedValueOnce({}); // COMMIT
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            data: {
              mitgliedschaft: { de: { heading: "First DE" }, fr: {} },
              newsletter: { de: {}, fr: {} },
            },
            etag: null,
          },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.etag).toBe("2026-05-01T10:00:00.000Z");
      expect(body.data.mitgliedschaft.de.heading).toBe("First DE");
      // Transaction sequence
      expect(mockClientQuery.mock.calls[0][0]).toBe("BEGIN");
      expect(mockClientQuery.mock.calls[1][0]).toMatch(/FOR UPDATE/);
      expect(mockClientQuery.mock.calls[2][0]).toMatch(/INSERT INTO site_settings/);
      expect(mockClientQuery.mock.calls[3][0]).toBe("COMMIT");
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it("subsequent save with valid etag commits + returns new etag", async () => {
      const oldUpdatedAt = new Date("2026-05-01T09:00:00.000Z");
      const newUpdatedAt = new Date("2026-05-01T10:00:00.000Z");
      mockQuery
        .mockResolvedValueOnce({ rows: [{ token_version: 5 }] })
        .mockResolvedValueOnce({ rows: [{ email: "admin@a.ch" }] });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              value: JSON.stringify({
                mitgliedschaft: { de: { heading: "Old" }, fr: {} },
                newsletter: { de: {}, fr: {} },
              }),
              updated_at: oldUpdatedAt,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ updated_at: newUpdatedAt }] })
        .mockResolvedValueOnce({}); // COMMIT
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            data: {
              mitgliedschaft: { de: { heading: "New" }, fr: {} },
              newsletter: { de: {}, fr: {} },
            },
            etag: oldUpdatedAt.toISOString(),
          },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.etag).toBe(newUpdatedAt.toISOString());
    });

    it("audit emits exactly one row per changed form×locale combo", async () => {
      const oldUpdatedAt = new Date("2026-05-01T09:00:00.000Z");
      const newUpdatedAt = new Date("2026-05-01T10:00:00.000Z");
      mockQuery
        .mockResolvedValueOnce({ rows: [{ token_version: 5 }] })
        .mockResolvedValueOnce({ rows: [{ email: "admin@a.ch" }] });
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [
            {
              value: JSON.stringify({
                mitgliedschaft: { de: { heading: "Old M-DE" }, fr: {} },
                newsletter: { de: {}, fr: { privacy: "Old NL-FR" } },
              }),
              updated_at: oldUpdatedAt,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ updated_at: newUpdatedAt }] })
        .mockResolvedValueOnce({});
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            data: {
              // Change only mitgliedschaft.de.heading + newsletter.fr.privacy
              mitgliedschaft: { de: { heading: "New M-DE" }, fr: {} },
              newsletter: { de: {}, fr: { privacy: "New NL-FR" } },
            },
            etag: oldUpdatedAt.toISOString(),
          },
        }),
      );
      expect(res.status).toBe(200);
      expect(mockAuditLog).toHaveBeenCalledTimes(2);
      const events = mockAuditLog.mock.calls.map((c) => ({
        event: c[0],
        form: c[1].form,
        locale: c[1].locale,
        changed_fields: c[1].changed_fields,
      }));
      expect(events).toEqual(
        expect.arrayContaining([
          { event: "submission_form_texts_update", form: "mitgliedschaft", locale: "de", changed_fields: ["heading"] },
          { event: "submission_form_texts_update", form: "newsletter", locale: "fr", changed_fields: ["privacy"] },
        ]),
      );
    });

    it("no-op PUT (state-equal payload) commits but emits 0 audit rows", async () => {
      const oldUpdatedAt = new Date("2026-05-01T09:00:00.000Z");
      const newUpdatedAt = new Date("2026-05-01T10:00:00.000Z");
      const stored = {
        mitgliedschaft: { de: { heading: "Same" }, fr: {} },
        newsletter: { de: {}, fr: {} },
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ token_version: 5 }] })
        .mockResolvedValueOnce({ rows: [{ email: "admin@a.ch" }] });
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{ value: JSON.stringify(stored), updated_at: oldUpdatedAt }],
        })
        .mockResolvedValueOnce({ rows: [{ updated_at: newUpdatedAt }] })
        .mockResolvedValueOnce({});
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { data: stored, etag: oldUpdatedAt.toISOString() },
        }),
      );
      expect(res.status).toBe(200);
      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it("first-save with all 30 fields populated emits up to 4 audit rows", async () => {
      const newUpdatedAt = new Date("2026-05-01T10:00:00.000Z");
      mockQuery
        .mockResolvedValueOnce({ rows: [{ token_version: 5 }] })
        .mockResolvedValueOnce({ rows: [{ email: "admin@a.ch" }] });
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ updated_at: newUpdatedAt }] })
        .mockResolvedValueOnce({});
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            data: {
              mitgliedschaft: {
                de: { heading: "H", intro: "I" },
                fr: { heading: "Hf" },
              },
              newsletter: {
                de: { privacy: "P" },
                fr: {},
              },
            },
            etag: null,
          },
        }),
      );
      expect(res.status).toBe(200);
      // mitgliedschaft.de + mitgliedschaft.fr + newsletter.de = 3 audit rows
      // newsletter.fr is empty → 0 changed_fields → no audit row
      expect(mockAuditLog).toHaveBeenCalledTimes(3);
    });
  });

  describe("PUT 409 stale_etag", () => {
    it("returns 409 when DB etag differs from body etag (no UPSERT, no audit)", async () => {
      const dbUpdatedAt = new Date("2026-05-01T10:00:00.000Z");
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{ value: "{}", updated_at: dbUpdatedAt }],
        })
        .mockResolvedValueOnce({}); // ROLLBACK
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: {
            data: FULL_VALID_DATA,
            etag: "2026-05-01T08:00:00.000Z", // stale
          },
        }),
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("stale_etag");
      // Sequence: BEGIN, SELECT FOR UPDATE, ROLLBACK — no INSERT
      expect(mockClientQuery.mock.calls[0][0]).toBe("BEGIN");
      expect(mockClientQuery.mock.calls[1][0]).toMatch(/FOR UPDATE/);
      expect(mockClientQuery.mock.calls[2][0]).toBe("ROLLBACK");
      expect(mockAuditLog).not.toHaveBeenCalled();
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it("returns 409 when DB row exists but body etag is null (concurrency-safe first-save guard)", async () => {
      const dbUpdatedAt = new Date("2026-05-01T10:00:00.000Z");
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{ value: "{}", updated_at: dbUpdatedAt }],
        })
        .mockResolvedValueOnce({}); // ROLLBACK
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { data: FULL_VALID_DATA, etag: null },
        }),
      );
      expect(res.status).toBe(409);
    });
  });

  describe("PUT transaction error handling", () => {
    it("rolls back + 500 when UPSERT throws", async () => {
      const oldUpdatedAt = new Date("2026-05-01T09:00:00.000Z");
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{ value: "{}", updated_at: oldUpdatedAt }],
        })
        .mockRejectedValueOnce(new Error("upsert exploded")) // INSERT
        .mockResolvedValueOnce({}); // ROLLBACK
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { data: FULL_VALID_DATA, etag: oldUpdatedAt.toISOString() },
        }),
      );
      expect(res.status).toBe(500);
      // Last client.query call is ROLLBACK (not COMMIT)
      const lastCall = mockClientQuery.mock.calls[mockClientQuery.mock.calls.length - 1];
      expect(lastCall[0]).toBe("ROLLBACK");
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it("returns 500 when pool.connect itself throws — does NOT call release", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ token_version: 5 }] });
      mockConnect.mockRejectedValueOnce(new Error("pool exhausted"));
      const csrf = await buildCsrf(42, 5);
      const { PUT } = await import("./route");
      const res = await PUT(
        fakeReq({
          method: "PUT",
          sessionCookie: await makeToken("42", 5),
          csrfCookie: csrf,
          csrfHeader: csrf,
          body: { data: FULL_VALID_DATA, etag: null },
        }),
      );
      expect(res.status).toBe(500);
      expect(mockClientRelease).not.toHaveBeenCalled();
    });
  });
});

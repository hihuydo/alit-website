import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("session-version", () => {
  let querySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("getTokenVersion", () => {
    it("returns 0 when row is missing (fresh DB / first call for this user,env)", async () => {
      querySpy = vi.fn().mockResolvedValue({ rows: [] });
      vi.doMock("./db", () => ({ default: { query: querySpy } }));
      const { getTokenVersion } = await import("./session-version");

      const result = await getTokenVersion(42, "prod");

      expect(result).toBe(0);
      expect(querySpy).toHaveBeenCalledTimes(1);
      const [sql, params] = querySpy.mock.calls[0];
      expect(sql).toContain("SELECT token_version FROM admin_session_version");
      expect(sql).toContain("WHERE user_id = $1 AND env = $2");
      expect(params).toEqual([42, "prod"]);
    });

    it("returns the stored token_version when row exists", async () => {
      querySpy = vi.fn().mockResolvedValue({ rows: [{ token_version: 7 }] });
      vi.doMock("./db", () => ({ default: { query: querySpy } }));
      const { getTokenVersion } = await import("./session-version");

      expect(await getTokenVersion(1, "staging")).toBe(7);
    });

    it("env-scope: prod and staging are distinct reads", async () => {
      querySpy = vi.fn()
        .mockResolvedValueOnce({ rows: [{ token_version: 5 }] })   // prod
        .mockResolvedValueOnce({ rows: [{ token_version: 2 }] });  // staging
      vi.doMock("./db", () => ({ default: { query: querySpy } }));
      const { getTokenVersion } = await import("./session-version");

      expect(await getTokenVersion(1, "prod")).toBe(5);
      expect(await getTokenVersion(1, "staging")).toBe(2);
      expect(querySpy.mock.calls[0][1]).toEqual([1, "prod"]);
      expect(querySpy.mock.calls[1][1]).toEqual([1, "staging"]);
    });
  });

  describe("bumpTokenVersionForLogout", () => {
    it("returns new token_version on success (existing row bumped)", async () => {
      querySpy = vi.fn().mockResolvedValue({ rows: [{ token_version: 8 }] });
      vi.doMock("./db", () => ({ default: { query: querySpy } }));
      const { bumpTokenVersionForLogout } = await import("./session-version");

      const result = await bumpTokenVersionForLogout(1, "prod", 7);

      expect(result).toBe(8);
      expect(querySpy).toHaveBeenCalledTimes(1);
      const [sql, params] = querySpy.mock.calls[0];
      expect(sql).toContain("INSERT INTO admin_session_version");
      expect(sql).toContain("ON CONFLICT (user_id, env)");
      expect(sql).toContain("DO UPDATE SET token_version");
      expect(sql).toContain("WHERE admin_session_version.token_version = $3");
      expect(sql).toContain("RETURNING token_version");
      expect(params).toEqual([1, "prod", 7]);
    });

    it("returns the INSERT-path value when row did not exist (first logout)", async () => {
      // PostgreSQL returns the inserted row's token_version (1) when the
      // INSERT path fires.
      querySpy = vi.fn().mockResolvedValue({ rows: [{ token_version: 1 }] });
      vi.doMock("./db", () => ({ default: { query: querySpy } }));
      const { bumpTokenVersionForLogout } = await import("./session-version");

      // Caller passed expectedTv=0 (getTokenVersion returned 0 earlier)
      expect(await bumpTokenVersionForLogout(1, "prod", 0)).toBe(1);
    });

    it("returns null on TOCTOU conflict (concurrent dual-tab logout)", async () => {
      // Second concurrent call's DO UPDATE ... WHERE matches no rows,
      // RETURNING is empty.
      querySpy = vi.fn().mockResolvedValue({ rows: [] });
      vi.doMock("./db", () => ({ default: { query: querySpy } }));
      const { bumpTokenVersionForLogout } = await import("./session-version");

      const result = await bumpTokenVersionForLogout(1, "prod", 7);

      expect(result).toBe(null);
    });

    it("env-scope: prod bump does not affect staging row", async () => {
      querySpy = vi.fn().mockResolvedValue({ rows: [{ token_version: 3 }] });
      vi.doMock("./db", () => ({ default: { query: querySpy } }));
      const { bumpTokenVersionForLogout } = await import("./session-version");

      await bumpTokenVersionForLogout(1, "staging", 2);

      const [, params] = querySpy.mock.calls[0];
      expect(params).toEqual([1, "staging", 2]);
    });
  });
});

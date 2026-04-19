/**
 * Client-side dashboard fetch wrapper (Sprint T1-S).
 *
 * Wraps the native `fetch` for all authenticated mutation call-sites in
 * the dashboard UI:
 *   1. Attaches the CSRF token as `x-csrf-token` on state-changing
 *      methods. The token is cached in module scope; lazy-fetched on
 *      first use via `GET /api/auth/csrf`.
 *   2. On `403` with body `code:"csrf_missing"` or `code:"csrf_invalid"`
 *      — refresh the token once, retry the request.
 *   3. On `401` — full-page navigate to `/dashboard/login/` so the user
 *      can re-authenticate. This happens after another tab's logout or
 *      when the layout tv-check already cleared cookies.
 *
 * Login-page seed: the login POST returns `{csrfToken}` in its body.
 * The login handler calls `seedCsrfToken(token)` so the first mutation
 * after login skips the refresh round-trip entirely.
 *
 * Non-mutation (GET) callers should use plain `fetch` — CSRF is not
 * required and routing through this helper would add latency/noise.
 */

let cachedCsrfToken: string | null = null;
const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const CSRF_REFRESH_CODES = new Set(["csrf_missing", "csrf_invalid"]);

/**
 * Seed the module-scope cache. Called by the login page after receiving
 * `{csrfToken}` in the 200 response body.
 */
export function seedCsrfToken(token: string): void {
  cachedCsrfToken = token;
}

/** Exposed for tests — resets the cache so each test starts clean. */
export function clearCsrfCacheForTest(): void {
  cachedCsrfToken = null;
}

/** Exposed for tests — reads the current cache value. */
export function getCsrfCacheForTest(): string | null {
  return cachedCsrfToken;
}

async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/csrf", {
      method: "GET",
      credentials: "same-origin",
    });
    if (res.status === 401) {
      handle401();
      return null;
    }
    if (!res.ok) return null;
    const body = (await res.json()) as { csrfToken?: string };
    if (typeof body.csrfToken !== "string") return null;
    cachedCsrfToken = body.csrfToken;
    return body.csrfToken;
  } catch {
    return null;
  }
}

function handle401(): void {
  if (typeof window !== "undefined") {
    window.location.href = "/dashboard/login/";
  }
}

function attachCsrfHeader(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("x-csrf-token", token);
  return { ...init, headers };
}

async function isCsrfFailure(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const cloned = res.clone();
    const body = (await cloned.json()) as { code?: string };
    return (
      typeof body.code === "string" && CSRF_REFRESH_CODES.has(body.code)
    );
  } catch {
    return false;
  }
}

/**
 * Authenticated fetch with CSRF attach + 403-refresh-retry + 401-redirect.
 * Returns the raw `Response` — callers are free to `await res.json()`
 * or inspect `res.status` as they would with plain `fetch`.
 */
export async function dashboardFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();

  if (!MUTATION_METHODS.has(method)) {
    // GET/HEAD/OPTIONS — no CSRF needed
    const res = await fetch(url, { credentials: "same-origin", ...init });
    if (res.status === 401) handle401();
    return res;
  }

  // Mutation path — ensure we have a token, attach, retry on 403 csrf-code
  let token = cachedCsrfToken;
  if (token === null) {
    token = await fetchCsrfToken();
    if (token === null) {
      // Couldn't obtain a token — let the caller see the eventual 403
      // rather than silently erroring. Attach nothing; server will
      // respond with csrf_missing.
      const res = await fetch(url, {
        credentials: "same-origin",
        ...init,
      });
      if (res.status === 401) handle401();
      return res;
    }
  }

  const firstRes = await fetch(url, {
    credentials: "same-origin",
    ...attachCsrfHeader(init, token),
  });

  if (firstRes.status === 401) {
    handle401();
    return firstRes;
  }

  if (await isCsrfFailure(firstRes)) {
    // Refresh token + retry exactly once
    const refreshed = await fetchCsrfToken();
    if (refreshed === null) return firstRes;
    const retryRes = await fetch(url, {
      credentials: "same-origin",
      ...attachCsrfHeader(init, refreshed),
    });
    if (retryRes.status === 401) handle401();
    return retryRes;
  }

  return firstRes;
}

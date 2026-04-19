import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/auth-cookie";

/**
 * GET /api/auth/session-expired — clear cookies + redirect to login.
 *
 * This route exists because Next.js Server Components (including layouts)
 * are NOT allowed to mutate cookies via `cookies().set(...)` — only Route
 * Handlers and Server Actions can. The (authed) dashboard layout's
 * token-version mismatch branch redirects here instead of attempting a
 * forbidden write inline (Codex PR review R1 [P1]).
 *
 * The caller passes `?next=/dashboard/login/` so this handler stays
 * generic and the redirect target is obvious from the URL. Default to
 * `/dashboard/login/` if no `next` is provided or if it's not a safe
 * same-origin absolute path.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("next");
  const target = isSafeInternalPath(raw) ? raw! : "/dashboard/login/";

  const redirect = NextResponse.redirect(new URL(target, req.url), 303);
  clearSessionCookies(redirect);
  redirect.headers.set("Cache-Control", "no-store");
  return redirect;
}

/**
 * Accept only absolute same-origin paths like `/dashboard/login/`. Reject
 * protocol-relative `//evil.com/`, backslash tricks, double-slash, scheme
 * URLs, and empty strings. This is a redirect target — open-redirect
 * protection matters.
 */
function isSafeInternalPath(candidate: string | null): boolean {
  if (!candidate || candidate.length === 0) return false;
  if (!candidate.startsWith("/")) return false;
  if (candidate.startsWith("//")) return false;
  if (candidate.startsWith("/\\")) return false;
  return true;
}

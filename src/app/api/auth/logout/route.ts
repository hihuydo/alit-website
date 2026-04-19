import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { clearSessionCookies } from "@/lib/auth-cookie";
import { getClientIp } from "@/lib/client-ip";
import { auditLog } from "@/lib/audit";
import { bumpTokenVersionForLogout } from "@/lib/session-version";
import { deriveEnv } from "@/lib/runtime-env";

/**
 * POST /api/auth/logout — invalidate all sessions of this admin (in the
 * current env) and clear cookies.
 *
 * Idempotent semantics (Sprint T1-S):
 *   - No session / expired-tv  → `200 + clear cookies`. A double-click
 *     or retry doesn't surface a spurious 401 to the user.
 *   - Valid session            → bump `admin_session_version.token_version`
 *     atomically (WHERE-clause CAS gates dual-tab concurrent-logouts),
 *     emit audit, clear cookies, 200.
 *   - Deleted admin row        → upsert creates orphan row, harmless.
 *     200 + clear.
 *   - CSRF failure             → 403 passes through unchanged. We do not
 *     silently accept a forged-CSRF logout because that turns the
 *     endpoint into an attacker-controlled force-logout vector (mild
 *     DoS of shared sessions).
 *
 * The CSRF gate lives in `requireAuth` (non-GET path); we react to its
 * specific failure modes rather than reimplementing it inline.
 */
function clearAndReturn(): NextResponse {
  const res = NextResponse.json({ success: true });
  clearSessionCookies(res);
  return res;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);

  if (auth instanceof NextResponse) {
    // 401 (no session / tv-mismatch) → idempotent clear. 403 (CSRF
    // failure) → propagate so a forged-cookie logout cannot succeed.
    if (auth.status === 401) return clearAndReturn();
    return auth;
  }

  const ip = getClientIp(req.headers);
  auditLog("logout", { ip, user_id: auth.userId });

  // Bump is atomic + TOCTOU-safe. `null` return means a concurrent tab
  // already bumped — that's fine, the server state ended up in the same
  // place either way. Either outcome returns 200 + clear.
  await bumpTokenVersionForLogout(auth.userId, deriveEnv(), auth.tokenVersion);

  return clearAndReturn();
}

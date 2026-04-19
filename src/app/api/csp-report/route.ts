import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeCspReport } from "@/lib/csp";

const MAX_BODY_BYTES = 10 * 1024; // 10 KB
const RATE_MAX = 30;
const RATE_WINDOW_MS = 15 * 60 * 1000;

const ALLOWED_CONTENT_TYPES = [
  "application/csp-report",
  "application/reports+json",
  "application/json",
] as const;

export async function POST(req: NextRequest) {
  // 1. Content-Type early-reject (before body read) — uses startsWith
  //    so "; charset=utf-8" suffixes pass.
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.some((t) => ct.startsWith(t))) {
    return new NextResponse(null, { status: 415 });
  }

  // 2. Content-Length short-circuit when oversize is declared.
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }
  }

  // 3. Rate-limit per X-Real-IP (shared `rate-limit.ts` store — best-effort,
  //    see spec.md §Risks #5). `max` passed explicit; default is 25.
  const ip = req.headers.get("x-real-ip") ?? "unknown";
  const rate = checkRateLimit(`csp-report:${ip}`, RATE_MAX, RATE_WINDOW_MS);
  if (!rate.allowed) {
    return new NextResponse(null, { status: 429 });
  }

  // 4. Read body + post-read cap (chunked bodies lie about Content-Length).
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  // 5. Parse JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // 6. Normalize + log. Non-csp-violation entries are silently filtered
  //    inside normalizeCspReport; arrays can produce multiple log lines.
  const violations = normalizeCspReport(parsed, ct);
  const host = req.headers.get("host") ?? "";
  for (const v of violations) {
    console.log(
      JSON.stringify({ type: "csp_violation", ...v, ip, host }),
    );
  }

  return new NextResponse(null, { status: 204 });
}

function methodNotAllowed() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;

/**
 * Extract client IP from request headers behind nginx.
 * Only X-Real-IP is trusted — nginx sets it per request, clients cannot spoof.
 * X-Forwarded-For is intentionally ignored: a direct (nginx-bypassing) request
 * could supply any XFF value to evade rate-limiting. No fallback.
 * Returns "unknown" if the header is missing (all such requests share a single bucket).
 */
export function getClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

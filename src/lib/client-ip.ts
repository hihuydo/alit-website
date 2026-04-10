/**
 * Extract client IP from request headers behind nginx.
 * Trust order: X-Real-IP (nginx sets this, client cannot spoof)
 * → rightmost X-Forwarded-For (last hop = trusted proxy)
 * → "unknown" as single fallback bucket.
 *
 * Never trust X-Forwarded-For[0] — client-spoofable → rate-limit bypass.
 */
export function getClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    const rightmost = parts[parts.length - 1]?.trim();
    if (rightmost) return rightmost;
  }

  return "unknown";
}

// Signup flow requires the real client IP for rate-limit, ip_hash, and audit.
// nginx sets X-Real-IP for every forwarded request; trusting X-Forwarded-For
// would let a direct (nginx-bypassing) request spoof its IP and evade
// rate-limiting. Only X-Real-IP is accepted. No fallback.
export function signupClientIp(headers: Headers): string | null {
  const realIp = headers.get("x-real-ip")?.trim();
  if (!realIp) return null;
  return realIp;
}

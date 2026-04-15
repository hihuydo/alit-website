import { createHash } from "crypto";

// Read once at module load. instrumentation.ts validates presence+length at
// boot, so by the time this module is imported on a request path the salt
// must exist.
const SALT = process.env.IP_HASH_SALT ?? "";

export function hashIp(ip: string): string {
  if (!SALT) {
    // Defensive: should never happen after instrumentation-level guard, but
    // avoids accidentally emitting unsalted hashes if imported in a test env.
    throw new Error("IP_HASH_SALT missing — refusing to hash without salt");
  }
  return createHash("sha256").update(SALT).update(":").update(ip).digest("hex");
}

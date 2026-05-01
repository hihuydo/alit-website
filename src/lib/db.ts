import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Prevent idle TCP connections from being silently dropped by Docker
  // bridge NAT / conntrack timeouts (manifests as intermittent ETIMEDOUT
  // when reaching host.docker.internal:5432 from staging container).
  keepAlive: true,
  // Fail fast instead of waiting ~21s for the OS-level TCP timeout — the
  // slide-PNG route can then return 5xx promptly and the client-side retry
  // can self-heal within the user's perception window.
  connectionTimeoutMillis: 5000,
});

export default pool;

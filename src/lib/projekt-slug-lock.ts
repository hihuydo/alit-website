// Stable advisory-lock namespace for cross-column slug-write serialization
// in src/app/api/dashboard/projekte/route.ts (+ [id]/route.ts).
//
// Per-column UNIQUE indexes on projekte.slug_de and projekte.slug_fr
// catch intra-column collisions but NOT cross-column (e.g. new slug_de
// == existing slug_fr of another row). To serialize the pre-SELECT +
// INSERT/UPDATE without a heavy DB-level constraint (PG has no clean
// cross-column UNIQUE), we take a transaction-scoped advisory lock.
// All concurrent slug writers serialize on the same integer namespace.
//
// The value is arbitrary — chosen once, never change. pg_advisory_lock
// operates on a 64-bit integer namespace.
export const SLUG_WRITE_LOCK_ID = 0x70726f6a656b74 as const; // "projekt" in hex

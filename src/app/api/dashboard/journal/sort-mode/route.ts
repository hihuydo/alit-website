import { NextRequest, NextResponse } from "next/server";
import { requireAuth, parseBody, internalError } from "@/lib/api-helpers";
import { setJournalSortMode, type JournalSortMode } from "@/lib/journal-sort-mode";

/**
 * POST /api/dashboard/journal/sort-mode/
 *
 * Body: `{ mode: "auto" | "manual" }`
 *
 * Flips the global journal list sort mode. Typical caller is the
 * "Auto-Sortierung wiederherstellen" button, which sends `{mode: 'auto'}`
 * to restore datum-based ordering after the admin has been in manual
 * (drag-controlled) mode.
 *
 * Manual → manual is a no-op (not exposed in the UI — the first drag
 * flips the mode atomically via /reorder/). Accepted here for symmetry.
 *
 * Note: the existing `sort_order` column is NOT cleared on auto-flip.
 * That keeps the last manual snapshot intact so the admin can switch
 * back to manual later without re-dragging (the dashboard reorder UI
 * reads sort_order on the next manual-mode load).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody<{ mode?: unknown }>(req);
  if (!body || (body.mode !== "auto" && body.mode !== "manual")) {
    return NextResponse.json(
      { success: false, error: "mode must be 'auto' or 'manual'" },
      { status: 400 },
    );
  }

  try {
    await setJournalSortMode(body.mode as JournalSortMode);
    return NextResponse.json({ success: true, sortMode: body.mode });
  } catch (err) {
    return internalError("journal/sort-mode", err);
  }
}

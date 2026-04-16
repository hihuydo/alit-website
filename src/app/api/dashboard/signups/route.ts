import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const authErr = await requireAuth(req);
  if (authErr) return authErr;

  try {
    const [memberships, newsletter] = await Promise.all([
      pool.query(
        `SELECT id, vorname, nachname, strasse, nr, plz, stadt, email,
                newsletter_opt_in, paid, paid_at, consent_at, created_at
           FROM memberships
          ORDER BY created_at DESC, id DESC`,
      ),
      pool.query(
        `SELECT id, vorname, nachname, woher, email, source,
                consent_at, created_at
           FROM newsletter_subscribers
          ORDER BY created_at DESC, id DESC`,
      ),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        memberships: memberships.rows,
        newsletter: newsletter.rows,
      },
    });
  } catch (err) {
    console.error("[dashboard/signups GET]", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

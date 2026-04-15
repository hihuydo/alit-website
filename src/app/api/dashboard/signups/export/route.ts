import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { toCsv } from "@/lib/csv";

function today() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(ts: unknown): string {
  if (!ts) return "";
  const d = new Date(String(ts));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const authErr = await requireAuth(req);
  if (authErr) return authErr;

  const type = req.nextUrl.searchParams.get("type");
  if (type !== "memberships" && type !== "newsletter") {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  try {
    let csv: string;
    let filename: string;
    if (type === "memberships") {
      const { rows } = await pool.query(
        `SELECT id, vorname, nachname, strasse, nr, plz, stadt, email,
                newsletter_opt_in, consent_at, created_at
           FROM memberships
          ORDER BY created_at DESC, id DESC`,
      );
      csv = toCsv(
        [
          "ID",
          "Vorname",
          "Nachname",
          "Strasse",
          "Nr",
          "PLZ",
          "Stadt",
          "E-Mail",
          "Newsletter",
          "Consent",
          "Erstellt",
        ],
        rows.map((r) => [
          r.id,
          r.vorname,
          r.nachname,
          r.strasse,
          r.nr,
          r.plz,
          r.stadt,
          r.email,
          r.newsletter_opt_in ? "ja" : "nein",
          formatDate(r.consent_at),
          formatDate(r.created_at),
        ]),
      );
      filename = `mitgliedschaften-${today()}.csv`;
    } else {
      const { rows } = await pool.query(
        `SELECT id, vorname, nachname, woher, email, source, consent_at, created_at
           FROM newsletter_subscribers
          ORDER BY created_at DESC, id DESC`,
      );
      csv = toCsv(
        [
          "ID",
          "Vorname",
          "Nachname",
          "Woher",
          "E-Mail",
          "Quelle",
          "Consent",
          "Erstellt",
        ],
        rows.map((r) => [
          r.id,
          r.vorname,
          r.nachname,
          r.woher,
          r.email,
          r.source,
          formatDate(r.consent_at),
          formatDate(r.created_at),
        ]),
      );
      filename = `newsletter-${today()}.csv`;
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[dashboard/signups/export]", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

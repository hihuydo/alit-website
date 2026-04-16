"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";

interface AuditRow {
  id: number;
  event: string;
  actor_email: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface Props {
  /** If non-null, modal is open and history is fetched for this row. */
  target: { id: number; label: string } | null;
  onClose: () => void;
}

function formatDateTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describe(row: AuditRow): string {
  if (row.event === "membership_paid_toggle") {
    return row.details.paid === true
      ? "Bezahlt markiert"
      : row.details.paid === false
        ? "Bezahlt-Status entfernt"
        : "Bezahlt-Status geändert";
  }
  if (row.event === "signup_delete") {
    return "Eintrag gelöscht";
  }
  // Forward-compat fallback — shows the raw event name so the admin at
  // least sees *something happened* even for future event types.
  return row.event;
}

export function PaidHistoryModal({ target, onClose }: Props) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRows(null);
    fetch(`/api/dashboard/audit/memberships/${target.id}/`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.success) throw new Error("not ok");
        setRows(data.data as AuditRow[]);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Verlauf konnte nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={target ? `Verlauf: ${target.label}` : "Verlauf"}
    >
      {loading && <p className="text-sm text-gray-500">Lädt…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows !== null && rows.length === 0 && (
        <div className="text-sm text-gray-500">
          <p>Noch keine Aktionen protokolliert.</p>
          <p className="mt-2 text-xs text-gray-400">
            Der Verlauf wurde erst kürzlich eingeführt — ältere Aktionen
            wurden nicht aufgezeichnet.
          </p>
        </div>
      )}
      {rows !== null && rows.length > 0 && (
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="py-2 flex items-baseline gap-3">
              <span className="text-gray-500 whitespace-nowrap tabular-nums">
                {formatDateTime(r.created_at)}
              </span>
              <span className="text-gray-400 truncate max-w-[14rem]" title={r.actor_email ?? ""}>
                {r.actor_email ?? "—"}
              </span>
              <span className="flex-1 text-gray-900">{describe(r)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

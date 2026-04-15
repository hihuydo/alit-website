"use client";

import { useEffect, useState } from "react";
import { DeleteConfirm } from "./DeleteConfirm";

export interface MembershipRow {
  id: number;
  vorname: string;
  nachname: string;
  strasse: string;
  nr: string;
  plz: string;
  stadt: string;
  email: string;
  newsletter_opt_in: boolean;
  consent_at: string;
  created_at: string;
}

export interface NewsletterRow {
  id: number;
  vorname: string;
  nachname: string;
  woher: string;
  email: string;
  source: "form" | "membership";
  consent_at: string;
  created_at: string;
}

interface SignupsData {
  memberships: MembershipRow[];
  newsletter: NewsletterRow[];
}

type DeleteTarget = {
  type: "memberships" | "newsletter";
  id: number;
  label: string;
};

function formatDate(ts: string): string {
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

export function SignupsSection({ initial }: { initial: SignupsData }) {
  const [data, setData] = useState<SignupsData>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/signups/", { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error("not ok");
      setData(json.data);
    } catch {
      setError("Daten konnten nicht neu geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  // Refetch on mount — matches the pattern other dashboard sections use to
  // avoid stale state when the user returns to this tab.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/dashboard/signups/${type}/${id}/`, {
        method: "DELETE",
      });
      if (res.status !== 204 && !res.ok) throw new Error("delete failed");
      await reload();
    } catch {
      setError("Löschen fehlgeschlagen. Bitte neu laden.");
    }
  };

  const exportCsv = (type: "memberships" | "newsletter") => {
    window.open(`/api/dashboard/signups/export/?type=${type}`, "_blank");
  };

  return (
    <div className="space-y-10">
      {error && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <section>
        <header className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            Mitgliedschaften <span className="text-gray-400 font-normal">({data.memberships.length})</span>
          </h2>
          <button
            onClick={() => exportCsv("memberships")}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
            disabled={data.memberships.length === 0}
          >
            CSV exportieren
          </button>
        </header>
        {data.memberships.length === 0 ? (
          <p className="text-sm text-gray-500">Keine Anmeldungen.</p>
        ) : (
          <ul className="divide-y border rounded">
            {data.memberships.map((m) => (
              <li key={m.id} className="p-3 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {m.vorname} {m.nachname}
                  </div>
                  <div className="text-sm text-gray-600 break-all">{m.email}</div>
                  <div className="text-sm text-gray-500">
                    {m.strasse} {m.nr}, {m.plz} {m.stadt}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {formatDate(m.created_at)}
                    {m.newsletter_opt_in && <span className="ml-2 text-green-700">+ Newsletter</span>}
                  </div>
                </div>
                <button
                  onClick={() => setDeleteTarget({ type: "memberships", id: m.id, label: `${m.vorname} ${m.nachname}` })}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <header className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            Newsletter-Abonnent:innen <span className="text-gray-400 font-normal">({data.newsletter.length})</span>
          </h2>
          <button
            onClick={() => exportCsv("newsletter")}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
            disabled={data.newsletter.length === 0}
          >
            CSV exportieren
          </button>
        </header>
        {data.newsletter.length === 0 ? (
          <p className="text-sm text-gray-500">Keine Anmeldungen.</p>
        ) : (
          <ul className="divide-y border rounded">
            {data.newsletter.map((n) => (
              <li key={n.id} className="p-3 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {n.vorname} {n.nachname}
                  </div>
                  <div className="text-sm text-gray-600 break-all">{n.email}</div>
                  {n.woher && <div className="text-sm text-gray-500">{n.woher}</div>}
                  <div className="text-xs text-gray-400 mt-1">
                    {formatDate(n.created_at)}
                    <span className="ml-2">
                      {n.source === "membership" ? "aus Mitgliedschaft" : "Formular"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setDeleteTarget({ type: "newsletter", id: n.id, label: `${n.vorname} ${n.nachname}` })}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {loading && <p className="text-xs text-gray-400">Lade…</p>}

      <DeleteConfirm
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        label={deleteTarget?.label ?? ""}
      />
    </div>
  );
}

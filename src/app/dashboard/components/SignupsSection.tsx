"use client";

import { useEffect, useMemo, useState } from "react";
import { DeleteConfirm } from "./DeleteConfirm";
import { Modal } from "./Modal";
import { toCsv } from "@/lib/csv";

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

type BulkDeleteTarget = {
  type: "memberships" | "newsletter";
  ids: number[];
};

type SortDir = "asc" | "desc";

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

function isoDate(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sortByDate<T extends { created_at: string }>(rows: T[], dir: SortDir): T[] {
  const copy = rows.slice();
  copy.sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return dir === "desc" ? db - da : da - db;
  });
  return copy;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const MEMBERSHIP_HEADERS = [
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
] as const;

const NEWSLETTER_HEADERS = [
  "ID",
  "Vorname",
  "Nachname",
  "Woher",
  "E-Mail",
  "Quelle",
  "Consent",
  "Erstellt",
] as const;

function membershipToRow(m: MembershipRow): unknown[] {
  return [
    m.id,
    m.vorname,
    m.nachname,
    m.strasse,
    m.nr,
    m.plz,
    m.stadt,
    m.email,
    m.newsletter_opt_in ? "ja" : "nein",
    isoDate(m.consent_at),
    isoDate(m.created_at),
  ];
}

function newsletterToRow(n: NewsletterRow): unknown[] {
  return [
    n.id,
    n.vorname,
    n.nachname,
    n.woher,
    n.email,
    n.source,
    isoDate(n.consent_at),
    isoDate(n.created_at),
  ];
}

function SortIcon({ dir }: { dir: SortDir }) {
  return (
    <span aria-hidden className="ml-1 text-gray-400">
      {dir === "desc" ? "↓" : "↑"}
    </span>
  );
}

type View = "memberships" | "newsletter";

export function SignupsSection({ initial }: { initial: SignupsData }) {
  const [data, setData] = useState<SignupsData>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<BulkDeleteTarget | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [view, setView] = useState<View>("memberships");

  const [memberSort, setMemberSort] = useState<SortDir>("desc");
  const [newsSort, setNewsSort] = useState<SortDir>("desc");
  const [memberSelected, setMemberSelected] = useState<Set<number>>(new Set());
  const [newsSelected, setNewsSelected] = useState<Set<number>>(new Set());

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/signups/", { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error("not ok");
      setData(json.data);
      // Drop selections that no longer exist after reload.
      setMemberSelected((prev) => new Set([...prev].filter((id) => json.data.memberships.some((m: MembershipRow) => m.id === id))));
      setNewsSelected((prev) => new Set([...prev].filter((id) => json.data.newsletter.some((n: NewsletterRow) => n.id === id))));
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

  const handleBulkDelete = async () => {
    if (!bulkDeleteTarget || bulkDeleting) return;
    const { type, ids } = bulkDeleteTarget;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/dashboard/signups/bulk-delete/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ids }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error("bulk delete failed");
      // Clear this list's selection; reload replaces the data.
      if (type === "memberships") setMemberSelected(new Set());
      else setNewsSelected(new Set());
      setBulkDeleteTarget(null);
      await reload();
    } catch {
      setError("Massenlöschen fehlgeschlagen. Bitte neu laden.");
    } finally {
      setBulkDeleting(false);
    }
  };

  const sortedMembers = useMemo(
    () => sortByDate(data.memberships, memberSort),
    [data.memberships, memberSort],
  );
  const sortedNews = useMemo(
    () => sortByDate(data.newsletter, newsSort),
    [data.newsletter, newsSort],
  );

  const toggleMemberSort = () => setMemberSort((d) => (d === "desc" ? "asc" : "desc"));
  const toggleNewsSort = () => setNewsSort((d) => (d === "desc" ? "asc" : "desc"));

  const toggleSelected = <T extends number>(set: Set<T>, id: T): Set<T> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const allMembersSelected = sortedMembers.length > 0 && sortedMembers.every((m) => memberSelected.has(m.id));
  const allNewsSelected = sortedNews.length > 0 && sortedNews.every((n) => newsSelected.has(n.id));

  const exportMembers = () => {
    const subset = memberSelected.size > 0
      ? sortedMembers.filter((m) => memberSelected.has(m.id))
      : sortedMembers;
    if (subset.length === 0) return;
    const csv = toCsv([...MEMBERSHIP_HEADERS], subset.map(membershipToRow));
    downloadCsv(`mitgliedschaften-${todayStamp()}.csv`, csv);
  };

  const exportNews = () => {
    const subset = newsSelected.size > 0
      ? sortedNews.filter((n) => newsSelected.has(n.id))
      : sortedNews;
    if (subset.length === 0) return;
    const csv = toCsv([...NEWSLETTER_HEADERS], subset.map(newsletterToRow));
    downloadCsv(`newsletter-${todayStamp()}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div role="tablist" aria-label="Anmeldungs-Ansicht" className="flex gap-2 border-b">
        <button
          role="tab"
          aria-selected={view === "memberships"}
          onClick={() => setView("memberships")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view === "memberships"
              ? "border-black text-black"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          Mitgliedschaften <span className="text-gray-400 font-normal">({data.memberships.length})</span>
        </button>
        <button
          role="tab"
          aria-selected={view === "newsletter"}
          onClick={() => setView("newsletter")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view === "newsletter"
              ? "border-black text-black"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          Newsletter <span className="text-gray-400 font-normal">({data.newsletter.length})</span>
        </button>
      </div>

      {view === "memberships" && (
      <section>
        <header className="flex items-center justify-end gap-2 mb-3">
          <button
            onClick={() =>
              setBulkDeleteTarget({ type: "memberships", ids: [...memberSelected] })
            }
            className="px-3 py-1.5 text-sm border border-red-600 text-red-700 rounded hover:bg-red-50 disabled:opacity-50 disabled:border-gray-300 disabled:text-gray-400"
            disabled={memberSelected.size === 0}
          >
            Ausgewählte löschen{memberSelected.size > 0 ? ` (${memberSelected.size})` : ""}
          </button>
          <button
            onClick={exportMembers}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            disabled={data.memberships.length === 0}
          >
            CSV exportieren{memberSelected.size > 0 ? ` (${memberSelected.size})` : ""}
          </button>
        </header>
        {data.memberships.length === 0 ? (
          <p className="text-sm text-gray-500">Keine Anmeldungen.</p>
        ) : (
          <div className="border rounded overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-700 text-left border-b">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Alle auswählen"
                      checked={allMembersSelected}
                      onChange={(e) => {
                        setMemberSelected(e.target.checked ? new Set(sortedMembers.map((m) => m.id)) : new Set());
                      }}
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">E-Mail</th>
                  <th className="px-3 py-2 font-medium">Adresse</th>
                  <th className="px-3 py-2 font-medium text-center">Newsletter</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">
                    <button
                      type="button"
                      onClick={toggleMemberSort}
                      className="font-medium hover:text-black"
                      aria-label={`Datum ${memberSort === "desc" ? "absteigend" : "aufsteigend"} sortieren`}
                    >
                      Datum<SortIcon dir={memberSort} />
                    </button>
                  </th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`${m.vorname} ${m.nachname} auswählen`}
                        checked={memberSelected.has(m.id)}
                        onChange={() => setMemberSelected((s) => toggleSelected(s, m.id))}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{m.vorname} {m.nachname}</td>
                    <td className="px-3 py-2 text-gray-600 break-all">{m.email}</td>
                    <td className="px-3 py-2 text-gray-600">{m.strasse} {m.nr}, {m.plz} {m.stadt}</td>
                    <td className="px-3 py-2 text-center">
                      {m.newsletter_opt_in ? (
                        <span className="inline-block text-green-700" aria-label="Newsletter ja">✓</span>
                      ) : (
                        <span className="text-gray-300" aria-label="Newsletter nein">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(m.created_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setDeleteTarget({ type: "memberships", id: m.id, label: `${m.vorname} ${m.nachname}` })}
                        className="text-red-600 hover:text-red-800"
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      )}

      {view === "newsletter" && (
      <section>
        <header className="flex items-center justify-end gap-2 mb-3">
          <button
            onClick={() =>
              setBulkDeleteTarget({ type: "newsletter", ids: [...newsSelected] })
            }
            className="px-3 py-1.5 text-sm border border-red-600 text-red-700 rounded hover:bg-red-50 disabled:opacity-50 disabled:border-gray-300 disabled:text-gray-400"
            disabled={newsSelected.size === 0}
          >
            Ausgewählte löschen{newsSelected.size > 0 ? ` (${newsSelected.size})` : ""}
          </button>
          <button
            onClick={exportNews}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            disabled={data.newsletter.length === 0}
          >
            CSV exportieren{newsSelected.size > 0 ? ` (${newsSelected.size})` : ""}
          </button>
        </header>
        {data.newsletter.length === 0 ? (
          <p className="text-sm text-gray-500">Keine Anmeldungen.</p>
        ) : (
          <div className="border rounded overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-700 text-left border-b">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Alle auswählen"
                      checked={allNewsSelected}
                      onChange={(e) => {
                        setNewsSelected(e.target.checked ? new Set(sortedNews.map((n) => n.id)) : new Set());
                      }}
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">E-Mail</th>
                  <th className="px-3 py-2 font-medium">Woher</th>
                  <th className="px-3 py-2 font-medium">Quelle</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">
                    <button
                      type="button"
                      onClick={toggleNewsSort}
                      className="font-medium hover:text-black"
                      aria-label={`Datum ${newsSort === "desc" ? "absteigend" : "aufsteigend"} sortieren`}
                    >
                      Datum<SortIcon dir={newsSort} />
                    </button>
                  </th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedNews.map((n) => (
                  <tr key={n.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`${n.vorname} ${n.nachname} auswählen`}
                        checked={newsSelected.has(n.id)}
                        onChange={() => setNewsSelected((s) => toggleSelected(s, n.id))}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{n.vorname} {n.nachname}</td>
                    <td className="px-3 py-2 text-gray-600 break-all">{n.email}</td>
                    <td className="px-3 py-2 text-gray-600">{n.woher}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {n.source === "membership" ? "aus Mitgliedschaft" : "Formular"}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(n.created_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setDeleteTarget({ type: "newsletter", id: n.id, label: `${n.vorname} ${n.nachname}` })}
                        className="text-red-600 hover:text-red-800"
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {loading && <p className="text-xs text-gray-400">Lade…</p>}

      <DeleteConfirm
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        label={deleteTarget?.label ?? ""}
      />

      <Modal
        open={bulkDeleteTarget !== null}
        onClose={() => (bulkDeleting ? undefined : setBulkDeleteTarget(null))}
        title="Mehrere Einträge löschen"
      >
        <p className="mb-6">
          Sollen <strong>{bulkDeleteTarget?.ids.length ?? 0}</strong>{" "}
          {bulkDeleteTarget?.type === "memberships" ? "Mitgliedschaften" : "Newsletter-Anmeldungen"}{" "}
          wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setBulkDeleteTarget(null)}
            disabled={bulkDeleting}
            className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {bulkDeleting ? "Lösche…" : "Löschen"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

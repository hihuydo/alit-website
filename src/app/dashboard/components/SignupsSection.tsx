"use client";

import { useEffect, useMemo, useState } from "react";
import { DeleteConfirm } from "./DeleteConfirm";
import { Modal } from "./Modal";
import { PaidHistoryModal } from "./PaidHistoryModal";
import { SubmissionTextsEditor } from "./SubmissionTextsEditor";
import { toCsv } from "@/lib/csv";
import { SIGNUPS_BULK_DELETE_MAX } from "@/lib/signups-limits";
import { dashboardStrings } from "../i18n";
import { dashboardFetch } from "../lib/dashboardFetch";

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
  paid: boolean;
  paid_at: string | null;
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
  "Bezahlt",
  "Bezahlt am",
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
    m.paid ? "ja" : "nein",
    m.paid_at ? isoDate(m.paid_at) : "",
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

type View = "memberships" | "newsletter" | "texts";

// Shared height for the mobile bulk-action sticky bar AND its flow spacer.
// Both MUST consume this constant — do not inline `h-20` or similar
// literals. Drift between the two values would let the last card slip
// under the fixed bar on small screens (B2a Codex Spec R2 [Contract]).
const BULK_BAR_HEIGHT = "h-20";

interface MembershipCardProps {
  row: MembershipRow;
  isSelected: boolean;
  isExpanded: boolean;
  isPaidToggling: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onTogglePaid: () => void;
  onOpenHistory: () => void;
  onRequestDelete: () => void;
}

function MembershipCard({
  row,
  isSelected,
  isExpanded,
  isPaidToggling,
  onToggleSelect,
  onToggleExpand,
  onTogglePaid,
  onOpenHistory,
  onRequestDelete,
}: MembershipCardProps) {
  const detailsId = `member-details-${row.id}`;
  const paidTitle =
    row.paid && row.paid_at
      ? `Seit ${formatDate(row.paid_at)}`
      : !row.paid && row.paid_at
        ? `Zuletzt bezahlt: ${formatDate(row.paid_at)}`
        : "Als bezahlt markieren";

  return (
    <li className="border rounded bg-white">
      <div className="flex items-start gap-2 p-2">
        <label className="min-w-11 min-h-11 flex items-center justify-center shrink-0 cursor-pointer">
          <input
            type="checkbox"
            aria-label={`${row.vorname} ${row.nachname} auswählen`}
            checked={isSelected}
            onChange={onToggleSelect}
          />
        </label>
        <div className="flex-1 min-w-0 py-1">
          <p className="font-medium truncate">
            {row.vorname} {row.nachname}
          </p>
          <p className="text-sm text-gray-600 break-all">{row.email}</p>
          <p className="text-xs text-gray-500 mt-1 tabular-nums">{formatDate(row.created_at)}</p>
        </div>
        <div className="flex items-center shrink-0">
          <label
            className={`min-w-11 min-h-11 flex items-center justify-center ${
              isPaidToggling ? "cursor-wait" : "cursor-pointer"
            }`}
            title={paidTitle}
          >
            <input
              type="checkbox"
              className="h-5 w-5 accent-green-700"
              aria-label={`${row.vorname} ${row.nachname} — ${dashboardStrings.signups.paid}`}
              checked={row.paid}
              disabled={isPaidToggling}
              onChange={onTogglePaid}
            />
          </label>
          <button
            type="button"
            onClick={onOpenHistory}
            aria-label={`${dashboardStrings.signups.historyLabel} für ${row.vorname} ${row.nachname}`}
            className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-black"
          >
            <span aria-hidden>🕐</span>
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            aria-label={`${row.vorname} ${row.nachname} ${dashboardStrings.signups.deleteLabel.toLowerCase()}`}
            className="min-w-11 min-h-11 flex items-center justify-center text-red-600 hover:text-red-800 text-xl leading-none"
          >
            <span aria-hidden>×</span>
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        className="min-h-11 w-full flex items-center justify-between px-3 border-t text-xs text-gray-600 hover:bg-gray-50"
      >
        <span>
          {isExpanded
            ? dashboardStrings.signups.detailsCollapse
            : dashboardStrings.signups.detailsExpand}
        </span>
        <span aria-hidden>{isExpanded ? "▲" : "▼"}</span>
      </button>
      {isExpanded && (
        <dl id={detailsId} className="px-3 py-2 border-t text-xs space-y-1.5">
          <div className="flex gap-2">
            <dt className="text-gray-500 shrink-0 w-24">
              {dashboardStrings.signups.address}:
            </dt>
            <dd className="text-gray-800">
              {row.strasse} {row.nr}, {row.plz} {row.stadt}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 shrink-0 w-24">
              {dashboardStrings.signups.newsletterOptIn}:
            </dt>
            <dd className="text-gray-800">
              {row.newsletter_opt_in
                ? dashboardStrings.signups.newsletterYes
                : dashboardStrings.signups.newsletterNo}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 shrink-0 w-24">
              {dashboardStrings.signups.consentAt}:
            </dt>
            <dd className="text-gray-800 tabular-nums">{formatDate(row.consent_at)}</dd>
          </div>
        </dl>
      )}
    </li>
  );
}

interface NewsletterCardProps {
  row: NewsletterRow;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRequestDelete: () => void;
}

function NewsletterCard({
  row,
  isSelected,
  onToggleSelect,
  onRequestDelete,
}: NewsletterCardProps) {
  return (
    <li className="border rounded bg-white">
      <div className="flex items-start gap-2 p-2">
        <label className="min-w-11 min-h-11 flex items-center justify-center shrink-0 cursor-pointer">
          <input
            type="checkbox"
            aria-label={`${row.vorname} ${row.nachname} auswählen`}
            checked={isSelected}
            onChange={onToggleSelect}
          />
        </label>
        <div className="flex-1 min-w-0 py-1">
          <p className="font-medium truncate">
            {row.vorname} {row.nachname}
          </p>
          <p className="text-sm text-gray-600 break-all">{row.email}</p>
        </div>
        <button
          type="button"
          onClick={onRequestDelete}
          aria-label={`${row.vorname} ${row.nachname} ${dashboardStrings.signups.deleteLabel.toLowerCase()}`}
          className="min-w-11 min-h-11 flex items-center justify-center text-red-600 hover:text-red-800 text-xl leading-none shrink-0"
        >
          <span aria-hidden>×</span>
        </button>
      </div>
      <dl className="px-3 pb-3 text-xs space-y-1">
        <div className="flex gap-2">
          <dt className="text-gray-500 shrink-0 w-20">
            {dashboardStrings.signups.woher}:
          </dt>
          <dd className="text-gray-800 break-all">{row.woher || "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-500 shrink-0 w-20">
            {dashboardStrings.signups.source}:
          </dt>
          <dd className="text-gray-800">
            {row.source === "membership"
              ? dashboardStrings.signups.sourceMembership
              : dashboardStrings.signups.sourceForm}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-500 shrink-0 w-20">Datum:</dt>
          <dd className="text-gray-500 tabular-nums">{formatDate(row.created_at)}</dd>
        </div>
      </dl>
    </li>
  );
}

interface MobileBulkBarProps {
  count: number;
  onExport: () => void;
  onBulkDelete: () => void;
  bulkDeleting: boolean;
}

function MobileBulkBar({ count, onExport, onBulkDelete, bulkDeleting }: MobileBulkBarProps) {
  return (
    <div
      role="region"
      aria-label={dashboardStrings.signups.regionLabel}
      className={`fixed bottom-0 left-0 right-0 z-30 md:hidden border-t bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.08)] ${BULK_BAR_HEIGHT} pb-[env(safe-area-inset-bottom)]`}
    >
      <div className="h-full flex items-center justify-between gap-2 px-3">
        <p
          aria-live="polite"
          role="status"
          className="text-sm font-medium text-gray-700 tabular-nums"
        >
          {dashboardStrings.signups.selectedCount(count)}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={bulkDeleting || count === 0}
            className="min-w-11 min-h-11 px-3 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {dashboardStrings.signups.exportCsv}
          </button>
          <button
            type="button"
            onClick={onBulkDelete}
            disabled={bulkDeleting || count === 0}
            className="min-w-11 min-h-11 px-3 text-sm border border-red-600 text-red-700 rounded hover:bg-red-50 disabled:opacity-50 disabled:border-gray-300 disabled:text-gray-400"
          >
            {bulkDeleting
              ? dashboardStrings.signups.deleting
              : dashboardStrings.signups.deleteSelected}
          </button>
        </div>
      </div>
    </div>
  );
}

interface BulkFlowSpacerProps {
  visible: boolean;
}

function BulkFlowSpacer({ visible }: BulkFlowSpacerProps) {
  if (!visible) return null;
  return (
    <div
      aria-hidden="true"
      className={`${BULK_BAR_HEIGHT} pb-[env(safe-area-inset-bottom)] md:hidden`}
    />
  );
}

export function SignupsSection({ initial }: { initial: SignupsData }) {
  const [data, setData] = useState<SignupsData>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<BulkDeleteTarget | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [view, setView] = useState<View>("memberships");
  // Submission-Texts editor inner-tab dirty-flag — populated by the editor's
  // onDirtyChange callback. Outer-tab navigation is already covered by
  // DirtyContext (DK-6); this state guards INNER sub-tab switches.
  const [editorIsDirty, setEditorIsDirty] = useState(false);

  const switchView = (next: View) => {
    if (view === next) return;
    if (view === "texts" && editorIsDirty) {
      const ok = window.confirm("Ungespeicherte Änderungen verwerfen?");
      if (!ok) return;
      // Reset stale flag — the editor's onDirtyChange callback only fires
      // after re-mount, so without this every subsequent sub-tab click
      // would re-prompt (Codex R6 [Critical] guard).
      setEditorIsDirty(false);
    }
    setView(next);
  };

  const [memberSort, setMemberSort] = useState<SortDir>("desc");
  const [newsSort, setNewsSort] = useState<SortDir>("desc");
  // Set of membership rows with an in-flight paid-toggle PATCH. Disables
  // the checkbox while pending so admin clicks are serialized per row.
  // Without this, rapid clicks could reach the server in reordered order
  // and leave DB in the wrong final state (Codex PR #54 R3 [P1]).
  const [paidToggling, setPaidToggling] = useState<Set<number>>(new Set());
  // Row with a pending ON→OFF Confirm. null wenn kein Modal offen.
  // OFF→ON läuft direct durch togglePaid (keine Bestätigung für das Happy-Path-
  // Markieren). ON→OFF ist der Risk-Pfad und geht hier durch.
  const [pendingUntoggle, setPendingUntoggle] = useState<MembershipRow | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: number; label: string } | null>(null);
  const [memberSelected, setMemberSelected] = useState<Set<number>>(new Set());
  const [newsSelected, setNewsSelected] = useState<Set<number>>(new Set());
  // Mobile-only: which membership cards are expanded to show the Details
  // region. Keyed by membership id so it survives sort-toggle and sub-tab
  // switch. Pruned in `reload()` when rows disappear (delete / bulk-delete).
  const [memberExpanded, setMemberExpanded] = useState<Set<number>>(new Set());

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
      // Orphan-cleanup: wenn das pending-Confirm-Target nicht mehr existiert
      // (row gelöscht durch anderen Admin / bulk-delete), Modal schließen.
      setPendingUntoggle((prev) =>
        prev && !json.data.memberships.some((m: MembershipRow) => m.id === prev.id) ? null : prev,
      );
      // Orphan-cleanup for mobile-card expansion state — prune ids that
      // vanished via single-delete / bulk-delete / concurrent admin action.
      setMemberExpanded((prev) =>
        new Set([...prev].filter((id) => json.data.memberships.some((m: MembershipRow) => m.id === id))),
      );
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
      const res = await dashboardFetch(`/api/dashboard/signups/${type}/${id}/`, {
        method: "DELETE",
      });
      if (res.status !== 204 && !res.ok) throw new Error("delete failed");
      await reload();
    } catch {
      setError("Löschen fehlgeschlagen. Bitte neu laden.");
    }
  };

  // Kern-PATCH mit Optimistic-UI + Per-Row-Single-Flight + Server-Wins.
  // Keine Modal-Awareness — der Confirm-Gate ist in togglePaid/confirmUntoggle.
  const executePaidPatch = async (row: MembershipRow, nextPaid: boolean) => {
    // Per-row serialization: only one PATCH in flight per membership.
    // Prevents out-of-order server arrivals (Codex PR #54 R3 [P1]).
    if (paidToggling.has(row.id)) return;
    setPaidToggling((prev) => new Set(prev).add(row.id));

    // Optimistic update — row flips immediately, server-wins on response.
    // paid_at: bei ON→OFF preserven (match server-side Preserve-Logic),
    // bei OFF→ON neuen Timestamp stampen.
    setData((prev) => ({
      ...prev,
      memberships: prev.memberships.map((m) =>
        m.id === row.id
          ? { ...m, paid: nextPaid, paid_at: nextPaid ? new Date().toISOString() : m.paid_at }
          : m,
      ),
    }));
    try {
      const res = await dashboardFetch(`/api/dashboard/signups/memberships/${row.id}/paid/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: nextPaid }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error("toggle failed");
      // Server-wins: use authoritative paid_at timestamp.
      const serverPaid = json.data as { paid: boolean; paid_at: string | null };
      setData((prev) => ({
        ...prev,
        memberships: prev.memberships.map((m) =>
          m.id === row.id
            ? { ...m, paid: serverPaid.paid, paid_at: serverPaid.paid_at }
            : m,
        ),
      }));
    } catch {
      setError("Bezahlt-Status konnte nicht gespeichert werden.");
      // Re-fetch from server to guarantee UI matches authoritative state.
      reload();
    } finally {
      setPaidToggling((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const togglePaid = async (row: MembershipRow) => {
    // ON→OFF: Confirm-Modal als UX-Gate gegen versehentlichen Untoggle.
    // paid_at bleibt durch Server-Preserve erhalten, Audit protokolliert ohnehin,
    // aber der Modal ist die proaktive Schutzschicht davor.
    if (row.paid) {
      setPendingUntoggle(row);
      return;
    }
    // OFF→ON: Happy Path, 1 Klick — direkt ausführen.
    await executePaidPatch(row, true);
  };

  const confirmUntoggle = async () => {
    const target = pendingUntoggle;
    if (!target) return;
    await executePaidPatch(target, false);
    setPendingUntoggle(null);
  };

  const openBulkDelete = (type: "memberships" | "newsletter", ids: number[]) => {
    if (ids.length === 0) return;
    if (ids.length > SIGNUPS_BULK_DELETE_MAX) {
      setError(
        `Bitte maximal ${SIGNUPS_BULK_DELETE_MAX} Einträge pro Löschvorgang — ${ids.length} ausgewählt.`,
      );
      return;
    }
    setError(null);
    setBulkDeleteTarget({ type, ids });
  };

  const handleBulkDelete = async () => {
    if (!bulkDeleteTarget || bulkDeleting) return;
    const { type, ids } = bulkDeleteTarget;
    setBulkDeleting(true);
    try {
      const res = await dashboardFetch("/api/dashboard/signups/bulk-delete/", {
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
  const activeSelectionCount =
    view === "memberships" ? memberSelected.size : view === "newsletter" ? newsSelected.size : 0;

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
          onClick={() => switchView("memberships")}
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
          onClick={() => switchView("newsletter")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view === "newsletter"
              ? "border-black text-black"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          Newsletter <span className="text-gray-400 font-normal">({data.newsletter.length})</span>
        </button>
        <button
          role="tab"
          aria-selected={view === "texts"}
          onClick={() => switchView("texts")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view === "texts"
              ? "border-black text-black"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          Inhalte
        </button>
      </div>

      {view === "memberships" && (
      <section>
        <header className="hidden md:flex items-center justify-end gap-2 mb-3">
          <button
            onClick={() => openBulkDelete("memberships", [...memberSelected])}
            className="px-3 py-1.5 text-sm border border-red-600 text-red-700 rounded hover:bg-red-50 disabled:opacity-50 disabled:border-gray-300 disabled:text-gray-400"
            disabled={memberSelected.size === 0 || bulkDeleting}
          >
            Ausgewählte löschen{memberSelected.size > 0 ? ` (${memberSelected.size})` : ""}
          </button>
          <button
            onClick={exportMembers}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            disabled={data.memberships.length === 0 || bulkDeleting}
          >
            CSV exportieren{memberSelected.size > 0 ? ` (${memberSelected.size})` : ""}
          </button>
        </header>
        {data.memberships.length === 0 ? (
          <p className="text-sm text-gray-500">Keine Anmeldungen.</p>
        ) : (
          <>
          <div className="hidden md:block border rounded overflow-x-auto bg-white">
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
                  <th className="px-3 py-2 font-medium text-center">Bezahlt</th>
                  <th className="px-3 py-2 font-medium text-center">Verlauf</th>
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
                    <td className="px-3 py-2 text-center">
                      <label
                        className={`inline-flex items-center ${paidToggling.has(m.id) ? "cursor-wait" : "cursor-pointer"}`}
                        title={
                          m.paid && m.paid_at
                            ? `Seit ${formatDate(m.paid_at)}`
                            : !m.paid && m.paid_at
                              ? `Zuletzt bezahlt: ${formatDate(m.paid_at)}`
                              : "Als bezahlt markieren"
                        }
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-green-700 cursor-pointer disabled:cursor-wait disabled:opacity-60"
                          aria-label={`${m.vorname} ${m.nachname} — Beitrag bezahlt`}
                          checked={m.paid}
                          disabled={paidToggling.has(m.id)}
                          onChange={() => togglePaid(m)}
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          setHistoryTarget({ id: m.id, label: `${m.vorname} ${m.nachname}` })
                        }
                        aria-label={`Verlauf für ${m.vorname} ${m.nachname}`}
                        title="Verlauf anzeigen"
                        className="text-gray-400 hover:text-black"
                      >
                        🕐
                      </button>
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
          <div className="md:hidden flex items-center justify-between gap-2 mb-2">
            <label className="min-w-11 min-h-11 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label="Alle auswählen"
                checked={allMembersSelected}
                onChange={(e) => {
                  setMemberSelected(
                    e.target.checked ? new Set(sortedMembers.map((m) => m.id)) : new Set(),
                  );
                }}
              />
              <span className="text-gray-600">Alle</span>
            </label>
            <button
              type="button"
              onClick={exportMembers}
              disabled={data.memberships.length === 0 || bulkDeleting}
              className="min-h-11 px-3 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {dashboardStrings.signups.exportCsv}
              {memberSelected.size > 0 ? ` (${memberSelected.size})` : ""}
            </button>
          </div>
          <ul className="md:hidden space-y-2">
            {sortedMembers.map((m) => (
              <MembershipCard
                key={m.id}
                row={m}
                isSelected={memberSelected.has(m.id)}
                isExpanded={memberExpanded.has(m.id)}
                isPaidToggling={paidToggling.has(m.id)}
                onToggleSelect={() => setMemberSelected((s) => toggleSelected(s, m.id))}
                onToggleExpand={() => setMemberExpanded((s) => toggleSelected(s, m.id))}
                onTogglePaid={() => togglePaid(m)}
                onOpenHistory={() =>
                  setHistoryTarget({ id: m.id, label: `${m.vorname} ${m.nachname}` })
                }
                onRequestDelete={() =>
                  setDeleteTarget({
                    type: "memberships",
                    id: m.id,
                    label: `${m.vorname} ${m.nachname}`,
                  })
                }
              />
            ))}
          </ul>
          <BulkFlowSpacer visible={memberSelected.size > 0} />
          </>
        )}
      </section>

      )}

      {view === "newsletter" && (
      <section>
        <header className="hidden md:flex items-center justify-end gap-2 mb-3">
          <button
            onClick={() => openBulkDelete("newsletter", [...newsSelected])}
            className="px-3 py-1.5 text-sm border border-red-600 text-red-700 rounded hover:bg-red-50 disabled:opacity-50 disabled:border-gray-300 disabled:text-gray-400"
            disabled={newsSelected.size === 0 || bulkDeleting}
          >
            Ausgewählte löschen{newsSelected.size > 0 ? ` (${newsSelected.size})` : ""}
          </button>
          <button
            onClick={exportNews}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            disabled={data.newsletter.length === 0 || bulkDeleting}
          >
            CSV exportieren{newsSelected.size > 0 ? ` (${newsSelected.size})` : ""}
          </button>
        </header>
        {data.newsletter.length === 0 ? (
          <p className="text-sm text-gray-500">Keine Anmeldungen.</p>
        ) : (
          <>
          <div className="hidden md:block border rounded overflow-x-auto bg-white">
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
          <div className="md:hidden flex items-center justify-between gap-2 mb-2">
            <label className="min-w-11 min-h-11 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label="Alle auswählen"
                checked={allNewsSelected}
                onChange={(e) => {
                  setNewsSelected(
                    e.target.checked ? new Set(sortedNews.map((n) => n.id)) : new Set(),
                  );
                }}
              />
              <span className="text-gray-600">Alle</span>
            </label>
            <button
              type="button"
              onClick={exportNews}
              disabled={data.newsletter.length === 0 || bulkDeleting}
              className="min-h-11 px-3 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {dashboardStrings.signups.exportCsv}
              {newsSelected.size > 0 ? ` (${newsSelected.size})` : ""}
            </button>
          </div>
          <ul className="md:hidden space-y-2">
            {sortedNews.map((n) => (
              <NewsletterCard
                key={n.id}
                row={n}
                isSelected={newsSelected.has(n.id)}
                onToggleSelect={() => setNewsSelected((s) => toggleSelected(s, n.id))}
                onRequestDelete={() =>
                  setDeleteTarget({
                    type: "newsletter",
                    id: n.id,
                    label: `${n.vorname} ${n.nachname}`,
                  })
                }
              />
            ))}
          </ul>
          <BulkFlowSpacer visible={newsSelected.size > 0} />
          </>
        )}
      </section>
      )}

      {view === "texts" && (
        <SubmissionTextsEditor onDirtyChange={setEditorIsDirty} />
      )}

      {loading && <p className="text-xs text-gray-400">Lade…</p>}

      {activeSelectionCount > 0 && view !== "texts" && (
        <MobileBulkBar
          count={activeSelectionCount}
          onExport={view === "memberships" ? exportMembers : exportNews}
          onBulkDelete={() =>
            openBulkDelete(
              view,
              view === "memberships" ? [...memberSelected] : [...newsSelected],
            )
          }
          bulkDeleting={bulkDeleting}
        />
      )}

      <DeleteConfirm
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        label={deleteTarget?.label ?? ""}
      />

      <PaidHistoryModal
        target={historyTarget}
        onClose={() => setHistoryTarget(null)}
      />

      <Modal
        open={pendingUntoggle !== null}
        onClose={() => setPendingUntoggle(null)}
        disableClose={pendingUntoggle ? paidToggling.has(pendingUntoggle.id) : false}
        title={dashboardStrings.paidUntoggle.title}
      >
        <p className="mb-3">
          {dashboardStrings.paidUntoggle.body(
            `${pendingUntoggle?.vorname ?? ""} ${pendingUntoggle?.nachname ?? ""}`.trim(),
          )}
        </p>
        <p className="mb-6 text-sm text-gray-600">
          {dashboardStrings.paidUntoggle.preserveHint}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setPendingUntoggle(null)}
            disabled={pendingUntoggle ? paidToggling.has(pendingUntoggle.id) : false}
            className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {dashboardStrings.paidUntoggle.cancel}
          </button>
          <button
            onClick={confirmUntoggle}
            disabled={pendingUntoggle ? paidToggling.has(pendingUntoggle.id) : false}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {pendingUntoggle && paidToggling.has(pendingUntoggle.id)
              ? dashboardStrings.paidUntoggle.confirming
              : dashboardStrings.paidUntoggle.confirm}
          </button>
        </div>
      </Modal>

      <Modal
        open={bulkDeleteTarget !== null}
        onClose={() => setBulkDeleteTarget(null)}
        disableClose={bulkDeleting}
        title={dashboardStrings.bulkDelete.title}
      >
        <p className="mb-6">
          {bulkDeleteTarget?.type === "memberships"
            ? dashboardStrings.bulkDelete.bodyMemberships(bulkDeleteTarget.ids.length)
            : bulkDeleteTarget
              ? dashboardStrings.bulkDelete.bodyNewsletter(bulkDeleteTarget.ids.length)
              : null}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setBulkDeleteTarget(null)}
            disabled={bulkDeleting}
            className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {dashboardStrings.bulkDelete.cancel}
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {bulkDeleting ? dashboardStrings.bulkDelete.confirming : dashboardStrings.bulkDelete.confirm}
          </button>
        </div>
      </Modal>
    </div>
  );
}

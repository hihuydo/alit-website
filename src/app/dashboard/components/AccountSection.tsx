"use client";

import { useEffect, useRef, useState } from "react";
import { useDirty } from "../DirtyContext";
import { dashboardFetch } from "../lib/dashboardFetch";

type AccountForm = {
  email: string;
  currentPassword: string;
  newPassword: string;
};

// Fixed key ordering so snapshot comparisons are refactor-safe.
// Keys {email, currentPassword, newPassword} — if a field is added,
// update this helper AND every call site in one change.
const serializeAccountSnapshot = (form: AccountForm) =>
  JSON.stringify({
    email: form.email,
    currentPassword: form.currentPassword,
    newPassword: form.newPassword,
  });

const PRISTINE_SNAPSHOT = serializeAccountSnapshot({
  email: "",
  currentPassword: "",
  newPassword: "",
});

export function AccountSection() {
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);

  // Pristine from mount — isEdited diffs against this until first save resets it.
  const initialSnapshotRef = useRef<string>(PRISTINE_SNAPSHOT);
  // Sticky: once the user touches any field, fetch response is ignored so we
  // don't silently overwrite their input. Never reset.
  const userTouchedRef = useRef(false);

  useEffect(() => {
    fetch("/api/dashboard/account/")
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return;
        if (userTouchedRef.current) return;
        setEmail(data.data.email);
        initialSnapshotRef.current = serializeAccountSnapshot({
          email: data.data.email,
          currentPassword: "",
          newPassword: "",
        });
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const payload: Record<string, string> = { current_password: currentPassword };
      if (email) payload.email = email;
      if (newPassword) payload.new_password = newPassword;

      const res = await dashboardFetch("/api/dashboard/account/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setMessage("Änderungen gespeichert");
        setCurrentPassword("");
        setNewPassword("");
        initialSnapshotRef.current = serializeAccountSnapshot({
          email,
          currentPassword: "",
          newPassword: "",
        });
      } else {
        setError(data.error || "Fehler beim Speichern");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setSaving(false);
    }
  };

  const isEdited =
    serializeAccountSnapshot({ email, currentPassword, newPassword }) !==
    initialSnapshotRef.current;

  // Report dirty SYNCHRONOUSLY within render (see AgendaSection for rationale:
  // useEffect-based update races the next user event — sync-during-render
  // only mutates a ref in DirtyContext, no re-render triggered).
  const { setDirty } = useDirty();
  const lastReportedRef = useRef(false);
  if (isEdited !== lastReportedRef.current) {
    lastReportedRef.current = isEdited;
    setDirty("account", isEdited);
  }
  useEffect(() => () => setDirty("account", false), [setDirty]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Konto</h2>
      <form onSubmit={handleSave} className="max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">E-Mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              userTouchedRef.current = true;
              setEmail(e.target.value);
            }}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Neues Passwort (leer lassen um nicht zu ändern)</label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => {
                userTouchedRef.current = true;
                setNewPassword(e.target.value);
              }}
              maxLength={128}
              className="w-full px-3 py-2 pr-10 border rounded"
              placeholder="Mindestens 8 Zeichen"
            />
            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black" aria-label="Passwort anzeigen">
              {showNew ? "🙈" : "👁"}
            </button>
          </div>
        </div>
        <hr className="my-4" />
        <div>
          <label className="block text-sm font-medium mb-1">Aktuelles Passwort (zur Bestätigung)</label>
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => {
                userTouchedRef.current = true;
                setCurrentPassword(e.target.value);
              }}
              required
              maxLength={128}
              className="w-full px-3 py-2 pr-10 border rounded"
            />
            <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black" aria-label="Passwort anzeigen">
              {showCurrent ? "🙈" : "👁"}
            </button>
          </div>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-600 text-sm">{message}</p>}
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "..." : "Speichern"}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

export function AccountSection() {
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/account/")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setEmail(data.data.email);
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

      const res = await fetch("/api/dashboard/account/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setMessage("Änderungen gespeichert");
        setCurrentPassword("");
        setNewPassword("");
      } else {
        setError(data.error || "Fehler beim Speichern");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Konto</h2>
      <form onSubmit={handleSave} className="max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">E-Mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Neues Passwort (leer lassen um nicht zu ändern)</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            maxLength={128}
            className="w-full px-3 py-2 border rounded"
            placeholder="Mindestens 8 Zeichen"
          />
        </div>
        <hr className="my-4" />
        <div>
          <label className="block text-sm font-medium mb-1">Aktuelles Passwort (zur Bestätigung)</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            maxLength={128}
            className="w-full px-3 py-2 border rounded"
          />
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

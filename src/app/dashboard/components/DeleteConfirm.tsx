"use client";

import { Modal } from "./Modal";

interface DeleteConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  label: string;
}

export function DeleteConfirm({ open, onClose, onConfirm, label }: DeleteConfirmProps) {
  return (
    <Modal open={open} onClose={onClose} title="Löschen bestätigen">
      <p className="mb-6">Soll <strong>{label}</strong> wirklich gelöscht werden?</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50">Abbrechen</button>
        <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Löschen</button>
      </div>
    </Modal>
  );
}

"use client";

import { Modal } from "./Modal";
import { dashboardStrings } from "../i18n";

interface DeleteConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  label: string;
}

export function DeleteConfirm({ open, onClose, onConfirm, label }: DeleteConfirmProps) {
  const t = dashboardStrings.deleteConfirm;
  return (
    <Modal open={open} onClose={onClose} title={t.title}>
      <p className="mb-6">{t.body(label)}</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50">{t.cancel}</button>
        <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">{t.confirm}</button>
      </div>
    </Modal>
  );
}

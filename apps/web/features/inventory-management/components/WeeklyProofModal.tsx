"use client";

import React, { useState } from "react";
import { Modal, Button } from "@pos/ui";
import { AlertCircle } from "lucide-react";
import { getPrntScProxyUrl } from "@/lib/prntsc";
import { submitWeeklyCleaningProof } from "../api/inventory-management-api";
import type { InventorySummary } from "../types/inventory-management";

interface WeeklyProofModalProps {
  open: boolean;
  onClose: () => void;
  initialSummary: InventorySummary;
  onSuccess: (message: string) => void;
}

export function WeeklyProofModal({
  open,
  onClose,
  initialSummary,
  onSuccess,
}: WeeklyProofModalProps) {
  const [proofUrl, setProofUrl] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedProofUrl = proofUrl.trim();
  const proofPreviewUrl = getPrntScProxyUrl(trimmedProofUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedProofUrl) {
      setError("Link prnt.sc wajib diisi.");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      await submitWeeklyCleaningProof({
        proofUrl: trimmedProofUrl,
        note: note || null,
      });
      onSuccess("Proof kebersihan gudang berhasil dikirim.");
      setProofUrl("");
      setNote("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim data");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Submit Proof Kebersihan Gudang" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-slate-700">
          <p className="font-medium">
            Kirimkan tautan bukti kebersihan gudang untuk{" "}
            <span className="font-bold text-slate-900">
              Minggu {initialSummary.period.weekKey}
            </span>
            .
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Status minggu ini:</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                initialSummary.counts.weeklyProofMissing
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {initialSummary.counts.weeklyProofMissing ? "Belum submit" : "Selesai"}
            </span>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">
            Link prnt.sc
          </label>
          <input
            name="weeklyProofUrl"
            type="url"
            required
            value={proofUrl}
            onChange={(e) => setProofUrl(e.target.value)}
            placeholder="https://prnt.sc/..."
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 transition-colors"
          />
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Buka prnt.sc, unggah foto kebersihan, lalu tempel link hasil upload di sini.
          </p>
          {proofPreviewUrl && (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <img
                src={proofPreviewUrl}
                alt="Preview bukti kebersihan gudang"
                className="max-h-56 w-full object-contain"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">
            Catatan (Opsional)
          </label>
          <textarea
            name="weeklyProofNote"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 transition-colors"
            placeholder="Masukkan keterangan detail kebersihan gudang..."
          />
        </div>

        <div className="pt-2 flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1 cursor-pointer"
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button
            type="submit"
            className="flex-1 bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Memproses..." : "Submit Proof"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import React, { useState } from "react";
import { Modal, Button } from "@pos/ui";
import { AlertCircle } from "lucide-react";
import { submitDailyStockMatching } from "../api/inventory-management-api";
import type { InventorySummary } from "../types/inventory-management";

interface DailyMatchingModalProps {
  open: boolean;
  onClose: () => void;
  initialSummary: InventorySummary;
  onSuccess: (message: string) => void;
}

export function DailyMatchingModal({
  open,
  onClose,
  initialSummary,
  onSuccess,
}: DailyMatchingModalProps) {
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await submitDailyStockMatching({ note: note || null });
      onSuccess("Matching stok harian berhasil dikirim.");
      setNote("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim data");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Matching Stok Harian" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-slate-700">
          <p className="font-medium">
            Cocokkan stok fisik dengan log OUT/internal tanggal{" "}
            <span className="font-bold text-slate-900">
              {initialSummary.period.dateKey}
            </span>
            .
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Status hari ini:</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                initialSummary.counts.dailyMatchingIncomplete
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {initialSummary.counts.dailyMatchingIncomplete ? "Belum match" : "Selesai"}
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
            Catatan Matching
          </label>
          <textarea
            name="dailyMatchingNote"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 transition-colors"
            placeholder="Tuliskan catatan penyesuaian atau pencocokan jika ada..."
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
            {isSubmitting ? "Memproses..." : "Submit Matching"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

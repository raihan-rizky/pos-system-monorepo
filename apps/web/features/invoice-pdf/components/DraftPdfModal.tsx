"use client";

import React, { useState, useCallback, useMemo } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button, Modal } from "@pos/ui";
import type { Transaction } from "@/hooks/useTransactions";
import { useStoreSettings } from "@/hooks/useSettings";
import { decodeDivisionFromNote } from "@/features/nota-penawaran/helpers/division-note";

/* ── Component ─────────────────────────────────────────────────── */
interface DraftPdfModalProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
  kepadaYth: string;
  divisiPurchasing: string;
}

export function DraftPdfModal({
  open,
  onClose,
  transaction,
  kepadaYth,
  divisiPurchasing,
}: DraftPdfModalProps) {
  const { data: storeSettings } = useStoreSettings();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGeneratePdf = useCallback(async () => {
    if (!storeSettings || isGenerating) return;

    setIsGenerating(true);
    try {
      const { openDraftPdf } = await import(
        "@/features/invoice-pdf/helpers/generate-draft-pdf"
      );

      // Build the absolute URL for the kop surat header image
      const headerImageSrc = `${window.location.origin}/images/kop-surat-header.png`;

      await openDraftPdf(
        transaction,
        {
          name: storeSettings.name,
          address: storeSettings.address,
          phone: storeSettings.phone,
        },
        {
          kepadaYth,
          divisiPurchasing,
          headerImageSrc,
        }
      );
    } catch (error) {
      console.error("Failed to generate draft PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [
    transaction,
    storeSettings,
    kepadaYth,
    divisiPurchasing,
    isGenerating,
  ]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cetak Nota Penawaran (PDF)"
      size="md"
    >
      <div className="space-y-4 print:hidden">
        {/* ── Info banner ──────────────────────────────────────── */}
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
          <p className="text-xs font-semibold text-emerald-800">
            ✨ Mode PDF — Nota penawaran akan dibuat sebagai file PDF ukuran A4.
          </p>
          <p className="text-[11px] text-emerald-600 mt-0.5">
            Layout identik di semua printer.
          </p>
        </div>

        {/* ── Summary ─────────────────────────────────────────── */}
        <div className="rounded-xl bg-surface-50 border border-surface-200 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-surface-500">Kepada Yth</span>
            <span className="font-semibold text-surface-800">
              {kepadaYth || "Pelanggan Umum"}
            </span>
          </div>
          {divisiPurchasing && (
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Divisi</span>
              <span className="font-semibold text-surface-800">
                {divisiPurchasing}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-surface-500">Jumlah Item</span>
            <span className="font-semibold text-surface-800">
              {transaction.items?.length ?? 0} item
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-surface-500">Total</span>
            <span className="font-bold text-surface-900">
              Rp {Number(transaction.total).toLocaleString("id-ID")}
            </span>
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────── */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="secondary"
            size="lg"
            onClick={onClose}
            className="flex-1"
          >
            Batal
          </Button>
          <Button
            variant="accent"
            size="lg"
            onClick={handleGeneratePdf}
            disabled={isGenerating || !storeSettings}
            icon={
              isGenerating ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <FileText size={18} />
              )
            }
            className="flex-1"
          >
            {isGenerating ? "Membuat PDF..." : "Buat & Buka PDF"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

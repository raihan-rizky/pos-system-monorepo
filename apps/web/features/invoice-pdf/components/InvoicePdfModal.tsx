"use client";

import React, { useState, useCallback, useMemo } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button, Modal } from "@pos/ui";
import type { Transaction } from "@/hooks/useTransactions";
import { useStoreSettings } from "@/hooks/useSettings";

/* ── Paper size presets (same as InvoicePrintModal) ─────────────── */
type PaperPreset = {
  label: string;
  w: number;
  h: number;
};

const PAPER_PRESETS: PaperPreset[] = [
  { label: "Half A4", w: 165, h: 215 },
  { label: "A4", w: 210, h: 297 },
  { label: "Legal", w: 216, h: 356 },
  { label: "Letter", w: 216, h: 279 },
];

type Orientation = "portrait" | "landscape";

/* ── Component ─────────────────────────────────────────────────── */
interface InvoicePdfModalProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
}

export function InvoicePdfModal({
  open,
  onClose,
  transaction,
}: InvoicePdfModalProps) {
  const { data: storeSettings } = useStoreSettings();
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [isCustom, setIsCustom] = useState(false);
  const [customW, setCustomW] = useState(210);
  const [customH, setCustomH] = useState(297);
  const [isGenerating, setIsGenerating] = useState(false);

  const pageDims = useMemo(() => {
    let w: number;
    let h: number;

    if (isCustom) {
      w = customW;
      h = customH;
    } else {
      const preset = PAPER_PRESETS[selectedPreset];
      w = preset.w;
      h = preset.h;
    }

    const short = Math.min(w, h);
    const long = Math.max(w, h);

    return orientation === "portrait"
      ? { w: short, h: long }
      : { w: long, h: short };
  }, [selectedPreset, orientation, isCustom, customW, customH]);

  const previewScale = useMemo(() => {
    const maxW = 400;
    const maxH = 500;
    const scaleW = maxW / pageDims.w;
    const scaleH = maxH / pageDims.h;
    return Math.min(scaleW, scaleH, 1.5);
  }, [pageDims]);

  const previewStoreName = storeSettings?.name || "TOKO TELADAN";
  const previewStoreAddress = storeSettings?.address || "Jl. Temu Putih No.30 Cilegon";
  const previewStorePhone = storeSettings?.phone || "0254 393022";

  const handlePresetChange = useCallback((index: number) => {
    setSelectedPreset(index);
    setIsCustom(false);
    setOrientation(index === 0 ? "landscape" : "portrait");
  }, []);

  const handleCustom = useCallback(() => {
    setIsCustom(true);
    setOrientation("portrait");
  }, []);

  /* Generate PDF and open in new tab */
  const handleGeneratePdf = useCallback(async () => {
    if (!storeSettings || isGenerating) return;

    setIsGenerating(true);
    try {
      // Dynamic import to avoid loading @react-pdf/renderer until needed
      const { openInvoicePdf } = await import(
        "@/features/invoice-pdf/helpers/generate-invoice-pdf"
      );

      await openInvoicePdf(
        transaction,
        {
          name: storeSettings.name,
          address: storeSettings.address,
          phone: storeSettings.phone,
        },
        pageDims
      );
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [transaction, storeSettings, pageDims, isGenerating]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cetak Invoice PDF"
      size="3xl"
    >
      <div className="space-y-5 print:hidden">
        {/* ── Info banner ─────────────────────────────────────────── */}
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
          <p className="text-xs font-semibold text-emerald-800">
            ✨ Mode PDF — Invoice akan dibuat sebagai file PDF yang identik di semua printer.
          </p>
          <p className="text-[11px] text-emerald-600 mt-0.5">
            Tidak akan terpotong atau berubah layout meskipun printer berbeda-beda.
          </p>
        </div>

        {/* ── Size + Orientation row ──────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Paper size */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-surface-700">
              Ukuran Kertas
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PAPER_PRESETS.map((preset, i) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePresetChange(i)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                    !isCustom && selectedPreset === i
                      ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20"
                      : "border-surface-200 bg-white text-surface-600 hover:border-surface-300 hover:bg-surface-50"
                  }`}
                >
                  <span className="block font-semibold">{preset.label}</span>
                  <span className="block text-[10px] text-surface-400 mt-0.5">
                    {preset.w} × {preset.h}mm
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={handleCustom}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                  isCustom
                    ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20"
                    : "border-surface-200 bg-white text-surface-600 hover:border-surface-300 hover:bg-surface-50"
                }`}
              >
                <span className="block font-semibold">Custom</span>
                <span className="block text-[10px] text-surface-400 mt-0.5">
                  Manual
                </span>
              </button>
            </div>

            {/* Custom inputs */}
            {isCustom && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-surface-500">
                    Lebar (mm)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={600}
                    value={customW}
                    onChange={(e) => setCustomW(Number(e.target.value) || 50)}
                    className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <span className="mt-5 text-surface-400 font-medium">×</span>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-surface-500">
                    Tinggi (mm)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={600}
                    value={customH}
                    onChange={(e) => setCustomH(Number(e.target.value) || 50)}
                    className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Orientation */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-surface-700">
              Orientasi
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOrientation("portrait")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                  orientation === "portrait"
                    ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20"
                    : "border-surface-200 bg-white text-surface-600 hover:border-surface-300 hover:bg-surface-50"
                }`}
              >
                <div className="h-7 w-5 rounded border-2 border-current" />
                Portrait
              </button>
              <button
                type="button"
                onClick={() => setOrientation("landscape")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                  orientation === "landscape"
                    ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20"
                    : "border-surface-200 bg-white text-surface-600 hover:border-surface-300 hover:bg-surface-50"
                }`}
              >
                <div className="h-5 w-7 rounded border-2 border-current" />
                Landscape
              </button>
            </div>

            {/* Dimensions display */}
            <div className="mt-3 rounded-lg bg-surface-50 px-3 py-2 text-center">
              <span className="text-xs text-surface-500">Ukuran cetak: </span>
              <span className="text-sm font-semibold text-surface-800">
                {pageDims.w}mm × {pageDims.h}mm
              </span>
            </div>
          </div>
        </div>

        {/* ── Preview ─────────────────────────────────────────────── */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-surface-700">
            Preview
          </label>
          <div className="flex items-center justify-center rounded-xl border border-surface-200 bg-surface-50/50 p-6 min-h-[200px]">
            <div
              className="relative bg-white border border-surface-300 shadow-lg transition-all duration-300 ease-out overflow-hidden"
              style={{
                width: pageDims.w * previewScale,
                height: pageDims.h * previewScale,
              }}
            >
              {/* Mini invoice skeleton preview */}
              <div
                className="absolute inset-0 p-3 flex flex-col"
                style={{
                  transform: `scale(${previewScale * 0.85})`,
                  transformOrigin: "top left",
                }}
              >
                <div className="mb-1">
                  <div className="flex items-start gap-1.5">
                    <div className="w-3.5 h-3.5 rounded-sm bg-surface-200 flex-shrink-0" />
                    <div>
                      <div className="font-bold text-[6px] text-black leading-none mb-0.5">FAKTUR PENJUALAN</div>
                      <div className="font-bold text-[5px] text-[#003366] leading-none">{previewStoreName}</div>
                      <div className="text-[3px] text-black leading-none mt-0.5">{previewStoreAddress}</div>
                      <div className="text-[3px] text-black leading-none">Telp: {previewStorePhone}</div>
                    </div>
                  </div>
                </div>
                <div className="mb-1.5 h-0.5 w-full bg-red-400" />
                <div className="mb-1.5 grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="h-1.5 w-24 rounded bg-surface-200" />
                    <div className="h-1.5 w-20 rounded bg-surface-200" />
                    <div className="h-1.5 w-16 rounded bg-surface-200" />
                  </div>
                  <div className="space-y-1">
                    <div className="h-1.5 w-20 rounded bg-surface-200" />
                    <div className="h-1.5 w-16 rounded bg-surface-200" />
                    <div className="h-1.5 w-18 rounded bg-surface-200" />
                  </div>
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="h-2.5 w-full rounded bg-surface-100 border border-surface-200" />
                  <div className="h-2 w-full rounded bg-surface-50 border border-surface-100" />
                  <div className="h-2 w-full rounded bg-surface-50 border border-surface-100" />
                  <div className="h-2 w-full rounded bg-surface-50 border border-surface-100" />
                </div>
                <div className="mt-auto flex justify-end">
                  <div className="space-y-0.5 text-right">
                    <div className="h-2 w-24 rounded bg-surface-200 ml-auto" />
                    <div className="h-2 w-20 rounded bg-surface-200 ml-auto" />
                    <div className="h-2 w-16 rounded bg-surface-200 ml-auto" />
                  </div>
                </div>
              </div>
              {/* PDF badge */}
              <div className="absolute top-1 left-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[8px] text-white font-bold tracking-wide">
                PDF
              </div>
              <div className="absolute bottom-1 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white font-medium">
                {pageDims.w}×{pageDims.h}
              </div>
            </div>
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────── */}
        <div className="sticky bottom-0 bg-white z-10 flex gap-3 border-t border-surface-100 pt-4 pb-2">
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

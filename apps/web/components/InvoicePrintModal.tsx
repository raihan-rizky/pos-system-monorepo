"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Printer, RotateCcw } from "lucide-react";
import { Button, Modal } from "@pos/ui";

/* ── Paper size presets ────────────────────────────────────────────── */
type PaperPreset = {
  label: string;
  /** Width in mm (portrait orientation, w < h) */
  w: number;
  /** Height in mm (portrait orientation) */
  h: number;
};

const PAPER_PRESETS: PaperPreset[] = [
  { label: "Half A4", w: 165, h: 215 },
  { label: "A4", w: 210, h: 297 },
  { label: "Legal", w: 216, h: 356 },
  { label: "Letter", w: 216, h: 279 },
];

type Orientation = "portrait" | "landscape";

/* ── Component ─────────────────────────────────────────────────────── */
interface InvoicePrintModalProps {
  open: boolean;
  onClose: () => void;
}

export function InvoicePrintModal({ open, onClose }: InvoicePrintModalProps) {
  const [selectedPreset, setSelectedPreset] = useState(0); // default Half A4
  const [orientation, setOrientation] = useState<Orientation>("landscape"); // Half A4 defaults to landscape
  const [isCustom, setIsCustom] = useState(false);
  const [customW, setCustomW] = useState(210);
  const [customH, setCustomH] = useState(297);

  /* Resolved page dimensions (respecting orientation) */
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

    // In portrait: smaller side = width. In landscape: swap.
    const short = Math.min(w, h);
    const long = Math.max(w, h);

    return orientation === "portrait"
      ? { w: short, h: long }
      : { w: long, h: short };
  }, [selectedPreset, orientation, isCustom, customW, customH]);

  /* Preview scaling: fit the page preview into a 400×500 box */
  const previewScale = useMemo(() => {
    const maxW = 400;
    const maxH = 500;
    const scaleW = maxW / pageDims.w;
    const scaleH = maxH / pageDims.h;
    return Math.min(scaleW, scaleH, 1.5);
  }, [pageDims]);

  const handlePresetChange = useCallback(
    (index: number) => {
      setSelectedPreset(index);
      setIsCustom(false);
      // Half A4 defaults to landscape, others to portrait
      setOrientation(index === 0 ? "landscape" : "portrait");
    },
    [],
  );

  const handleCustom = useCallback(() => {
    setIsCustom(true);
    setOrientation("portrait");
  }, []);

  const toggleOrientation = useCallback(() => {
    setOrientation((prev) => (prev === "portrait" ? "landscape" : "portrait"));
  }, []);

  /* Print with dynamic @page size */
  const handlePrint = useCallback(() => {
    const styleId = "invoice-print-page-size";
    // Remove any previous injection
    document.getElementById(styleId)?.remove();

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `@media print { @page { size: ${pageDims.w}mm ${pageDims.h}mm; margin: 0; } }`;
    document.head.appendChild(style);

    // Also update the #print-receipt dimensions to match
    const receipt = document.getElementById("print-receipt");
    if (receipt) {
      receipt.style.setProperty("--page-w", `${pageDims.w}mm`);
      receipt.style.setProperty("--page-h", `${pageDims.h}mm`);
    }

    // Small delay to let the browser apply the styles
    requestAnimationFrame(() => {
      window.print();
      // Clean up after print dialog closes
      setTimeout(() => {
        document.getElementById(styleId)?.remove();
        if (receipt) {
          receipt.style.removeProperty("--page-w");
          receipt.style.removeProperty("--page-h");
        }
      }, 500);
    });
  }, [pageDims]);

  return (
    <Modal open={open} onClose={onClose} title="Pengaturan Cetak Invoice" size="3xl">
      <div className="space-y-5 print:hidden">
        {/* ── Size + Orientation row ───────────────────────────────── */}
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
                <span className="block text-[10px] text-surface-400 mt-0.5">Manual</span>
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

        {/* ── Preview ──────────────────────────────────────────────── */}
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
                style={{ transform: `scale(${previewScale * 0.85})`, transformOrigin: "top left" }}
              >
                {/* Store name skeleton */}
                <div className="mb-1">
                  <div className="h-3.5 w-28 rounded bg-surface-800" />
                  <div className="mt-0.5 h-1.5 w-36 rounded bg-surface-300" />
                </div>
                <div className="mb-1.5 h-0.5 w-full bg-red-400" />
                {/* Info rows skeleton */}
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
                {/* Table skeleton */}
                <div className="flex-1 space-y-0.5">
                  <div className="h-2.5 w-full rounded bg-surface-100 border border-surface-200" />
                  <div className="h-2 w-full rounded bg-surface-50 border border-surface-100" />
                  <div className="h-2 w-full rounded bg-surface-50 border border-surface-100" />
                  <div className="h-2 w-full rounded bg-surface-50 border border-surface-100" />
                </div>
                {/* Total skeleton */}
                <div className="mt-auto flex justify-end">
                  <div className="space-y-0.5 text-right">
                    <div className="h-2 w-24 rounded bg-surface-200 ml-auto" />
                    <div className="h-2 w-20 rounded bg-surface-200 ml-auto" />
                    <div className="h-2 w-16 rounded bg-surface-200 ml-auto" />
                  </div>
                </div>
              </div>
              {/* Page dimensions label */}
              <div className="absolute bottom-1 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white font-medium">
                {pageDims.w}×{pageDims.h}
              </div>
            </div>
          </div>
        </div>

        {/* ── Actions ──────────────────────────────────────────────── */}
        <div className="flex gap-3 border-t border-surface-100 pt-4">
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
            onClick={handlePrint}
            icon={<Printer size={18} />}
            className="flex-1"
          >
            Cetak
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default InvoicePrintModal;

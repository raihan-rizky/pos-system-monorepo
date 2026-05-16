"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Modal, Input, Button } from "@pos/ui";
import { AlertCircle, Wallet, StickyNote } from "lucide-react";
import { useOpenShift } from "@/hooks/useShift";
import { formatRupiah } from "@/lib/utils";

/** Props for the OpenShiftModal component. */
export interface OpenShiftModalProps {
  open: boolean;
  onClose?: () => void;
}

/**
 * Modal for initializing a new cashier shift.
 * Uses shared @pos/ui primitives (Modal, Input, Button) to stay
 * visually consistent with CloseShiftModal, EditShiftModal, and PaymentModal.
 */
export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({ open, onClose }) => {
  // ── Hooks ──────────────────────────────────────────────────────────────
  const [openingBalance, setOpeningBalance] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { mutateAsync: openShift, isPending } = useOpenShift();

  // ── Derived ────────────────────────────────────────────────────────────
  const numericBalance = useMemo(
    () => Number(openingBalance) || 0,
    [openingBalance],
  );

  const formattedBalance = useMemo(
    () => formatRupiah(numericBalance),
    [numericBalance],
  );

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);
      try {
        await openShift({ openingBalance: numericBalance, note });
        onClose?.();
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Gagal membuka shift. Coba lagi.",
        );
      }
    },
    [numericBalance, note, openShift, onClose],
  );

  const handleOpeningBalanceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setOpeningBalance(e.target.value);
      setSubmitError(null);
    },
    [],
  );

  const handleNoteChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNote(e.target.value);
    },
    [],
  );

  // ── Quick-fill presets ─────────────────────────────────────────────────
  const quickAmounts = useMemo(() => [100000, 200000, 300000, 500000], []);

  const handleQuickFill = useCallback((amount: number) => {
    setOpeningBalance(String(amount));
    setSubmitError(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Modal open={open} onClose={handleClose} title="Buka Shift Kasir">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Hero badge — visual anchor */}
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow">
            <Wallet className="w-7 h-7 text-white" />
          </div>
          <div className="text-center">
            <p className="text-sm text-surface-500 leading-relaxed max-w-[280px]">
              Masukkan jumlah uang fisik yang ada di laci kasir sebelum memulai.
            </p>
          </div>
        </div>

        {/* Error alert */}
        {submitError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700 animate-fade-in"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Opening Balance */}
        <div>
          <label
            htmlFor="opening-balance"
            className="block text-sm font-medium text-surface-700 mb-1"
          >
            Modal Awal Laci
          </label>
          <p className="text-xs text-surface-400 mb-3">
            Hitung seluruh uang tunai di dalam laci saat ini.
          </p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500 font-bold select-none">
              Rp
            </span>
            <Input
              id="opening-balance"
              type="number"
              required
              min="0"
              value={openingBalance}
              onChange={handleOpeningBalanceChange}
              placeholder="0"
              className="pl-12 text-xl font-extrabold h-14"
              autoFocus
            />
          </div>

          {/* Formatted preview */}
          {numericBalance > 0 && (
            <p className="text-xs text-brand-600 font-medium mt-1.5 animate-fade-in">
              Diformat: {formattedBalance}
            </p>
          )}

          {/* Quick-fill chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => handleQuickFill(amount)}
                className={`
                  px-3 py-1.5 text-xs font-medium rounded-lg
                  transition-colors duration-200 cursor-pointer
                  ${
                    numericBalance === amount
                      ? "bg-brand-100 text-brand-700 border border-brand-300"
                      : "bg-surface-100 text-surface-600 hover:bg-surface-200 border border-transparent"
                  }
                `}
              >
                {formatRupiah(amount)}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div>
          <label
            htmlFor="shift-note"
            className="block text-sm font-medium text-surface-700 mb-1"
          >
            <span className="inline-flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5" />
              Catatan (Opsional)
            </span>
          </label>
          <Input
            id="shift-note"
            type="text"
            value={note}
            onChange={handleNoteChange}
            placeholder="Cth: Uang pas, tidak ada pecahan"
          />
        </div>

        {/* Actions */}
        <div className="pt-4 flex gap-3">
          {onClose && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              className="flex-1"
              disabled={isPending}
            >
              Nanti
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            disabled={isPending}
            loading={isPending}
          >
            {isPending ? "Memproses..." : "Buka Shift"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default OpenShiftModal;

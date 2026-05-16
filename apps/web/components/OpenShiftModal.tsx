"use client";

import React, { useState, useCallback } from "react";
import { AlertCircle, Terminal, X } from "lucide-react";
import { useOpenShift } from "@/hooks/useShift";
import { formatRupiah } from "@/lib/utils";

export interface OpenShiftModalProps {
  open: boolean;
  onClose?: () => void;
}

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({ open, onClose }) => {
  // 1. Hooks
  const [openingBalance, setOpeningBalance] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const { mutateAsync: openShift, isPending } = useOpenShift();

  // 2. Handlers
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);
      try {
        await openShift({ openingBalance: Number(openingBalance) || 0, note });
        onClose?.();
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "System fault: Init shift failed.",
        );
      }
    },
    [openingBalance, note, openShift, onClose]
  );

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleOpeningBalanceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setOpeningBalance(e.target.value);
    setSubmitError(null);
  }, []);

  const handleNoteChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNote(e.target.value);
  }, []);

  // 3. Render
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-surface-900/80 backdrop-blur-md transition-opacity animate-fade-in" 
        onClick={handleClose} 
        aria-hidden="true"
      />
      
      {/* Industrial Utilitarian Modal */}
      <div className="relative z-10 w-full max-w-lg bg-white shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] border-4 border-surface-900 animate-scale-in">
        
        {/* Header Ribbon */}
        <div className="flex items-center justify-between border-b-4 border-surface-900 bg-brand-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <Terminal className="w-6 h-6 text-brand-600" />
            <h2 className="text-sm font-mono font-bold tracking-widest text-surface-900 uppercase">
              Sys // Shift_Init
            </h2>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={handleClose}
              aria-label="Tutup modal buka shift"
              className="p-1 text-surface-900 hover:bg-brand-200 transition-colors border-2 border-transparent hover:border-surface-900"
            >
              <X className="h-5 w-5 stroke-[3]" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8 bg-white bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
          
          {/* Status Alert */}
          {submitError && (
            <div className="flex items-start gap-3 border-l-4 border-danger-500 bg-danger-50 p-4 shadow-[4px_4px_0px_0px_rgba(220,38,38,0.2)]">
              <AlertCircle className="h-5 w-5 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-sm font-mono font-medium text-danger-900">{submitError}</p>
            </div>
          )}

          {/* Primary Input Group */}
          <div className="space-y-2">
            <label className="block text-xs font-mono font-bold tracking-widest text-surface-500 uppercase">
              [01] Opening Balance_
            </label>
            <div className="relative flex items-baseline border-b-4 border-surface-900 group focus-within:border-brand-600 transition-colors pb-2">
              <span className="text-3xl sm:text-4xl font-mono font-bold text-surface-400 mr-3 select-none group-focus-within:text-brand-600 transition-colors">
                Rp
              </span>
              <input
                type="number"
                required
                min="0"
                value={openingBalance}
                onChange={handleOpeningBalanceChange}
                placeholder="0"
                className="w-full bg-transparent text-5xl sm:text-7xl font-mono font-black text-surface-900 placeholder:text-surface-200 focus:outline-none tracking-tighter"
                autoFocus
              />
            </div>
            <div className="flex justify-between items-center mt-3">
              <p className="text-xs font-mono text-brand-700 font-bold bg-brand-100 px-3 py-1.5 border-2 border-brand-200 inline-block">
                FMT: {formatRupiah(Number(openingBalance) || 0)}
              </p>
              <p className="text-[10px] font-mono text-surface-400 uppercase tracking-widest hidden sm:block">
                Numeric Input Only
              </p>
            </div>
          </div>

          {/* Secondary Input Group */}
          <div className="space-y-2">
            <label className="block text-xs font-mono font-bold tracking-widest text-surface-500 uppercase">
              [02] Auth Note (Optional)_
            </label>
            <input
              type="text"
              value={note}
              onChange={handleNoteChange}
              placeholder="e.g. Starting float adjusted"
              className="w-full border-2 border-surface-300 bg-surface-50 px-4 py-3 font-mono text-sm font-medium text-surface-900 placeholder:text-surface-400 focus:border-surface-900 focus:bg-white focus:outline-none focus:ring-0 transition-all shadow-inner"
            />
          </div>

          {/* Action Area */}
          <div className="pt-6">
            <button
              type="submit"
              disabled={isPending}
              className="group relative w-full overflow-hidden border-4 border-surface-900 bg-brand-500 px-6 py-4 font-mono text-lg font-black uppercase tracking-widest text-surface-900 transition-all hover:bg-brand-400 hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:translate-y-0 active:shadow-none disabled:bg-surface-200 disabled:border-surface-300 disabled:text-surface-400 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:cursor-not-allowed"
            >
              <span className="relative z-10 flex items-center justify-center gap-3">
                {isPending ? (
                  <>
                    <Terminal className="w-5 h-5 animate-pulse" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    Initialize Shift
                    <span className="inline-block transition-transform group-hover:translate-x-2">→</span>
                  </>
                )}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OpenShiftModal;

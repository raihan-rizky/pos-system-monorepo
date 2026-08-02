"use client";

import React, { useState, useEffect } from "react";
import { CashierShift } from "@/hooks/useShift";
import { formatRupiah } from "@/lib/utils";
import { formatShiftDurationDisplay } from "@/lib/shift/shift-pause";

interface ShiftStatusBannerProps {
  shift: CashierShift;
  onCloseShift: () => void;
  canCloseShift?: boolean;
}

export function ShiftStatusBanner({ shift, onCloseShift, canCloseShift = true }: ShiftStatusBannerProps) {
  const [uptime, setUptime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUptime(formatShiftDurationDisplay(shift, now));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [shift]);

  return (
    <div className="bg-brand-50 border-b border-brand-100 px-4 md:px-6 py-2.5 flex items-center justify-between text-sm">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${shift.pausedAt ? "bg-amber-500" : "bg-brand-500 animate-pulse"}`} />
        <span className="font-semibold text-brand-900">
          {shift.pausedAt ? "Shift Dijeda" : shift.isLocalOnly ? "Shift Offline Aktif" : "Shift Aktif"}
        </span>
        <span className="hidden sm:inline text-brand-600/60 font-medium px-2 border-l border-brand-200">
          Uptime: <span className="text-brand-700">{uptime}</span>
        </span>
        <span className="hidden sm:inline text-brand-600/60 font-medium px-2 border-l border-brand-200">
          Modal: <span className="text-brand-700">{formatRupiah(shift.openingBalance)}</span>
        </span>
      </div>
      {canCloseShift && (
        <button
          onClick={onCloseShift}
          className="text-brand-700 hover:text-brand-900 hover:bg-brand-100 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors"
        >
          TUTUP SHIFT
        </button>
      )}
    </div>
  );
}

import React from "react";

/**
 * Data-driven status banner for the receipt.
 * Replaces four near-identical JSX blocks that differed only in
 * color scheme and label text.
 */

export interface StatusBannerConfig {
  label: string;
  subtitle: string;
  ariaLabel: string;
  /** Inline styles for bg/text/border so Tailwind purge cannot strip them. */
  style: {
    backgroundColor: string;
    color: string;
    borderBottomColor: string;
  };
}

const PRINT_COLOR_ADJUST: React.CSSProperties = {
  printColorAdjust: "exact",
  WebkitPrintColorAdjust: "exact",
} as React.CSSProperties;

/** Map of transaction status → banner configuration */
export const STATUS_BANNER_MAP: Record<string, StatusBannerConfig> = {
  DRAFT: {
    label: "FAKTUR SEMENTARA",
    subtitle: "Bukan bukti pembayaran",
    ariaLabel: "Faktur sementara, bukan bukti pembayaran",
    style: {
      backgroundColor: "#fef3c7", // amber-100
      color: "#78350f",           // amber-900
      borderBottomColor: "#fcd34d", // amber-300
    },
  },
  PENDING_APPROVAL: {
    label: "MENUNGGU PERSETUJUAN",
    subtitle: "Bukan bukti pembayaran",
    ariaLabel: "Menunggu persetujuan, bukan bukti pembayaran",
    style: {
      backgroundColor: "#dbeafe", // blue-100
      color: "#1e3a5f",           // blue-900
      borderBottomColor: "#93c5fd", // blue-300
    },
  },
  VOIDED: {
    label: "DIBATALKAN",
    subtitle: "Invoice ini tidak sah",
    ariaLabel: "Transaksi dibatalkan",
    style: {
      backgroundColor: "#f1f5f9", // surface-100
      color: "#475569",           // surface-600
      borderBottomColor: "#cbd5e1", // surface-300
    },
  },
  REFUNDED: {
    label: "DIREFUND",
    subtitle: "Dana telah dikembalikan",
    ariaLabel: "Transaksi direfund",
    style: {
      backgroundColor: "#fee2e2", // red-100
      color: "#991b1b",           // red-800
      borderBottomColor: "#fca5a5", // red-300
    },
  },
};

interface StatusBannerProps {
  status: string;
}

export function StatusBanner({ status }: StatusBannerProps) {
  const config = STATUS_BANNER_MAP[status];
  if (!config) return null;

  return (
    <div
      role="status"
      aria-label={config.ariaLabel}
      className="mb-2 -mx-4 -mt-4 px-4 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider"
      style={{
        ...config.style,
        borderBottom: `2px solid ${config.style.borderBottomColor}`,
        ...PRINT_COLOR_ADJUST,
      }}
    >
      <span>{config.label}</span>
      <span className="font-medium normal-case tracking-normal">
        {config.subtitle}
      </span>
    </div>
  );
}

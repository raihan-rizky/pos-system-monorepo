"use client";

import React, { useMemo } from "react";
import { DraftReceiptModal } from "./DraftReceiptModal";
import { Modal, Button } from "@pos/ui";
import { formatDate } from "@/lib/utils";
import type { Transaction } from "@/hooks/useTransactions";
import { useStoreSettings } from "@/hooks/useSettings";
import { StatusBanner } from "./StatusBanner";
import { formatDraftNumberForDisplay } from "@/features/transactions-draft/helpers/draft-number";
import "./receipt-print.css";

// ── Fix #5: configurable compact threshold ──────────────────────────
/** Number of line-items at which the receipt switches to compact layout. */
const COMPACT_ITEM_THRESHOLD = 4;

// ── Fix #10: inline styles instead of dynamic Tailwind classes ──────
/** Status → style mapping (purge-safe: no dynamic class generation). */
const STATUS_STYLE_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "BELUM LUNAS", color: "#b45309" },
  PENDING_APPROVAL: { label: "MENUNGGU PERSETUJUAN", color: "#1d4ed8" },
  DP: { label: "UANG MUKA (DP)", color: "#b45309" },
  VOIDED: { label: "DIBATALKAN", color: "#64748b" },
  REFUNDED: { label: "DIREFUND", color: "#dc2626" },
};
const DEFAULT_STATUS_STYLE = { label: "LUNAS", color: "#047857" };

function getReceiptStatusStyle(status: string) {
  return STATUS_STYLE_MAP[status] ?? DEFAULT_STATUS_STYLE;
}

function formatReceiptSize(size?: string | null) {
  return size?.split(" = ")[0] ?? "";
}

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
  draftPrintDivision?: string;
}

export function ReceiptModal({
  open,
  onClose,
  transaction,
  draftPrintDivision,
}: ReceiptModalProps) {
  const { data: storeSettings } = useStoreSettings();
  const handlePrint = () => {
    window.print();
  };

  const items = transaction?.items || [];
  // ── Fix #5: use named constant ─────────────────────────────────
  const compact = items.length >= COMPACT_ITEM_THRESHOLD;
  const isDraft = transaction?.status === "DRAFT";

  const isPending = transaction?.status === "PENDING_APPROVAL";
  const isVoided = transaction?.status === "VOIDED";
  const isRefunded = transaction?.status === "REFUNDED";
  const isCancelled = isVoided || isRefunded;
  const displayInvoice =
    transaction?.invoiceNumber ??
    formatDraftNumberForDisplay(transaction?.draftNumber) ??
    "";

  const storeName = storeSettings?.name || "TOKO TELADAN";

  // ── Fix #4: single split, memoized ────────────────────────────
  const nameParts = useMemo(() => {
    const words = storeName.split(" ");
    return words.map((word, i) => ({
      first: word[0] || "",
      rest: word.slice(1),
      isLast: i === words.length - 1,
    }));
  }, [storeName]);

  // ── DRAFT transactions: render the A4 formal invoice directly ──
  if (isDraft) {
    return (
      <DraftReceiptModal
        open={open}
        onClose={onClose}
        transaction={transaction}
        initialDivision={draftPrintDivision}
      />
    );
  }

  const storeAddress = storeSettings?.address || "Jl. Temu Putih No.30 Cilegon";
  const storePhone = storeSettings?.phone || "0254 393022";

  // ── Fix #10: returns inline color, not a Tailwind class ───────
  const statusInfo = getReceiptStatusStyle(transaction?.status ?? "COMPLETED");

  const modalTitle = isVoided
    ? "Invoice Dibatalkan"
    : isRefunded
      ? "Invoice Direfund"
      : isDraft
        ? "Faktur Sementara"
        : isPending
          ? "Menunggu Persetujuan"
          : "Transaksi Berhasil";

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} size="xl">
      <div className="space-y-6">
        {/* ── Fix #1 & #2: print CSS is now a static import ─────── */}
        <div className="w-full overflow-x-auto pb-4">
          <div
            id="print-receipt"
            className={`p-4 bg-white text-black font-sans mx-auto min-w-[210mm] max-w-[210mm] min-h-[165mm] print:w-[210mm] print:h-[165mm] print:-mt-4 print:p-4 print:pt-6 flex flex-col box-border border border-surface-200 print:border-none shadow-sm print:shadow-none ${compact ? "receipt-compact text-[9px]" : "text-xs"} ${isCancelled ? "opacity-80" : ""}`}
          >
            {/* Fix #9: min-h-[165mm] now matches @page 165mm */}
            {/* Fix #3: single data-driven StatusBanner */}
            <StatusBanner status={transaction?.status ?? ""} />

            {/* Header — dynamic store info */}
            <div className={`flex flex-col ${compact ? "mb-1" : "mb-2"}`}>
              <div className="flex items-baseline">
                <h1
                  className={`leading-none font-serif font-extrabold text-[#003366] tracking-wider uppercase ${compact ? "text-[20px]" : "text-[28px]"} ${isCancelled ? "line-through opacity-50" : ""}`}
                >
                  {nameParts.map((part, i) => (
                    <React.Fragment key={i}>
                      <span
                        className={compact ? "text-[26px]" : "text-[36px]"}
                      >
                        {part.first}
                      </span>
                      {part.rest}
                      {!part.isLast && " "}
                    </React.Fragment>
                  ))}
                </h1>
              </div>
              <p
                className={`text-black ${compact ? "text-[9px] mt-0.5" : "text-[11px] mt-1"}`}
              >
                {storeAddress} | Telp: {storePhone}
              </p>
            </div>

            <div
              className={`w-full ${compact ? "mb-1.5" : "mb-3"}`}
              style={
                {
                  borderTop: isVoided
                    ? "2.5px dashed #94a3b8"
                    : isRefunded
                      ? "2.5px dashed #dc2626"
                      : "2.5px solid #cc0000",
                  printColorAdjust: "exact",
                  WebkitPrintColorAdjust: "exact",
                } as React.CSSProperties
              }
            />

            {/* Info */}
            <div
              className={`grid grid-cols-2 gap-4 ${compact ? "mb-1.5 text-[10px]" : "mb-3 text-[12px]"}`}
            >
              <div className={compact ? "space-y-0.5" : "space-y-2"}>
                <div className="flex">
                  <span className={compact ? "w-24" : "w-32"}>
                    ID Transaksi
                  </span>
                  <span className="mr-4">:</span>
                  <span className="font-bold text-[#cc0000]">
                    {displayInvoice}
                  </span>
                </div>
                <div className="flex">
                  <span className={compact ? "w-24" : "w-32"}>Pelanggan</span>
                  <span className="mr-4">:</span>
                  <span className="font-bold">
                    {transaction?.customerName || "Pelanggan Umum"}
                  </span>
                </div>
                <div className="flex">
                  <span className={compact ? "w-24" : "w-32"}>Sales</span>
                  <span className="mr-4">:</span>
                  <span className="font-bold">
                    {transaction?.salesName ||
                      transaction?.salesperson?.name ||
                      "-"}
                  </span>
                </div>
              </div>
              <div className={compact ? "space-y-0.5" : "space-y-2"}>
                <div className="flex">
                  <span className={compact ? "w-20" : "w-24"}>Tanggal</span>
                  <span className="mr-4">:</span>
                  <span>
                    {formatDate(
                      transaction?.createdAt || new Date().toISOString(),
                    )}
                  </span>
                </div>
                <div className="flex">
                  <span className={compact ? "w-20" : "w-24"}>Pembayaran</span>
                  <span className="mr-4">:</span>
                  <span>
                    {transaction?.paymentMethod === "CASH"
                      ? "Tunai"
                      : transaction?.paymentMethod}
                  </span>
                </div>
                <div className="flex">
                  <span className={compact ? "w-20" : "w-24"}>Status</span>
                  <span className="mr-4">:</span>
                  {/* ── Fix #10: inline style, not dynamic Tailwind class ── */}
                  <span className="font-bold" style={{ color: statusInfo.color }}>
                    {statusInfo.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Table — with size/material columns */}
            {(() => {
              const serviceItems = items.filter((item) => item.printingServiceId);
              const hasServiceItems = serviceItems.length > 0;
              const hasSize = hasServiceItems;
              const hasMaterial = hasServiceItems;
              const hasRawMaterial = hasServiceItems;
              const cellPad = compact ? "py-0.5 px-1.5" : "py-2 px-3";
              return (
                <table
                  className={`w-full border-collapse border border-black ${compact ? "text-[9px] mb-1" : "text-[11px] mb-2"} flex-grow-0 ${isCancelled ? "line-through opacity-60" : ""}`}
                >
                  <thead>
                    <tr>
                      <th
                        className={`border border-black ${cellPad} text-center w-10 font-extrabold text-black`}
                      >
                        No
                      </th>
                      <th
                        className={`border border-black ${cellPad} text-center w-64 font-extrabold text-black`}
                      >
                        Nama Barang
                      </th>
                      {hasSize && (
                        <th
                          className={`border border-black ${cellPad} text-center w-20 font-extrabold text-black`}
                        >
                          Ukuran
                        </th>
                      )}
                      {hasMaterial && (
                        <th
                          className={`border border-black ${cellPad} text-center w-32 font-extrabold text-black`}
                        >
                          Material
                        </th>
                      )}
                      {hasRawMaterial && (
                        <th
                          className={`border border-black ${cellPad} text-center w-32 font-extrabold text-black`}
                        >
                          Bahan Dipakai
                        </th>
                      )}
                      <th
                        className={`border border-black ${cellPad} text-center w-16 font-extrabold text-black`}
                      >
                        Qty
                      </th>
                      <th
                        className={`border border-black ${cellPad} text-center w-28 font-extrabold text-black`}
                      >
                        Harga Satuan
                      </th>
                      <th
                        className={`border border-black ${cellPad} text-center w-32 font-extrabold text-black`}
                      >
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* ── Fix #6: fallback key when item.id may be undefined ── */}
                    {items.map((item, index) => (
                      <tr key={item.id ?? `item-${index}`}>
                        <td
                          className={`border border-black ${cellPad} text-center`}
                        >
                          {index + 1}
                        </td>
                        <td className={`border border-black ${cellPad}`}>
                          {item.productName}
                        </td>
                        {hasSize && (
                          <td
                            className={`border border-black ${cellPad} text-center`}
                          >
                            {formatReceiptSize(item.size) || "-"}
                          </td>
                        )}
                        {hasMaterial && (
                          <td
                            className={`border border-black ${cellPad} text-center`}
                          >
                            {item.material || "-"}
                          </td>
                        )}
                        {hasRawMaterial && (
                          <td
                            className={`border border-black ${cellPad} text-center`}
                          >
                            {item.rawMaterialQuantity
                              ? `${Number(item.rawMaterialQuantity).toLocaleString("id-ID")} ${item.rawMaterialUnit || ""}`
                              : "-"}
                          </td>
                        )}
                        <td
                          className={`border border-black ${cellPad} text-center`}
                        >
                          {item.quantity}
                        </td>
                        <td
                          className={`border border-black ${cellPad} text-right`}
                        >
                          {Number(item.unitPrice).toLocaleString("id-ID")}
                        </td>
                        <td
                          className={`border border-black ${cellPad} text-right`}
                        >
                          {Number(item.subtotal).toLocaleString("id-ID")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}

            {/* Notes + Totals */}
            <div
              className={`flex justify-between mt-auto ${compact ? "text-[10px]" : "text-[12px]"}`}
            >
              <div className="flex-1">
                {isCancelled && (
                  <div className={compact ? "text-[10px]" : "text-[12px]"}>
                    <span className="font-bold">
                      {isVoided ? "Dibatalkan" : "Direfund"}:{" "}
                    </span>
                    <span>Invoice ini tidak sah sebagai bukti pembayaran.</span>
                  </div>
                )}
                {!isCancelled && isDraft && (
                  <div className={compact ? "text-[10px]" : "text-[12px]"}>
                    <span className="font-bold">Catatan: </span>
                    <span>Faktur sementara</span>
                  </div>
                )}
                {!isCancelled && transaction.note && (
                  <div className={compact ? "text-[10px]" : "text-[12px]"}>
                    <span className="font-bold">Catatan: </span>
                    <span>{transaction.note}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end">
                <div className={`flex ${compact ? "w-[300px]" : "w-[350px]"}`}>
                  <div
                    className={`flex-1 flex items-center justify-end font-bold pr-4 ${compact ? "py-0.5" : "py-2"} ${isCancelled ? "line-through opacity-50" : ""}`}
                  >
                    GRAND TOTAL
                  </div>
                  <div
                    className={`border border-black bg-[#e5e7eb] ${compact ? "py-0.5 px-3" : "py-2 px-4"} font-bold text-center ${compact ? "w-[150px]" : "w-[180px]"} ${isCancelled ? "line-through opacity-50" : ""}`}
                    style={
                      {
                        printColorAdjust: "exact",
                        WebkitPrintColorAdjust: "exact",
                      } as React.CSSProperties
                    }
                  >
                    Rp {Number(transaction.total).toLocaleString("id-ID")}
                  </div>
                </div>
                {!isCancelled && (
                  <>
                    <div className={`flex ${compact ? "w-[300px]" : "w-[350px]"}`}>
                      <div
                        className={`flex-1 flex items-center justify-end font-bold pr-4 ${compact ? "py-0.5" : "py-2"}`}
                      >
                        {transaction.status === "DP" ? "UANG MUKA" : "TUNAI"}
                      </div>
                      <div
                        className={`border-l border-r border-b border-black ${compact ? "py-0.5 px-3" : "py-2 px-4"} font-bold text-center ${compact ? "w-[150px]" : "w-[180px]"}`}
                      >
                        Rp{" "}
                        {Number(transaction.amountPaid).toLocaleString("id-ID")}
                      </div>
                    </div>
                    <div className={`flex ${compact ? "w-[300px]" : "w-[350px]"}`}>
                      <div
                        className={`flex-1 flex items-center justify-end font-bold pr-4 ${compact ? "py-0.5" : "py-2"}`}
                      >
                        {transaction.status === "DP" ? "SISA" : "KEMBALI"}
                      </div>
                      <div
                        className={`border-l border-r border-b border-black ${compact ? "py-0.5 px-3" : "py-2 px-4"} font-bold text-center ${compact ? "w-[150px]" : "w-[180px]"}`}
                        style={
                          transaction.status === "DP"
                            ? { color: "#b45309" }
                            : undefined
                        }
                      >
                        Rp{" "}
                        {transaction.status === "DP"
                          ? (
                            Number(transaction.total) -
                            Number(transaction.amountPaid)
                          ).toLocaleString("id-ID")
                          : Number(transaction.change).toLocaleString("id-ID")}
                      </div>
                    </div>
                  </>
                )}
                {isCancelled && (
                  <div className={`flex ${compact ? "w-[300px]" : "w-[350px]"}`}>
                    <div
                      className={`flex-1 flex items-center justify-end font-bold pr-4 ${compact ? "py-0.5" : "py-2"}`}
                    >
                      {isVoided ? "DIBATALKAN" : "DIREFUND"}
                    </div>
                    <div
                      className={`border-l border-r border-b border-black ${compact ? "py-0.5 px-3" : "py-2 px-4"} font-bold text-center ${compact ? "w-[150px]" : "w-[180px]"}`}
                      style={{ color: isVoided ? "#64748b" : "#dc2626" }}
                    >
                      Rp 0
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions (Not Printed) */}
        <div className="flex gap-3 print:hidden  sticky bottom-[-16px] z-10 bg-white pt-4 pb-4 -mx-6 px-6 border-t border-gray-100 shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.05)] mt-4">
          <Button
            variant="secondary"
            size="lg"
            onClick={onClose}
            className="flex-1"
          >
            Tutup
          </Button>
          {!isCancelled && (
            <Button
              variant="accent"
              size="lg"
              onClick={handlePrint}
              className="flex-1"
            >
              Cetak Invoice
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { DraftReceiptModal } from "./DraftReceiptModal";
import { InvoicePrintModal } from "./InvoicePrintModal";
import { SuratJalanBundleButton } from "@/features/surat-jalan/components/SuratJalanBundleButton";
import { Modal, Button } from "@pos/ui";
import { formatDate } from "@/lib/utils";
import type { Transaction } from "@/hooks/useTransactions";
import { useStoreSettings } from "@/hooks/useSettings";
import { StatusBanner } from "./StatusBanner";
import { formatDraftNumberForDisplay } from "@/features/transactions-draft/helpers/draft-number";
import "./receipt-print.css";

/** Default page height in px (165mm ≈ 623px at 96dpi). */
const DEFAULT_PAGE_H_PX = 623;

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
  const [showPrintModal, setShowPrintModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentScale, setContentScale] = useState(1);

  const items = React.useMemo(() => transaction?.items || [], [transaction?.items]);
  const isDraft = transaction?.status === "DRAFT";

  const isPending = transaction?.status === "PENDING_APPROVAL";
  const printStatus =
    isPending && Number(transaction?.amountPaid ?? 0) > 0
      ? Number(transaction?.amountPaid ?? 0) < Number(transaction?.total ?? 0)
        ? "DP"
        : "COMPLETED"
      : transaction?.status;
  const isVoided = transaction?.status === "VOIDED";
  const isRefunded = transaction?.status === "REFUNDED";
  const isCancelled = isVoided || isRefunded;
  const rawInvoice =
    transaction?.invoiceNumber ??
    formatDraftNumberForDisplay(transaction?.draftNumber) ??
    "";
  const displayInvoice = rawInvoice.replace(/-/g, "/");

  const storeName = storeSettings?.name || "TOKO TELADAN";

  // ── Dynamic scaling: measure content and shrink to fit one page ──
  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    // Reset scale to 1 so we can measure the natural height
    setContentScale(1);

    // Use rAF to ensure the DOM has rendered at scale=1 before measuring
    requestAnimationFrame(() => {
      const containerH = container.clientHeight;
      const contentH = content.scrollHeight;

      if (contentH > containerH && containerH > 0) {
        // Shrink to fit, with a small safety margin (0.98)
        const scale = Math.max((containerH / contentH) * 0.98, 0.45);
        setContentScale(scale);
      } else {
        setContentScale(1);
      }
    });
  }, [items, open, transaction]);

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
  const statusInfo = getReceiptStatusStyle(printStatus ?? "COMPLETED");

  const modalTitle = isVoided
    ? "Invoice Dibatalkan"
    : isRefunded
      ? "Invoice Direfund"
      : isDraft
        ? "Faktur Sementara"
        : "Transaksi Berhasil";

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} size="5xl">
      <div className="space-y-6">
        {/* ── Fix #1 & #2: print CSS is now a static import ─────── */}
        <div className="w-full overflow-x-auto pb-4">
          <div
            ref={containerRef}
            id="print-receipt"
            className={`bg-white text-black font-sans mx-auto min-w-[210mm] max-w-[210mm] min-h-[165mm] print:w-[210mm] print:h-[165mm] print:-mt-4 box-border border border-surface-200 print:border-none shadow-sm print:shadow-none overflow-hidden text-xs ${isCancelled ? "opacity-80" : ""}`}
            style={{
              // Jika jumlah item lebih dari 5, atur ke 49%, jika tidak maka 50%
              "--print-top": items.length > 5 ? "49%" : "50%",
            } as React.CSSProperties}
          >
            <div
              ref={contentRef}
              className="p-4 print:p-4 print:pt-6 flex flex-col origin-top-left w-full"
              style={{
                transform: `scale(${contentScale})`,
                /* Scale shrinks rendered size; expand width to compensate
                   so content still fills the page width. */
                width: `${100 / contentScale}%`,
                minHeight: `${100 / contentScale}%`,
              }}
            >
              {/* Fix #3: single data-driven StatusBanner */}
              <StatusBanner status={printStatus ?? ""} />

              {/* Header — logo + FAKTUR PENJUALAN + store info */}
              <div className="flex items-start gap-3 mb-2">
                <img
                  src="/images/logo_teladan.png"
                  alt="Logo Toko"
                  className="w-16 h-16 object-contain"
                />
                <div className="flex-1">
                  <h2 className="font-bold text-base text-black mb-0.5">
                    FAKTUR PENJUALAN
                  </h2>
                  <p className="font-bold text-sm text-[#003366]">
                    {storeName}
                  </p>
                  <p className="text-black text-[11px]">
                    {storeAddress}
                  </p>
                  <p className="text-black text-[11px]">
                    Telp: {storePhone}
                  </p>
                </div>
              </div>

              <div
                className="w-full mb-3"
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
              <div className="grid grid-cols-2 gap-4 mb-3 text-[12px]">
                <div className="space-y-2">
                  <div className="flex">
                    <span className="w-32">
                      ID Transaksi
                    </span>
                    <span className="mr-4">:</span>
                    <span className="font-bold text-[#cc0000]">
                      {displayInvoice}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-32">Pelanggan</span>
                    <span className="mr-4">:</span>
                    <span className="font-bold">
                      {transaction?.customerName || "Pelanggan Umum"}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-32">Sales</span>
                    <span className="mr-4">:</span>
                    <span className="font-bold">
                      {transaction?.salesName ||
                        transaction?.salesperson?.name ||
                        "-"}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex">
                    <span className="w-24">Tanggal</span>
                    <span className="mr-4">:</span>
                    <span>
                      {formatDate(
                        transaction?.createdAt || new Date().toISOString(),
                      )}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-24">Pembayaran</span>
                    <span className="mr-4">:</span>
                    <span>
                      {transaction?.payments && transaction.payments.length > 0
                        ? transaction.payments
                            .map((p) => p.method === "CASH" ? "Tunai" : p.method)
                            .join(", ")
                        : transaction?.paymentMethod === "CASH"
                          ? "Tunai"
                          : transaction?.paymentMethod}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-24">Status</span>
                    <span className="mr-4">:</span>
                    {/* ── Fix #10: inline style, not dynamic Tailwind class ── */}
                    <span className="font-bold" style={{ color: statusInfo.color }}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Table */}
              {(() => {
                const serviceItems = items.filter((item) => item.printingServiceId);
                const hasSize = serviceItems.length > 0;
                const isCompact = items.length > 5;
                const cellPad = isCompact ? "py-1 px-2" : "py-2 px-3";
                const tableFontSize = isCompact ? "text-[9px]" : "text-[11px]";
                const MIN_ROWS = 5;
                const emptyRowCount = Math.max(0, MIN_ROWS - items.length);
                return (
                  <table
                    className={`w-full border-collapse border border-black ${tableFontSize} mb-2 flex-grow-0 ${isCancelled ? "line-through opacity-60" : ""}`}
                  >
                    <thead>
                      <tr>
                        <th className={`border border-black ${cellPad} text-center w-10 font-extrabold text-black`}>No</th>
                        <th className={`border border-black ${cellPad} text-center w-64 font-extrabold text-black`}>Nama Barang</th>
                        {hasSize && (
                          <th className={`border border-black ${cellPad} text-center w-20 font-extrabold text-black`}>Ukuran</th>
                        )}
                        <th className={`border border-black ${cellPad} text-center w-16 font-extrabold text-black`}>Qty</th>
                        <th className={`border border-black ${cellPad} text-center w-28 font-extrabold text-black`}>Harga Satuan</th>
                        <th className={`border border-black ${cellPad} text-center w-32 font-extrabold text-black`}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={item.id ?? `item-${index}`}>
                          <td className={`border border-black ${cellPad} text-center`}>{index + 1}</td>
                          <td className={`border border-black ${cellPad}`}>{item.productName}</td>
                          {hasSize && (
                            <td className={`border border-black ${cellPad} text-center`}>{formatReceiptSize(item.size) || "-"}</td>
                          )}
                          <td className={`border border-black ${cellPad} text-center`}>{item.quantity} {item.product?.unit || item.printingService?.unit || item.rawMaterialUnit || "pcs"}</td>
                          <td className={`border border-black ${cellPad} text-right`}>{Number(item.unitPrice).toLocaleString("id-ID")}</td>
                          <td className={`border border-black ${cellPad} text-right`}>{Number(item.subtotal).toLocaleString("id-ID")}</td>
                        </tr>
                      ))}
                      {/* Empty filler rows to maintain minimum 5 rows */}
                      {Array.from({ length: emptyRowCount }).map((_, i) => (
                        <tr key={`empty-${i}`}>
                          <td className={`border border-black ${cellPad} text-center`}>&nbsp;</td>
                          <td className={`border border-black ${cellPad}`}>&nbsp;</td>
                          {hasSize && (
                            <td className={`border border-black ${cellPad}`}>&nbsp;</td>
                          )}
                          <td className={`border border-black ${cellPad}`}>&nbsp;</td>
                          <td className={`border border-black ${cellPad}`}>&nbsp;</td>
                          <td className={`border border-black ${cellPad}`}>&nbsp;</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
              <div className="flex-1">
                {isCancelled && (
                  <div className="text-[12px]">
                    <span className="font-bold">
                      {isVoided ? "Dibatalkan" : "Direfund"}:{" "}
                    </span>
                    <span>Invoice ini tidak sah sebagai bukti pembayaran.</span>
                  </div>
                )}
                {!isCancelled && isDraft && (
                  <div className="text-[12px]">
                    <span className="font-bold">Catatan: </span>
                    <span>Faktur sementara</span>
                  </div>
                )}
                {!isCancelled && transaction.note && (
                  <div className="text-[12px]">
                    <span className="font-bold">Catatan: </span>
                    <span>{transaction.note}</span>
                  </div>
                )}
              </div>

              {/* Notes + Totals, mt-auto ensures this section sticks to the bottom, mb buat geser ke atas sedikit */}
              <div
                className="flex flex-col items-end mt-auto mb-4 text-[12px]"
              >

                <div className="flex flex-col items-end">
                  <div className="flex w-[350px]">
                    <div
                      className={`flex-1 flex items-center justify-end font-bold pr-4 py-2 ${isCancelled ? "line-through opacity-50" : ""}`}
                    >
                      GRAND TOTAL
                    </div>
                    <div
                      className={`border border-black bg-[#e5e7eb] py-2 px-4 font-bold text-center w-[180px] ${isCancelled ? "line-through opacity-50" : ""}`}
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
                      {transaction.payments && transaction.payments.length > 0 ? (
                        transaction.payments.map((p, idx) => (
                          <div key={idx} className="flex w-[350px]">
                            <div className="flex-1 flex items-center justify-end font-bold pr-4 py-2 uppercase">
                              {p.method === "CASH" ? "TUNAI" : p.method}
                            </div>
                            <div className="border-l border-r border-b border-black py-2 px-4 font-bold text-center w-[180px]">
                              Rp{" "}
                              {Number(p.amount).toLocaleString("id-ID")}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="flex w-[350px]">
                          <div className="flex-1 flex items-center justify-end font-bold pr-4 py-2 uppercase">
                            {printStatus === "DP" 
                              ? "UANG MUKA" 
                              : (transaction.paymentMethod === "CASH" ? "TUNAI" : transaction.paymentMethod)}
                          </div>
                          <div className="border-l border-r border-b border-black py-2 px-4 font-bold text-center w-[180px]">
                            Rp{" "}
                            {Number(transaction.amountPaid).toLocaleString("id-ID")}
                          </div>
                        </div>
                      )}
                      <div className="flex w-[350px]">
                        <div className="flex-1 flex items-center justify-end font-bold pr-4 py-2">
                          {transaction.status === "DP" ? "SISA" : "KEMBALI"}
                        </div>
                        <div
                          className="border-l border-r border-b border-black py-2 px-4 font-bold text-center w-[180px]"
                          style={
                            printStatus === "DP"
                              ? { color: "#b45309" }
                              : undefined
                          }
                        >
                          Rp{" "}
                          {printStatus === "DP"
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
                    <div className="flex w-[350px]">
                      <div className="flex-1 flex items-center justify-end font-bold pr-4 py-2">
                        {isVoided ? "DIBATALKAN" : "DIREFUND"}
                      </div>
                      <div
                        className="border-l border-r border-b border-black py-2 px-4 font-bold text-center w-[180px]"
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
            <>
              <div className="flex-1">
                <SuratJalanBundleButton transaction={transaction} />
              </div>
              <Button
                variant="accent"
                size="lg"
                onClick={() => setShowPrintModal(true)}
                className="flex-1"
              >
                Cetak Invoice
              </Button>
            </>
          )}
        </div>

        {/* Print size selector modal */}
        <InvoicePrintModal
          open={showPrintModal}
          onClose={() => setShowPrintModal(false)}
        />
      </div>
    </Modal>
  );
}

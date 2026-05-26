"use client";

import React from "react";
import { Modal, Button } from "@pos/ui";
import { formatRupiah, formatDate } from "@/lib/utils";
import type { Transaction } from "@/hooks/useTransactions";
import { useStoreSettings } from "@/hooks/useSettings";

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
}

function getReceiptStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case "DRAFT":
      return { label: "BELUM LUNAS", color: "text-[#b45309]" };
    case "PENDING_APPROVAL":
      return { label: "MENUNGGU PERSETUJUAN", color: "text-[#1d4ed8]" };
    case "DP":
      return { label: "UANG MUKA (DP)", color: "text-[#b45309]" };
    case "VOIDED":
      return { label: "DIBATALKAN", color: "text-[#64748b]" };
    case "REFUNDED":
      return { label: "DIREFUND", color: "text-[#dc2626]" };
    default:
      return { label: "LUNAS", color: "text-[#047857]" };
  }
}

function formatReceiptSize(size?: string | null) {
  return size?.split(" = ")[0] ?? "";
}

export function ReceiptModal({
  open,
  onClose,
  transaction,
}: ReceiptModalProps) {
  const { data: storeSettings } = useStoreSettings();
  const handlePrint = () => {
    window.print();
  };

  const items = transaction?.items || [];
  const compact = items.length >= 4;
  const isDraft = transaction?.status === "DRAFT";
  const isPending = transaction?.status === "PENDING_APPROVAL";
  const isVoided = transaction?.status === "VOIDED";
  const isRefunded = transaction?.status === "REFUNDED";
  const isCancelled = isVoided || isRefunded;
  const displayInvoice =
    transaction?.invoiceNumber ?? transaction?.draftNumber ?? "";

  const storeName = storeSettings?.name || "TOKO TELADAN";
  const storeAddress = storeSettings?.address || "Jl. Temu Putih No.30 Cilegon";
  const storePhone = storeSettings?.phone || "0254 393022";

  const nameParts = storeName.split(" ").map((word, i) => ({
    first: word[0] || "",
    rest: word.slice(1),
    isLast: i === storeName.split(" ").length - 1,
  }));

  const statusInfo = getReceiptStatusLabel(transaction?.status ?? "COMPLETED");

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
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                @page {
                  size: 210mm 165mm;
                  margin: 0;
                }

                body * {
                  visibility: hidden;
                  transform: none !important;
                }

                #print-receipt {
                  visibility: visible;
                }

                #print-receipt * {
                  visibility: visible;
                }

                #print-receipt {
                  position: fixed !important;
                  left: 50% !important;
                  top: 50% !important;
                  width: 210mm !important;
                  height: 165mm !important;
                  max-height: 165mm !important;
                  margin: 0 !important;
                  padding: ${compact ? "2mm 5mm" : "4mm 6mm"} !important;
                  border: none !important;
                  box-shadow: none !important;
                  overflow: hidden !important;
                  display: flex;
                  flex-direction: column;
                  box-sizing: border-box;
                  transform: translate(-50%, -50%) scale(0.96) !important;
                  transform-origin: center center !important;
                  page-break-after: avoid;
                  page-break-before: avoid;
                  page-break-inside: avoid;
                }

                .print\\:hidden {
                  display: none !important;
                }

                body {
                  margin: 0;
                  padding: 0;
              height: 0 !important;
              overflow: hidden !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
              }
            `,
          }}
        />
        <div className="w-full overflow-x-auto pb-4">
          <div
            id="print-receipt"
            className={`p-4 bg-white text-black font-sans mx-auto min-w-[210mm] max-w-[210mm] min-h-[165mm] print:w-[210mm] print:h-[165mm] print:-mt-4 print:p-4 print:pt-6 flex flex-col box-border border border-surface-200 print:border-none shadow-sm print:shadow-none ${compact ? "text-[9px]" : "text-xs"} ${isCancelled ? "opacity-80" : ""}`}
          >
            {/* DRAFT Banner */}
            {isDraft && (
              <div
                role="status"
                aria-label="Faktur sementara, bukan bukti pembayaran"
                className="mb-2 -mx-4 -mt-4 px-4 py-1.5 bg-amber-100 text-amber-900 border-b-2 border-amber-300 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider print:bg-amber-100 print:text-amber-900"
                style={
                  {
                    printColorAdjust: "exact",
                    WebkitPrintColorAdjust: "exact",
                  } as React.CSSProperties
                }
              >
                <span>FAKTUR SEMENTARA</span>
                <span className="font-medium normal-case tracking-normal">
                  Bukan bukti pembayaran
                </span>
              </div>
            )}
            {/* PENDING Banner */}
            {isPending && (
              <div
                role="status"
                aria-label="Menunggu persetujuan, bukan bukti pembayaran"
                className="mb-2 -mx-4 -mt-4 px-4 py-1.5 bg-blue-100 text-blue-900 border-b-2 border-blue-300 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider print:bg-blue-100 print:text-blue-900"
                style={
                  {
                    printColorAdjust: "exact",
                    WebkitPrintColorAdjust: "exact",
                  } as React.CSSProperties
                }
              >
                <span>MENUNGGU PERSETUJUAN</span>
                <span className="font-medium normal-case tracking-normal">
                  Bukan bukti pembayaran
                </span>
              </div>
            )}
            {/* VOIDED Banner */}
            {isVoided && (
              <div
                role="status"
                aria-label="Transaksi dibatalkan"
                className="mb-2 -mx-4 -mt-4 px-4 py-1.5 bg-surface-100 text-surface-600 border-b-2 border-surface-300 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider print:bg-surface-100 print:text-surface-600"
                style={
                  {
                    printColorAdjust: "exact",
                    WebkitPrintColorAdjust: "exact",
                  } as React.CSSProperties
                }
              >
                <span>DIBATALKAN</span>
                <span className="font-medium normal-case tracking-normal">
                  Invoice ini tidak sah
                </span>
              </div>
            )}
            {/* REFUNDED Banner */}
            {isRefunded && (
              <div
                role="status"
                aria-label="Transaksi direfund"
                className="mb-2 -mx-4 -mt-4 px-4 py-1.5 bg-red-100 text-red-800 border-b-2 border-red-300 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider print:bg-red-100 print:text-red-800"
                style={
                  {
                    printColorAdjust: "exact",
                    WebkitPrintColorAdjust: "exact",
                  } as React.CSSProperties
                }
              >
                <span>DIREFUND</span>
                <span className="font-medium normal-case tracking-normal">
                  Dana telah dikembalikan
                </span>
              </div>
            )}

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
                  <span className={`font-bold ${statusInfo.color}`}>
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
                    {items.map((item, index) => (
                      <tr key={item.id}>
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
                        className={`border-l border-r border-b border-black ${compact ? "py-0.5 px-3" : "py-2 px-4"} font-bold text-center ${compact ? "w-[150px]" : "w-[180px]"} ${transaction.status === "DP" ? "text-[#b45309]" : ""}`}
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
                      className={`border-l border-r border-b border-black ${compact ? "py-0.5 px-3" : "py-2 px-4"} font-bold text-center ${compact ? "w-[150px]" : "w-[180px]"} ${isVoided ? "text-[#64748b]" : "text-[#dc2626]"}`}
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
        <div className="flex gap-3 print:hidden">
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

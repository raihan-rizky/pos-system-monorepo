"use client";

import React, { useState, useMemo } from "react";
import { Modal, Button } from "@pos/ui";
import { terbilang } from "@/lib/terbilang";
import type { Transaction } from "@/hooks/useTransactions";
import { useStoreSettings } from "@/hooks/useSettings";
import { formatDraftNumberForDisplay } from "@/features/transactions-draft/helpers/draft-number";
import { decodeDivisionFromNote } from "@/features/nota-penawaran/helpers/division-note";
import "./draft-receipt-print.css";

interface DraftReceiptModalProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
  initialDivision?: string;
}

/**
 * Formal A4-sized draft receipt ("Surat Penawaran / Faktur Sementara")
 * modeled after the company's official letterhead format.
 *
 * Includes editable "Kepada Yth" and customer name fields that
 * appear as inputs on screen but render as plain text when printed.
 */
export function DraftReceiptModal({
  open,
  onClose,
  transaction,
  initialDivision = "",
}: DraftReceiptModalProps) {
  const { data: storeSettings } = useStoreSettings();

  // ── Extract division from the note field if not provided as prop ──
  const { division: decodedDivision, cleanNote } = useMemo(
    () => decodeDivisionFromNote(transaction?.note),
    [transaction?.note],
  );

  // ── Editable recipient fields ──
  const [kepadaYth, setKepadaYth] = useState(
    transaction?.customerName || ""
  );
  const [divisiPurchasing, setDivisiPurchasing] = useState(
    initialDivision || decodedDivision
  );

  const handlePrint = () => {
    window.print();
  };

  const items = transaction?.items || [];
  const storeName = storeSettings?.name || "TOKO TELADAN";
  const storeAddress =
    storeSettings?.address || "Jl. Temu Putih No.30 Cilegon";
  const storePhone = storeSettings?.phone || "0254 393022";

  const grandTotal = Number(transaction.total);

  const formatIndonesianDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  };

  const docNumber =
    formatDraftNumberForDisplay(transaction?.draftNumber) ||
    transaction?.invoiceNumber ||
    "";
  return (
    <Modal open={open} onClose={onClose} title="Cetak Nota Penawaran" size="4xl">
      <style>{`
        @media print {
          @page {
            size: A4 portrait !important;
            margin: 0 !important;
          }
        }
      `}</style>
      <div className="space-y-4">
        {/* ═══ EDITABLE FIELDS (not printed) ═══ */}
        <div className="print:hidden bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            Isi data penerima sebelum cetak
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="draft-kepada-yth"
                className="block text-xs font-semibold text-surface-600 mb-1"
              >
                Kepada Yth
              </label>
              <input
                id="draft-kepada-yth"
                type="text"
                placeholder="Nama perusahaan / instansi..."
                value={kepadaYth}
                onChange={(e) => setKepadaYth(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>
            <div>
              <label
                htmlFor="draft-divisi"
                className="block text-xs font-semibold text-surface-600 mb-1"
              >
                Divisi / Bagian
              </label>
              <input
                id="draft-divisi"
                type="text"
                placeholder="Divisi Purchasing, Bagian Umum..."
                value={divisiPurchasing}
                onChange={(e) => setDivisiPurchasing(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>
          </div>
        </div>

        {/* ═══ A4 PREVIEW ═══ */}
        <div className="w-full overflow-x-auto pb-4">
          <div
            id="draft-receipt-page"
            className="bg-white text-black mx-auto border border-gray-200 shadow-sm print:border-none print:shadow-none box-border"
            style={{
              width: "210mm",
              minHeight: "297mm",
              padding: "12mm 16mm",
              fontFamily: '"Times New Roman", Georgia, serif',
            }}
          >
            {/* ═══ HEADER / KOP SURAT ═══ */}
            { }
            <img
              src="/images/kop-surat-header.png"
              alt="Kop Surat"
              style={{ width: "100%", marginBottom: 16 }}
            />

            {/* ═══ DOCUMENT INFO ═══ */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 12,
                fontSize: 12,
              }}
            >
              <div>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: "bold" }}>No.</span>{" "}
                  <span>{docNumber}</span>
                </div>
                <div>
                  <span style={{ fontWeight: "bold" }}>Hal</span> :{" "}
                  <span>Penawaran</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: "bold" }}>Kepada Yth :</span>
                </div>
                {divisiPurchasing && (
                  <div>
                    <span style={{ fontWeight: "bold" }}>
                      {divisiPurchasing}
                    </span>
                  </div>
                )}
                <div>
                  <span style={{ fontWeight: "bold" }}>
                    {kepadaYth || "Pelanggan Umum"}
                  </span>
                </div>
              </div>
            </div>

            {/* ═══ GREETING ═══ */}
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <p style={{ margin: "0 0 4px" }}>Dengan Hormat,</p>
              <p style={{ margin: 0, fontWeight: "bold" }}>
                Bersama ini kami menawarkan harga barang - barang sebagai berikut :
              </p>
            </div>

            {/* ═══ ITEMS TABLE ═══ */}
            <table style={{ width: "100%", marginBottom: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 35, textAlign: "center" }}>NO</th>
                  <th style={{ textAlign: "left" }}>ITEM</th>
                  <th style={{ width: 80, textAlign: "center" }}>QUANTITAS</th>
                  <th style={{ width: 65, textAlign: "center" }}>SATUAN</th>
                  <th style={{ width: 100, textAlign: "center" }}>HARGA SATUAN</th>
                  <th style={{ width: 110, textAlign: "right" }}>TOTAL HARGA</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id ?? `item-${index}`}>
                    <td style={{ textAlign: "center" }}>{index + 1}</td>
                    <td>{item.productName}</td>
                    <td style={{ textAlign: "center" }}>{item.quantity}</td>
                    <td style={{ textAlign: "center" }}>
                      {item.product?.unit || item.printingService?.unit || "-"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {Number(item.unitPrice).toLocaleString("id-ID")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {Number(item.subtotal).toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ═══ TOTAL ROW ═══ */}
            <table style={{ width: "100%", marginBottom: 0 }}>
              <tbody>
                <tr className="total-row">
                  <td
                    colSpan={5}
                    style={{
                      textAlign: "center",
                      fontWeight: "bold",
                      fontSize: 12,
                      padding: "6px 8px",
                    }}
                  >
                    J U M L A H
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontWeight: "bold",
                      fontSize: 12,
                      padding: "6px 8px",
                      width: 110,
                    }}
                  >
                    Rp{" "}
                    {grandTotal.toLocaleString("id-ID")}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ═══ TERBILANG ═══ */}
            <div className="terbilang-box">
              Terbilang : <strong>{terbilang(grandTotal)}</strong>
            </div>

            {/* ═══ NOTES (if any) ═══ */}
            {cleanNote && (
              <div style={{ fontSize: 11, marginTop: 10, fontStyle: "italic" }}>
                <span style={{ fontWeight: "bold" }}>Catatan: </span>
                {cleanNote}
              </div>
            )}

            {/* ═══ SIGNATURE SECTION ═══ */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 32,
              }}
            >
              <div className="draft-receipt-signature">
                <p style={{ margin: "0 0 4px" }}>
                  Cilegon,{" "}
                  {formatIndonesianDate(
                    transaction?.createdAt || new Date().toISOString()
                  )}
                </p>
                <p style={{ margin: "0 0 2px", fontWeight: "bold" }}>
                  CV Teladan
                </p>
                <div className="stamp-area">
                  {/* Space for stamp/signature */}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontWeight: "bold",
                    textDecoration: "underline",
                  }}
                >
                  Indra Gunawan
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 10, color: "#555" }}>
                  Hp. 08111228134
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ ACTIONS (NOT PRINTED) ═══ */}
        <div className="flex gap-3 print:hidden sticky bottom-[-16px] z-10 bg-white pt-4 pb-4 -mx-6 px-6 border-t border-gray-100 shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.05)] mt-4">
          <Button
            variant="secondary"
            size="lg"
            onClick={onClose}
            className="flex-1"
          >
            Tutup
          </Button>
          <Button
            variant="accent"
            size="lg"
            onClick={handlePrint}
            className="flex-1"
          >
            Cetak Nota Penawaran
          </Button>
        </div>
      </div>
    </Modal>
  );
}

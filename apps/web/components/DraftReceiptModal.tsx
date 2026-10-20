"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { Pencil, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, Button } from "@pos/ui";
import { terbilang } from "@/lib/terbilang";
import type { Transaction } from "@/hooks/useTransactions";
import { useStoreSettings } from "@/hooks/useSettings";
import { formatDraftNumberForDisplay } from "@/features/transactions-draft/helpers/draft-number";
import { decodeDivisionFromNote } from "@/features/nota-penawaran/helpers/division-note";
import { DraftNumberField } from "@/features/transactions-draft/components/DraftNumberField";
import { useRole } from "@/components/providers/RoleProvider";
import "./draft-receipt-print.css";
import { useReceiptTax } from "@/features/transaction-tax/hooks/useReceiptTax";
import { TaxField } from "@/features/transaction-tax/components/TaxField";
import { useDocumentItemNames } from "@/features/transactions-draft/hooks/useDocumentItemNames";

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
  transaction: initialTransaction,
  initialDivision = "",
}: DraftReceiptModalProps) {
  const tax = useReceiptTax(initialTransaction, open);
  const transaction = tax.transaction;
  const documentNames = useDocumentItemNames(initialTransaction, open);
  const { data: storeSettings } = useStoreSettings();
  const queryClient = useQueryClient();
  const { canPerform } = useRole();
  const canEditNumber = canPerform("transaction.draft", "update");
  const [savedNumber, setSavedNumber] = useState(transaction.draftNumber ?? "");
  const [numberInput, setNumberInput] = useState<string | null | undefined>();
  const [automaticNumber, setAutomaticNumber] = useState("");
  const [isLoadingNumber, setIsLoadingNumber] = useState(true);
  const [numberReady, setNumberReady] = useState(false);
  const [isSavingNumber, setIsSavingNumber] = useState(false);
  const [numberError, setNumberError] = useState<string | null>(null);
  const printing = useRef(false);
  const printSession = useRef(0);
  const printItemsKey = JSON.stringify(transaction.items.map(item => item.id).sort());

  useEffect(() => {
    printSession.current += 1;
    printing.current = false;
    setIsSavingNumber(false);
    return () => { printSession.current += 1; };
  }, [open, transaction.id, printItemsKey]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setSavedNumber(transaction.draftNumber ?? "");
    setNumberInput(undefined);
    setNumberError(null);
    setIsLoadingNumber(true);
    setNumberReady(false);
    void fetch(`/api/transactions/${transaction.id}/draft-number`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Nomor faktur belum dapat dimuat.");
        if (controller.signal.aborted) return;
        setSavedNumber(data.draftNumber ?? "");
        setAutomaticNumber(formatDraftNumberForDisplay(data.automaticNumber));
        setNumberReady(true);
      })
      .catch(error => {
        if (!controller.signal.aborted) setNumberError(error instanceof Error ? error.message : "Nomor faktur belum dapat dimuat.");
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoadingNumber(false); });
    return () => controller.abort();
  }, [open, transaction.id, transaction.draftNumber]);

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

  const handlePrint = async () => {
    if (printing.current) return;
    const session = printSession.current;
    printing.current = true;
    setIsSavingNumber(true);
    setNumberError(null);
    try {
      await documentNames.ensureSaved();
      if (session !== printSession.current) return;
      await tax.ensureSaved();
      if (session !== printSession.current) return;
      if (canEditNumber && numberInput !== undefined) {
        const response = await fetch(`/api/transactions/${transaction.id}/draft-number`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftNumber: numberInput === null ? null : numberInput.trim() }),
        });
        const data = await response.json();
        if (session !== printSession.current) return;
        if (!response.ok) throw new Error(data.message || "Nomor faktur gagal disimpan.");
        flushSync(() => {
          setSavedNumber(data.draftNumber);
          setNumberInput(undefined);
        });
        void queryClient.invalidateQueries({ queryKey: ["transactions"] });
        void queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
        void queryClient.invalidateQueries({ queryKey: ["transaction", transaction.id] });
      }
      if (session === printSession.current) window.print();
    } catch (error) {
      if (session !== printSession.current) return;
      setNumberError(error instanceof Error ? error.message : "Nomor faktur gagal disimpan.");
    } finally {
      if (session === printSession.current) {
        printing.current = false;
        setIsSavingNumber(false);
      }
    }
  };

  const items = transaction?.items || [];
  const storeName = storeSettings?.name || "TOKO TELADAN";
  const storeAddress =
    storeSettings?.address || "Jl. Temu Putih No.30 Cilegon";
  const storePhone = storeSettings?.phone || "0254 393022";

  const grandTotal = Number(transaction.total);
  const netAmount = Math.max(0, Number(transaction.subtotal ?? grandTotal - Number(transaction.tax ?? 0)) - Number(transaction.discount ?? 0));
  const dpp = Math.round(netAmount * 11 / 12);

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
    (numberInput === null ? automaticNumber : formatDraftNumberForDisplay(numberInput ?? savedNumber)) ||
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
          <DraftNumberField
            open={open}
            value={numberInput === undefined ? formatDraftNumberForDisplay(savedNumber) : numberInput}
            automaticNumber={automaticNumber}
            onChange={value => { setNumberInput(value); setNumberError(null); }}
            disabled={!canEditNumber || !numberReady || isSavingNumber}
            hint={canEditNumber ? "Nomor disimpan ke transaksi sebelum dicetak. Klik Gunakan otomatis untuk memakai nomor sistem." : "Nomor mengikuti transaksi tersimpan. Anda tidak memiliki izin mengubah nomor faktur."}
          />
          {numberError && numberError !== documentNames.error && <p role="alert" className="text-sm text-red-700">{numberError}</p>}
          <TaxField tax={tax} quotation />
          {documentNames.error && <p role="alert" className="text-sm text-red-700">{documentNames.error}</p>}
          <p className="text-xs text-surface-600">Edit nama pada kolom ITEM. Nama POS menjadi referensi di layar; hanya nama pada nota yang dicetak. Perubahan disimpan saat cetak.</p>
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
                    <td>
                      <div className="draft-item-screen-only">
                        <label htmlFor={"draft-item-name-" + item.id} className="draft-item-name-label">
                          Nama pada nota
                        </label>
                        <div className="draft-item-name-editor">
                        <textarea
                          ref={element => { if (element) { element.style.height = "0px"; element.style.height = element.scrollHeight + "px"; } }}
                          id={"draft-item-name-" + item.id}
                          aria-label={"Nama pada nota item " + (index + 1)}
                          aria-describedby={"draft-item-pos-" + item.id}
                          value={documentNames.nameFor(item.id, item.productName)}
                          onChange={event => { documentNames.setName(item.id, event.target.value); setNumberError(null); }}
                          onKeyDown={event => {
                            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); documentNames.cancelEdit(item.id); setNumberError(null); }
                            if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                          }}
                          readOnly={!documentNames.canEdit}
                          disabled={!documentNames.ready || isSavingNumber}
                          aria-invalid={documentNames.invalid || undefined}
                          maxLength={300}
                          rows={1}
                          title={documentNames.canEdit ? "Klik untuk mengubah nama pada nota" : undefined}
                          className="draft-item-name-input"
                        />
                        {documentNames.canEdit && <Pencil size={11} className="draft-item-edit-icon" aria-hidden="true" />}
                        </div>
                        <div className="draft-item-reference">
                        <p id={"draft-item-pos-" + item.id} className="draft-item-pos-name">
                          Nama POS: {documentNames.originalNameFor(item.id, item.productName)}
                        </p>
                        {documentNames.canEdit && documentNames.nameFor(item.id, item.productName) !== documentNames.originalNameFor(item.id, item.productName) && (
                          <button type="button" title="Kembalikan nama POS" aria-label={"Kembalikan nama POS item " + (index + 1)}
                            onClick={() => { documentNames.setName(item.id, null); setNumberError(null); }}
                            disabled={!documentNames.ready || isSavingNumber}
                            className="draft-item-name-reset">
                            <RotateCcw size={10} aria-hidden="true" /> Kembalikan
                          </button>
                        )}
                        </div>
                      </div>
                      <span className="draft-item-print-name">{documentNames.nameFor(item.id, item.productName).trim()}</span>
                      {Number(item.discount) > 0 && (
                        <div style={{ fontSize: "0.9em" }}>{`Diskon item Rp${Number(item.discount).toLocaleString("id-ID")}`}</div>
                      )}
                    </td>
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
                    {netAmount.toLocaleString("id-ID")}
                  </td>
                </tr>
                {[
                  ["DPP Nilai Lain", dpp],
                  ["PPN", Number(transaction.tax ?? 0)],
                  ["Total", grandTotal],
                ].map(([label, amount]) => (
                  <tr className="total-row" key={label}>
                    <td colSpan={5} style={{ textAlign: "left", fontWeight: "bold", fontSize: 12, padding: "6px 8px" }}>{label}</td>
                    <td style={{ textAlign: "right", fontWeight: "bold", fontSize: 12, padding: "6px 8px", width: 110 }}>Rp {Number(amount).toLocaleString("id-ID")}</td>
                  </tr>
                ))}
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
                    transaction?.invoiceDate ||
                      transaction?.createdAt ||
                      new Date().toISOString()
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
            disabled={isSavingNumber}
            className="flex-1"
          >
            Tutup
          </Button>
          <Button
            variant="accent"
            size="lg"
            onClick={handlePrint}
            loading={isSavingNumber}
            disabled={isLoadingNumber || !numberReady || !tax.ready || tax.saving || tax.invalid || !documentNames.ready || documentNames.saving || documentNames.invalid}
            className="flex-1"
          >
            Cetak Nota Penawaran
          </Button>
        </div>
      </div>
    </Modal>
  );
}

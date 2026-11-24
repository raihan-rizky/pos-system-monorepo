"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { Pencil, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, Button } from "@pos/ui";
import { terbilang } from "@/lib/terbilang";
import type { Transaction } from "@/hooks/useTransactions";
import { TransactionCustomPriceSummary } from "@/features/pos-checkout/components/TransactionCustomPriceSummary";
import { useStoreSettings } from "@/hooks/useSettings";
import { formatDraftNumberForDisplay } from "@/features/transactions-draft/helpers/draft-number";
import { decodeDivisionFromNote } from "@/features/nota-penawaran/helpers/division-note";
import { DraftNumberField } from "@/features/transactions-draft/components/DraftNumberField";
import { useRole } from "@/components/providers/RoleProvider";
import { PrintItemTable } from "./PrintItemTable";
import "./draft-receipt-print.css";
import { getTransactionTaxRate } from "@/features/transaction-tax/helpers/tax-calculation";
import { useReceiptTax } from "@/features/transaction-tax/hooks/useReceiptTax";
import { TaxField } from "@/features/transaction-tax/components/TaxField";
import { useDocumentItemNames } from "@/features/transactions-draft/hooks/useDocumentItemNames";
import { isBlankQuotationRow, parseQuotationRow, QuotationItemRow, type QuotationRowFields } from "@/features/nota-penawaran/components/QuotationItemRow";
import { useQuotationItems } from "@/features/nota-penawaran/hooks/useQuotationItems";
import { calculateQuotationTotals, MAX_QUOTATION_AMOUNT, roundQuotationAmount } from "@/features/nota-penawaran/helpers/quotation-items";

interface DraftReceiptModalProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
  initialDivision?: string;
}

const draftReceiptColumns = (
  <colgroup>
    <col className="draft-col-number" />
    <col />
    <col className="draft-col-quantity" />
    <col className="draft-col-unit" />
    <col className="draft-col-price" />
    <col className="draft-col-total" />
  </colgroup>
);

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
  const baseTransaction = useMemo(() => ({ ...initialTransaction, items: initialTransaction.items.filter(item => item.quotationUnit == null) }), [initialTransaction]);
  const documentNames = useDocumentItemNames(baseTransaction, open);
  const quotation = useQuotationItems(transaction.id, open);
  const { data: storeSettings } = useStoreSettings();
  const queryClient = useQueryClient();
  const { canPerform } = useRole();
  const canEditNumber = canPerform("transaction.draft", "update");
  const canEditRows = transaction.status === "DRAFT" && canEditNumber;
  const canLinkProduct = canPerform("product", "read");
  const [pendingRows, setPendingRows] = useState<QuotationRowFields[]>([]);
  const [savedNumber, setSavedNumber] = useState(transaction.draftNumber ?? "");
  const [numberInput, setNumberInput] = useState<string | null | undefined>();
  const [automaticNumber, setAutomaticNumber] = useState("");
  const [isLoadingNumber, setIsLoadingNumber] = useState(true);
  const [numberReady, setNumberReady] = useState(false);
  const [isSavingNumber, setIsSavingNumber] = useState(false);
  const [numberError, setNumberError] = useState<string | null>(null);
  const printing = useRef(false);
  const printSession = useRef(0);
  const printItemsKey = JSON.stringify(baseTransaction.items.map(item => item.id).sort());

  useEffect(() => {
    printSession.current += 1;
    printing.current = false;
    setIsSavingNumber(false);
    return () => { printSession.current += 1; };
  }, [open, transaction.id, printItemsKey]);
  useEffect(() => { setPendingRows([]); }, [open, transaction.id]);

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

  const enteredRows = pendingRows.filter(row => !isBlankQuotationRow(row));
  const validRows = enteredRows.map(parseQuotationRow);
  const addedSubtotal = roundQuotationAmount(validRows.reduce((sum, row) => sum + (row ? roundQuotationAmount(row.quantity * row.unitPrice) : 0), 0));
  const previewTotals = enteredRows.length ? calculateQuotationTotals(transaction, addedSubtotal) : transaction;
  const invalidRows = validRows.some(row => row === null);
  const exceedsAmount = previewTotals.subtotal > MAX_QUOTATION_AMOUNT || previewTotals.total > MAX_QUOTATION_AMOUNT;

  const handlePrint = async (shouldPrint: boolean) => {
    if (printing.current) return;
    if (!quotation.ready) return;
    if (invalidRows || enteredRows.length > 100 || exceedsAmount) {
      setNumberError(exceedsAmount ? "Total nota penawaran melebihi batas nominal." : enteredRows.length > 100
        ? "Simpan maksimal 100 baris terisi sekaligus." : "Isi nama, jumlah, dan harga untuk setiap baris yang digunakan. Baris yang kosong tetap bisa dicetak.");
      return;
    }
    const session = printSession.current;
    printing.current = true;
    setIsSavingNumber(true);
    setNumberError(null);
    try {
      await documentNames.ensureSaved();
      if (session !== printSession.current) return;
      await tax.ensureSaved();
      if (session !== printSession.current) return;
      const newItems = validRows.filter(row => row !== null);
      if (newItems.length) {
        if (!canEditRows) throw new Error("Anda tidak memiliki izin menambah item pada nota penawaran.");
        const result = await quotation.save(newItems);
        if (session !== printSession.current) return;
        const addedIds = new Set(newItems.map(item => item.id));
        flushSync(() => {
          quotation.accept(result.items);
          tax.applySaved(result.tax);
          setPendingRows(current => current.filter(row => !addedIds.has(row.id)));
        });
        for (const key of ["transactions", "transaction-history", "transaction", "approval-quote"]) {
          void queryClient.invalidateQueries({ queryKey: [key] });
        }
      }
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
      if (shouldPrint && session === printSession.current) window.print();
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

  const items = baseTransaction.items;
  const savedQuotationItems = quotation.ready ? quotation.items : initialTransaction.items.filter(item => item.quotationUnit != null);
  const storeName = storeSettings?.name || "TOKO TELADAN";
  const storeAddress =
    storeSettings?.address || "Jl. Temu Putih No.30 Cilegon";
  const storePhone = storeSettings?.phone || "0254 393022";

  const grandTotal = Number(previewTotals.total);
  const netAmount = Math.max(0, Number(previewTotals.subtotal ?? grandTotal - Number(previewTotals.tax ?? 0)) - Number(transaction.discount ?? 0));
  const dpp = Math.round(netAmount * 11 / 12);
  const showTaxSummary = getTransactionTaxRate(transaction) > 0;

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
    <Modal open={open} onClose={onClose} title="Cetak Nota Penawaran" size="4xl" className="draft-receipt-modal">
      <div className="draft-receipt-content space-y-4">
        <TransactionCustomPriceSummary items={transaction.items} />
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
          <fieldset disabled={isSavingNumber}><TaxField tax={tax} quotation /></fieldset>
          {documentNames.error && <p role="alert" className="text-sm text-red-700">{documentNames.error}</p>}
          {quotation.error && <p role="alert" className="text-sm text-red-700">{quotation.error}</p>}
          <p className="text-xs text-surface-600">Edit nama pada kolom ITEM. Nama POS menjadi referensi di layar; hanya nama pada nota yang dicetak. Perubahan disimpan saat cetak.</p>
        </div>

        {/* ═══ A4 PREVIEW ═══ */}
        <div className="draft-receipt-preview w-full overflow-x-auto pb-4" role="region" aria-label="Pratinjau Nota Penawaran" tabIndex={0}>
          <div
            id="draft-receipt-page"
            className="print-document draft-receipt-paper"
          >
            {/* ═══ HEADER / KOP SURAT ═══ */}
            <img
              src="/images/kop-surat-header.png"
              alt="Kop Surat"
              className="draft-letterhead"
            />

            {/* ═══ DOCUMENT INFO ═══ */}
            <div className="draft-document-meta">
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
            <PrintItemTable
              key={transaction.id}
              className="draft-document-table"
              columnCount={6}
              columns={draftReceiptColumns}
              disabled={isSavingNumber}
              rowActions={canEditRows ? {
                count: pendingRows.length,
                lastRowEmpty: pendingRows.length === 0 || isBlankQuotationRow(pendingRows[pendingRows.length - 1]),
                add: () => {
                  const row = { id: crypto.randomUUID(), name: "", quantity: "", unit: "", unitPrice: "", product: null };
                  setPendingRows(current => [...current, row]);
                },
                removeLast: () => { setPendingRows(current => current.slice(0, -1)); setNumberError(null); },
              } : undefined}
              headings={
                <tr>
                  <th scope="col">NO</th>
                  <th scope="col">ITEM</th>
                  <th scope="col">QUANTITAS</th>
                  <th scope="col">SATUAN</th>
                  <th scope="col">HARGA SATUAN</th>
                  <th scope="col">TOTAL HARGA</th>
                </tr>
              }
            >
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
              {savedQuotationItems.map((item, index) => (
                <tr key={item.id}>
                  <td className="quotation-number">{items.length + index + 1}</td>
                  <td>{item.documentName ?? item.productName}</td>
                  <td className="quotation-number">{item.quantity}</td>
                  <td className="quotation-number">{item.quotationUnit}</td>
                  <td className="quotation-amount">{Number(item.unitPrice).toLocaleString("id-ID")}</td>
                  <td className="quotation-amount">{Number(item.subtotal).toLocaleString("id-ID")}</td>
                </tr>
              ))}
              {canEditRows && pendingRows.map((row, index) => (
                <QuotationItemRow key={row.id} row={row} index={index + 1} number={items.length + savedQuotationItems.length + index + 1}
                  canLink={canLinkProduct} disabled={isSavingNumber} onChange={patch => {
                    setPendingRows(current => current.map(entry => entry.id === row.id ? { ...entry, ...patch } : entry));
                    setNumberError(null);
                  }} />
              ))}
            </PrintItemTable>

            {/* ═══ TOTAL ROW ═══ */}
            <table className="draft-document-table draft-totals-table">
              {draftReceiptColumns}
              <tbody>
                <tr className="total-row">
                  <td
                    colSpan={5}
                    style={{
                      textAlign: "center",
                    }}
                  >
                    J U M L A H
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                    }}
                  >
                    Rp{" "}
                    {netAmount.toLocaleString("id-ID")}
                  </td>
                </tr>
                {[
                  ...(showTaxSummary ? [
                    ["DPP Nilai Lain", dpp],
                    ["PPN", Number(previewTotals.tax ?? 0)],
                  ] : []),
                  ["Total", grandTotal],
                ].map(([label, amount]) => (
                  <tr className="total-row" key={label}>
                    <td colSpan={5}>{label}</td>
                    <td style={{ textAlign: "right" }}>Rp {Number(amount).toLocaleString("id-ID")}</td>
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
                <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{cleanNote}</span>
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
                <p className="draft-signature-contact">
                  Hp. 08111228134
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ ACTIONS (NOT PRINTED) ═══ */}
        <div className="flex flex-wrap gap-3 print:hidden sticky bottom-[-16px] z-10 bg-white pt-4 pb-4 -mx-6 px-6 border-t border-gray-100 shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.05)] mt-4">
          <Button
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={isSavingNumber}
            className="flex-1"
          >
            Tutup
          </Button>
          {canEditRows && enteredRows.length > 0 && <Button size="lg" variant="secondary" onClick={() => handlePrint(false)}
            disabled={isSavingNumber || !quotation.ready || !numberReady || !tax.ready || tax.saving || tax.invalid || !documentNames.ready || documentNames.saving || documentNames.invalid}
            className="w-full sm:w-auto">Simpan baris</Button>}
          <Button
            variant="accent"
            size="lg"
            onClick={() => handlePrint(true)}
            loading={isSavingNumber}
            disabled={!quotation.ready || isLoadingNumber || !numberReady || !tax.ready || tax.saving || tax.invalid || !documentNames.ready || documentNames.saving || documentNames.invalid}
            className="flex-1"
          >
            Cetak Nota Penawaran
          </Button>
        </div>
      </div>
    </Modal>
  );
}

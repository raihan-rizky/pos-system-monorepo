"use client";

import { useMemo, useState } from "react";
import type { PrintingReceiptDocument } from "@/features/printing-receipts/types";
import type { ReceiptChangeItem, ReceiptChangeRecord, ReceiptChangeSnapshot } from "../types";

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "medium", timeZone: "Asia/Jakarta" });

function shown(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatItems(items: ReceiptChangeItem[]) {
  if (items.length === 0) return "Tidak ada barang";
  return items.map((item, index) => {
    const details = [
      `${index + 1}. ${item.productName}`,
      item.productId ? `ID produk: ${item.productId}` : "",
      item.documentName && item.documentName !== item.productName ? `Nama dokumen: ${item.documentName}` : "",
      item.size ? `Ukuran: ${item.size}` : "",
      item.material ? `Bahan: ${item.material}` : "",
      `Jumlah: ${item.quantity} ${item.unit}`,
      `Harga: ${currency.format(item.unitPrice)}`,
      `Harga berlaku: ${currency.format(item.appliedUnitPrice)}`,
      `Harga awal: ${item.originalUnitPrice === null ? "-" : currency.format(item.originalUnitPrice)}`,
      `Diskon: ${currency.format(item.discount)}`,
      `Subtotal: ${currency.format(item.subtotal)}`,
      item.serviceNote ? `Catatan: ${item.serviceNote}` : "",
      item.rawMaterialProductId ? `Bahan stok: ${shown(item.rawMaterialQuantity)} ${shown(item.rawMaterialUnit)} (ID ${item.rawMaterialProductId})` : "",
    ];
    return details.filter(Boolean).join("\n");
  }).join("\n\n");
}

function formatPrintingLines(document: PrintingReceiptDocument | null) {
  if (!document?.lines?.length) return "Tidak ada baris";
  return document.lines.map((line, index) => [
    `${index + 1}. ${line.name || "(tanpa nama)"}`,
    line.material ? `Bahan: ${line.material}` : "",
    `Jumlah: ${shown(line.quantity)}`,
    `Harga: ${line.price === null ? "-" : currency.format(line.price)}`,
    line.stockLink ? `Bahan stok: ${line.stockLink.quantity} ${line.stockLink.unit} (ID ${line.stockLink.productId})` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

function snapshotRows(snapshot: ReceiptChangeSnapshot) {
  const printing = snapshot.printingReceipt;
  const document = printing?.document as unknown as PrintingReceiptDocument | undefined;
  const rows: Array<{ label: string; value: string }> = [
    { label: "Nomor nota", value: shown(snapshot.invoiceNumber) },
    { label: "Tanggal nota", value: `${dateTime.format(new Date(snapshot.invoiceDate))} WIB` },
    { label: "Pelanggan", value: shown(snapshot.customerName) },
    { label: "ID pelanggan terdaftar", value: shown(snapshot.customerId) },
    { label: "Sales", value: shown(snapshot.salesName) },
    { label: "ID Sales", value: shown(snapshot.salespersonId) },
    { label: "Status", value: shown(snapshot.status) },
    { label: "Metode pembayaran", value: shown(snapshot.paymentMethod) },
    { label: "Rincian pembayaran", value: snapshot.payments.length ? snapshot.payments.map((payment) => `${payment.method}: ${currency.format(payment.amount)}`).join("\n") : "-" },
    { label: "Rincian pembayaran piutang", value: snapshot.debtPayments.length ? snapshot.debtPayments.map((payment) => `${payment.method}: ${currency.format(payment.amount)}`).join("\n") : "-" },
    { label: "Barang", value: formatItems(snapshot.items) },
    { label: "Subtotal", value: currency.format(snapshot.subtotal) },
    { label: "Diskon", value: currency.format(snapshot.discount) },
    { label: "Pajak", value: `${currency.format(snapshot.tax)} (${snapshot.taxRate === null ? "-" : `${snapshot.taxRate}%`}, ${snapshot.taxMethod})` },
    { label: "Total", value: currency.format(snapshot.total) },
    { label: "Dibayar", value: currency.format(snapshot.amountPaid) },
    { label: "Kembalian", value: currency.format(snapshot.change) },
    { label: "Catatan transaksi", value: shown(snapshot.note) },
  ];
  if (printing && document) {
    rows.push(
      { label: "Jenis nota Percetakan", value: shown(printing.subcategory) },
      { label: "Nomor nota Percetakan", value: shown(printing.number) },
      { label: "Judul nota Percetakan", value: shown(document.title) },
      { label: "Pelanggan di nota Percetakan", value: shown(document.customerName) },
      { label: "Telepon pelanggan", value: shown(document.customerPhone) },
      { label: "Tanggal di nota Percetakan", value: shown(document.date) },
      { label: "Catatan nota Percetakan", value: shown(document.note) },
      { label: "Tanggal selesai", value: shown(document.completionDate) },
      { label: "Jam selesai", value: shown(document.completionTime) },
      { label: "Penerima", value: shown(document.receiver) },
      { label: "Setter", value: shown(document.setter) },
      { label: "Penanda tangan", value: shown(document.signatory) },
      { label: "Baris nota Percetakan", value: formatPrintingLines(document) },
    );
  }
  return rows;
}

function SnapshotDetails({ title, snapshot, initiallyOpen = false }: { title: string; snapshot: ReceiptChangeSnapshot; initiallyOpen?: boolean }) {
  return (
    <details open={initiallyOpen} className="rounded-xl border border-surface-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold text-surface-900">{title}</summary>
      <dl className="mt-4 space-y-3">
        {snapshotRows(snapshot).map((row) => (
          <div key={row.label}>
            <dt className="text-xs font-medium text-surface-500">{row.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-surface-800">{row.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function ReceiptChangeComparison({ changes, initialChangeId }: { changes: ReceiptChangeRecord[]; initialChangeId?: string }) {
  const [selectedId, setSelectedId] = useState(initialChangeId || "");
  const selected = changes?.find((change) => change.id === selectedId) ?? changes?.at(-1);
  const differences = useMemo(() => {
    if (!selected) return [];
    const before = new Map(snapshotRows(selected.before).map((row) => [row.label, row.value]));
    const after = new Map(snapshotRows(selected.after).map((row) => [row.label, row.value]));
    return Array.from(new Set([...before.keys(), ...after.keys()])).flatMap((label) => {
      const previous = before.get(label) ?? "-";
      const current = after.get(label) ?? "-";
      return previous === current ? [] : [{ label, previous, current }];
    });
  }, [selected]);

  return (<>
        {changes && changes.length === 0 && <p className="rounded-xl border border-surface-200 bg-white p-4 text-sm text-surface-600">Belum ada perubahan Sales yang tercatat untuk nota ini.</p>}
        {changes && selected && (
          <>
            <div className="rounded-xl border border-surface-200 bg-white p-4">
              <label htmlFor="receipt-change" className="block text-sm font-semibold text-surface-800">Pilih perubahan</label>
              <select id="receipt-change" value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-surface-300 bg-white px-3 text-sm text-surface-900">
                {changes.map((change, index) => <option key={change.id} value={change.id}>Perubahan {index + 1} - {change.actorName} - {dateTime.format(new Date(change.createdAt))} WIB</option>)}
              </select>
              {selectedId && !changes.some((change) => change.id === selectedId) && <p className="mt-2 text-sm text-amber-700">Perubahan yang diminta tidak ditemukan. Menampilkan perubahan terbaru.</p>}
              <p className="mt-3 text-sm text-surface-600">Diubah oleh <strong>{selected.actorName}</strong> pada {dateTime.format(new Date(selected.createdAt))} WIB.</p>
            </div>
            <section aria-labelledby="change-differences" className="space-y-3">
              <h2 id="change-differences" className="text-lg font-bold text-surface-900">Rincian yang berubah</h2>
              {differences.length === 0 ? <p className="text-sm text-surface-600">Tidak ada perbedaan rincian yang dapat ditampilkan.</p> : (
                <ul className="space-y-3">
                  {differences.map((row) => (
                    <li key={row.label} className="rounded-xl border border-surface-200 bg-white p-4">
                      <h3 className="font-semibold text-surface-900">{row.label}</h3>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="min-w-0 rounded-lg bg-surface-50 p-3"><p className="text-xs font-semibold text-surface-500">Sebelum</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-surface-800">{row.previous}</p></div>
                        <div className="min-w-0 rounded-lg bg-brand-50 p-3"><p className="text-xs font-semibold text-brand-700">Sesudah</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-surface-800">{row.current}</p></div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="receipt-versions" className="space-y-3">
              <h2 id="receipt-versions" className="text-lg font-bold text-surface-900">Versi nota</h2>
              <SnapshotDetails title="Nota asli sebelum perubahan Sales pertama" snapshot={changes[0].before} initiallyOpen />
              <div className="grid gap-3 md:grid-cols-2">
                <SnapshotDetails title="Nota sebelum perubahan ini" snapshot={selected.before} />
                <SnapshotDetails title="Nota sesudah perubahan ini" snapshot={selected.after} />
              </div>
            </section>
          </>
        )}
  </>);
}

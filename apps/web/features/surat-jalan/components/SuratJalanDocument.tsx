"use client";

import React, { useLayoutEffect, useRef } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { PrintItemTable } from "@/components/PrintItemTable";
import "./surat-jalan-print.css";

export interface SuratJalanDocumentRow {
  id: string;
  originalName: string;
  productName: string;
  quantity: string;
  unit: string | null;
  keterangan: string;
}

export interface SuratJalanStoreIdentity {
  name: string;
  address: string;
  phone: string;
}

interface InlineFieldProps {
  label: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  numeric?: boolean;
  maxLength?: number;
  placeholder?: string;
}

function InlineDocumentField({ label, value, readOnly, onChange, numeric, maxLength, placeholder }: InlineFieldProps) {
  const focusValue = useRef(value);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = "auto";
      textarea.current.style.height = `${textarea.current.scrollHeight}px`;
    }
  }, [value]);
  const shared = {
    "aria-label": label,
    className: "sj-inline-input",
    value,
    readOnly,
    maxLength,
    placeholder: readOnly ? "—" : placeholder,
    onFocus: () => { focusValue.current = value; },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!event.nativeEvent.isComposing) {
          event.preventDefault();
          onChange(focusValue.current);
        }
      }
    },
  };
  return (
    <div className={`sj-inline-field${numeric ? " sj-inline-number" : ""}`}>
      {numeric ? <input {...shared} type="text" inputMode="decimal" autoComplete="off" /> : <textarea {...shared} ref={textarea} rows={1} />}
      {!readOnly && <Pencil className="sj-field-pencil" aria-hidden="true" />}
      <span className="sj-print-value">{value || "—"}</span>
    </div>
  );
}

function formatSuratJalanDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

export function SuratJalanDocument({ store, number, date, recipientName, rows, limits, readOnly, printingBusy, onRecipientChange, onRowChange }: {
  store: SuratJalanStoreIdentity;
  number: string;
  date: string;
  recipientName: string;
  rows: SuratJalanDocumentRow[];
  limits: Record<string, number>;
  readOnly: boolean;
  printingBusy?: boolean;
  onRecipientChange: (value: string) => void;
  onRowChange: (id: string, field: "quantity" | "productName" | "keterangan", value: string) => void;
}) {
  return (
    <article id="surat-jalan-print" className="print-document sj-document" aria-label="Struk surat jalan">
      <header className="sj-document-header">
        <div className="sj-store">
          <img src="/images/logo_teladan.png" alt="Logo toko" width={52} height={52} />
          <div><h3>{store.name}</h3><p>{store.address}</p><p>Telp. {store.phone}</p></div>
        </div>
        <dl className="sj-document-meta">
          <div><dt>Tanggal</dt><dd>{formatSuratJalanDate(date)}</dd></div>
          <div className="sj-recipient"><dt>Penerima</dt><dd><InlineDocumentField label="Penerima" value={recipientName} readOnly={readOnly} onChange={onRecipientChange} maxLength={200} placeholder="Nama penerima" /></dd></div>
        </dl>
      </header>
      <div className="sj-document-heading">
        <h2>SURAT JALAN</h2>
        <p>No. {number}</p>
      </div>
      <p className="sj-introduction">Kami kirimkan barang-barang berikut.</p>
      <div className="sj-vehicle">
        <span>Kendaraan <span aria-hidden="true" /></span>
        <span>No. Polisi <span aria-hidden="true" /></span>
      </div>
      <PrintItemTable
        className="sj-document-table"
        columnCount={4}
        columns={<colgroup><col className="sj-number-column" /><col className="sj-quantity-column" /><col className="sj-name-column" /><col className="sj-note-column" /></colgroup>}
        headings={<tr><th scope="col">NO.</th><th scope="col">BANYAKNYA</th><th scope="col">NAMA BARANG</th><th scope="col">KETERANGAN</th></tr>}
        disabled={printingBusy}
      >
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td>{index + 1}</td>
              <td>
                <div className="sj-quantity"><InlineDocumentField label={`Jumlah barang ${index + 1}`} numeric value={row.quantity} readOnly={readOnly} onChange={value => onRowChange(row.id, "quantity", value)} /><span>{row.unit}</span></div>
                {!readOnly && <small className="sj-edit-reference">Maks. {limits[row.id] ?? 0} {row.unit}</small>}
              </td>
              <td>
                <InlineDocumentField label={`Nama barang ${index + 1}`} value={row.productName} readOnly={readOnly} onChange={value => onRowChange(row.id, "productName", value)} maxLength={300} />
                {!readOnly && row.productName !== row.originalName && <div className="sj-edit-reference sj-original-name"><span>Di invoice: {row.originalName}</span><button type="button" onClick={() => onRowChange(row.id, "productName", row.originalName)} aria-label={`Kembalikan nama barang ${index + 1}`} title="Gunakan nama dari invoice"><RotateCcw size={12} /></button></div>}
              </td>
              <td><InlineDocumentField label={`Keterangan barang ${index + 1}`} value={row.keterangan} readOnly={readOnly} onChange={value => onRowChange(row.id, "keterangan", value)} maxLength={500} placeholder="Tambah keterangan" /></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={4}>Tidak ada barang yang dapat dikirim.</td></tr>}
      </PrintItemTable>
      <footer className="sj-signatures">
        <div><p>Tanda Terima</p><span aria-hidden="true" /></div>
        <div><p>Pengirim</p><span aria-hidden="true" /></div>
        <div><p>Hormat Kami,</p><span aria-hidden="true" /></div>
      </footer>
    </article>
  );
}

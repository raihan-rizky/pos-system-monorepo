"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Modal } from "@pos/ui";
import { Printer, Plus } from "lucide-react";
import type { SuratJalanBundle } from "../api/surat-jalan-api";
import type { SuratJalanRecord } from "../types/surat-jalan";
import { getDocumentQuantityLimits, type SuratJalanDocumentChanges } from "../helpers/surat-jalan-document";
import { SuratJalanDocument, type SuratJalanDocumentRow, type SuratJalanStoreIdentity } from "./SuratJalanDocument";

interface EditorValues { recipientName: string; rows: SuratJalanDocumentRow[] }

function valuesForDocument(bundle: SuratJalanBundle, record: SuratJalanRecord | null, records: SuratJalanRecord[]): EditorValues {
  const limits = getDocumentQuantityLimits(bundle.transaction.items, records);
  return {
    recipientName: record?.recipientName ?? bundle.transaction.customerName ?? "",
    rows: record ? record.items.map(item => ({
      id: item.transactionItemId,
      originalName: bundle.transaction.items.find(line => line.id === item.transactionItemId)?.productName ?? item.productName,
      productName: item.productName, quantity: String(item.quantity), unit: item.unit, keterangan: item.keterangan ?? "",
    })) : bundle.transaction.items.filter(item => item.productId && (limits[item.id] ?? 0) > 0).map(item => ({
      id: item.id, originalName: item.productName, productName: item.productName,
      quantity: String(limits[item.id]), unit: item.unit, keterangan: "",
    })),
  };
}

function initialDocument(bundle: SuratJalanBundle, id?: string) {
  return bundle.suratJalan.find(record => record.id === id) ?? [...bundle.suratJalan]
    .filter(record => ["PENDING", "CONFIRMED"].includes(record.status))
    .sort((a, b) => b.sequence - a.sequence || b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export function SuratJalanReceiptEditor({ bundle, initialRecordId, store, canCreate, canUpdate, onSave, onApprove, onClose }: {
  bundle: SuratJalanBundle;
  initialRecordId?: string;
  store: SuratJalanStoreIdentity;
  canCreate: boolean;
  canUpdate: boolean;
  onSave: (record: SuratJalanRecord | null, changes: SuratJalanDocumentChanges) => Promise<SuratJalanRecord>;
  onApprove?: (record: SuratJalanRecord) => Promise<SuratJalanRecord>;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<SuratJalanRecord | null>(() => initialDocument(bundle, initialRecordId));
  const [savedRecords, setSavedRecords] = useState<Record<string, SuratJalanRecord>>({});
  const records = useMemo(() => {
    const byId = new Map(bundle.suratJalan.map(item => [item.id, item]));
    for (const local of Object.values(savedRecords)) {
      const server = byId.get(local.id);
      if (!server || Date.parse(local.updatedAt ?? local.createdAt) > Date.parse(server.updatedAt ?? server.createdAt)) byId.set(local.id, local);
    }
    return [...byId.values()];
  }, [bundle.suratJalan, savedRecords]);
  const [values, setValues] = useState(() => valuesForDocument(bundle, record, records));
  const [baseline, setBaseline] = useState(values);
  const [date] = useState(() => new Date().toISOString());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const [pendingAction, setPendingAction] = useState<null | { record: SuratJalanRecord | null } | "close">(null);
  const content = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const parentClosed = ["VOIDED", "REFUNDED"].includes(bundle.transaction.status);
  const currentStatus = records.find(item => item.id === record?.id)?.status ?? record?.status;
  const editable = !saving && !parentClosed && (record ? canUpdate && ["PENDING", "CONFIRMED"].includes(currentStatus ?? "") : canCreate && bundle.eligibility.eligible);
  const limits = getDocumentQuantityLimits(bundle.transaction.items, records, record?.id);
  const draftLimits = getDocumentQuantityLimits(bundle.transaction.items, records);
  const canStartNew = canCreate && !parentClosed && Object.values(draftLimits).some(quantity => quantity > 0) && (bundle.eligibility.eligible || record !== null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const latest = record && records.find(item => item.id === record.id);
    if (!dirty && !busy.current && latest && latest !== record) {
      const nextValues = valuesForDocument(bundle, latest, records);
      setRecord(latest); setValues(nextValues); setBaseline(nextValues); setError("");
    }
  }, [bundle, records, record, dirty]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || busy.current) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const choose = (next: SuratJalanRecord | null) => {
    const nextValues = valuesForDocument(bundle, next, records);
    setRecord(next); setValues(nextValues); setBaseline(nextValues); setError("");
  };
  const requestAction = (action: NonNullable<typeof pendingAction>) => {
    if (busy.current) return;
    if (dirty) setPendingAction(action);
    else if (action === "close") onClose();
    else choose(action.record);
  };
  const applyCanonical = (saved: SuratJalanRecord) => {
    const nextValues = valuesForDocument(bundle, saved, records);
    setSavedRecords(current => ({ ...current, [saved.id]: saved }));
    setRecord(saved); setValues(nextValues); setBaseline(nextValues); setError("");
  };
  const saveAndPrint = async () => {
    if (busy.current || pendingAction) return;
    if (record && !dirty) { window.print(); return; }
    if (!editable) return;
    const recipientName = values.recipientName.trim();
    const quantities = Object.fromEntries(values.rows.map(row => [row.id, row.quantity.trim() === "" ? NaN : Number(row.quantity.replace(",", "."))]));
    if (!recipientName) { setError("Isi nama penerima terlebih dahulu."); return; }
    if (values.rows.some(row => !Number.isFinite(quantities[row.id]) || quantities[row.id] < 0 || quantities[row.id] > (limits[row.id] ?? 0) + 1e-8)) {
      setError("Periksa jumlah barang. Isi angka nol atau lebih, sesuai batas pengiriman."); return;
    }
    if (!Object.values(quantities).some(quantity => quantity > 0)) { setError("Pilih sedikitnya satu barang untuk dikirim."); return; }
    if (values.rows.some(row => quantities[row.id] > 0 && !row.productName.trim())) { setError("Nama barang yang dikirim wajib diisi."); return; }
    const changes = { recipientName, quantities,
      documentNames: Object.fromEntries(values.rows.map(row => [row.id, row.productName.trim()])),
      keterangan: Object.fromEntries(values.rows.map(row => [row.id, row.keterangan.trim()])),
    };
    busy.current = true; setSaving(true); setError("");
    try {
      const saved = await onSave(record, changes);
      if (!mounted.current) return;
      flushSync(() => { applyCanonical(saved); setSaving(false); });
      window.print();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Surat jalan belum berhasil disimpan. Silakan coba lagi.");
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  const approve = async () => {
    if (!record || !onApprove || busy.current || dirty) return;
    busy.current = true; setSaving(true); setError("");
    try { const saved = await onApprove(record); if (mounted.current) applyCanonical(saved); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Approval belum berhasil. Silakan coba lagi."); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  };

  return (
    <Modal open onClose={() => requestAction("close")} title="Surat Jalan" size="5xl" className="sj-editor-modal">
      <div className="sj-editor" ref={content} aria-busy={saving} onKeyDown={event => {
        if (event.key !== "Tab") return;
        const dialog = content.current?.closest('[role="dialog"]');
        const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input,textarea,[tabindex="0"]') ?? []).filter(element => element.offsetParent !== null);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <div className="sj-editor-toolbar surat-jalan-print-hide">
          <div className="sj-document-choice"><label htmlFor="sj-document-choice">Dokumen</label><select id="sj-document-choice" aria-label="Pilih surat jalan" value={record?.id ?? "draft"} disabled={saving || !!pendingAction} onChange={event => requestAction({ record: records.find(item => item.id === event.target.value) ?? null })}>
            {!record && <option value="draft">Pengiriman baru</option>}
            {[...records].sort((a, b) => b.sequence - a.sequence).map(item => <option key={item.id} value={item.id}>{item.number}{item.status === "PENDING" ? " · Menunggu approval" : item.status === "CANCELLED" ? " · Dibatalkan" : item.status === "REJECTED" ? " · Ditolak" : ""}</option>)}
          </select></div>
          {record && canStartNew && <button className="sj-secondary-button" type="button" disabled={saving || !!pendingAction} onClick={() => requestAction({ record: null })}><Plus size={15} />Pengiriman baru</button>}
        </div>
        <div className="sj-editor-guidance surat-jalan-print-hide">
          <p>{editable ? "Klik langsung pada penerima, nama barang, jumlah, atau keterangan untuk mengedit." : saving ? "Sedang menyimpan surat jalan…" : "Dokumen ini hanya dapat dilihat dan dicetak."}</p>
          {editable && <span>Jumlah 0 tidak disertakan saat disimpan. Nama barang hanya berubah di surat jalan ini.</span>}
          {record?.status === "PENDING" && <p>Menunggu approval. Dokumen dapat dicetak sebelum disetujui.</p>}
          {editable && bundle.transaction.stockDeductionSource === "SURAT_JALAN" && <p className="sj-stock-notice">Transaksi lama: perubahan jumlah pada dokumen yang disetujui juga menyesuaikan stok gudang.</p>}
          {!record && !bundle.eligibility.eligible && <p>Invoice ini belum memenuhi syarat untuk surat jalan baru.</p>}
        </div>
        <SuratJalanDocument store={store} number={record?.number ?? "Otomatis setelah disimpan"} date={record?.confirmedAt || record?.createdAt || date} recipientName={values.recipientName} rows={values.rows} limits={limits} readOnly={!editable || !!pendingAction}
          onRecipientChange={value => setValues(current => ({ ...current, recipientName: value }))}
          onRowChange={(id, field, value) => setValues(current => ({ ...current, rows: current.rows.map(row => row.id === id ? { ...row, [field]: value } : row) }))} />
        <div className="sj-editor-actions surat-jalan-print-hide">
          {error && <p role="alert" className="sj-error">{error}</p>}
          {pendingAction && <div role="alertdialog" aria-label="Perubahan belum disimpan" className="sj-discard-prompt"><p>Perubahan belum disimpan. Buang perubahan ini?</p><div><button type="button" className="sj-secondary-button" onClick={() => setPendingAction(null)} autoFocus>Lanjut edit</button><button type="button" className="sj-secondary-button" onClick={() => { const action = pendingAction; setPendingAction(null); if (action === "close") onClose(); else choose(action.record); }}>Buang perubahan</button></div></div>}
          <div className="sj-action-buttons"><span className="sj-save-state" aria-live="polite">{saving ? "Menyimpan…" : dirty ? "Ada perubahan belum disimpan" : record ? "Dokumen tersimpan" : "Draf belum disimpan"}</span>
            <button type="button" className="sj-secondary-button" disabled={saving || !!pendingAction} onClick={() => requestAction("close")}>Tutup</button>
            {record?.status === "PENDING" && canUpdate && onApprove && <button type="button" className="sj-secondary-button" disabled={saving || dirty || !!pendingAction} onClick={approve}>Setujui surat jalan</button>}
            <button type="button" className="sj-primary-button" onClick={saveAndPrint} disabled={saving || !!pendingAction || ((!record || dirty) && (!editable || !values.rows.length))}><Printer size={16} />{saving ? "Menyimpan…" : record && !dirty ? "Cetak" : "Simpan & Cetak"}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

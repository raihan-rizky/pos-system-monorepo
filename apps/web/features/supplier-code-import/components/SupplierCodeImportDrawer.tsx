"use client";

import { useState } from "react";
import { Modal } from "@pos/ui";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
} from "lucide-react";

import type {
  SupplierCodeImportCommitRow,
  SupplierCodeImportPreview,
} from "../types";

type Step = "upload" | "preview" | "result";

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || "Permintaan impor gagal.");
  return payload;
}

export function SupplierCodeImportDrawer({
  open,
  onClose,
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SupplierCodeImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ updatedProducts: number; linkedSuppliers: number } | null>(null);

  function resetAndClose() {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setError(null);
    setResult(null);
    onClose();
  }

  function downloadTemplate() {
    const blob = new Blob(["SKU,Kode Supplier\r\nATK-001,SP0001\r\nATK-002,\"SP0001, SP0002\"\r\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "template-impor-kode-supplier-massal.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function createPreview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/products/import/supplier-codes/preview", {
        method: "POST",
        body: formData,
      });
      const nextPreview = await responseJson<SupplierCodeImportPreview>(response);
      setPreview(nextPreview);
      setStep("preview");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pratinjau gagal dibuat.");
    } finally {
      setLoading(false);
    }
  }

  async function commitImport() {
    if (!preview || preview.invalidRows > 0) return;
    setLoading(true);
    setError(null);
    try {
      const rows: SupplierCodeImportCommitRow[] = preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        sku: row.sku,
        productId: row.productId!,
        supplierCodes: row.supplierCodes,
        supplierIds: row.supplierIds,
      }));
      const response = await fetch("/api/products/import/supplier-codes/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      setResult(
        await responseJson<{ updatedProducts: number; linkedSuppliers: number }>(response),
      );
      setStep("result");
      onCompleted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impor gagal dijalankan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Impor Kode Supplier Massal" size="5xl">
      <div className="space-y-5">
        {step === "upload" && (
          <>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-black">Siapkan kolom SKU dan Kode Supplier.</p>
              <p className="mt-1 font-medium text-blue-700">
                Pisahkan beberapa kode supplier dengan koma. Relasi supplier produk akan diganti sesuai isi berkas.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" /> Unduh Template CSV
            </button>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center hover:border-blue-400 hover:bg-blue-50/40">
              <FileSpreadsheet className="mb-3 h-10 w-10 text-blue-600" />
              <span className="font-black text-slate-900">Pilih berkas CSV atau XLSX</span>
              <span className="mt-1 text-sm font-semibold text-slate-500">
                {file?.name ?? "Belum ada berkas dipilih"}
              </span>
              <input
                type="file"
                accept=".csv,.xlsx"
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!file || loading}
                onClick={createPreview}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Buat Pratinjau
              </button>
            </div>
          </>
        )}

        {step === "preview" && preview && (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Summary label="Total baris" value={preview.totalRows} />
              <Summary label="Siap diimpor" value={preview.validRows} tone="success" />
              <Summary label="Perlu diperbaiki" value={preview.invalidRows} tone="danger" />
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                  <tr><th className="p-3">Baris</th><th className="p-3">Produk</th><th className="p-3">Supplier</th><th className="p-3">Status</th></tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-slate-100 align-top">
                      <td className="p-3 font-bold">{row.rowNumber}</td>
                      <td className="p-3"><div className="font-bold text-slate-900">{row.productName ?? "Produk tidak ditemukan"}</div><div className="text-xs text-slate-500">{row.sku || "Tanpa SKU"}</div></td>
                      <td className="p-3 font-semibold text-slate-700">{row.supplierCodes.join(", ") || "-"}</td>
                      <td className="p-3">
                        {row.errors.length === 0 ? <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Siap</span> : <ul className="space-y-1 text-xs font-semibold text-red-700">{row.errors.map((message) => <li key={message}>{message}</li>)}</ul>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between gap-3">
              <button type="button" onClick={() => setStep("upload")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold">Ganti Berkas</button>
              <button type="button" disabled={preview.invalidRows > 0 || loading} onClick={commitImport} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{loading && <LoaderCircle className="h-4 w-4 animate-spin" />} Terapkan Impor</button>
            </div>
          </>
        )}

        {step === "result" && result && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h3 className="mt-3 text-lg font-black text-emerald-900">Impor selesai</h3>
            <p className="mt-1 font-semibold text-emerald-700">{result.updatedProducts} produk diperbarui dengan {result.linkedSuppliers} relasi supplier.</p>
            <button type="button" onClick={resetAndClose} className="mt-5 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white">Selesai</button>
          </div>
        )}

        {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      </div>
    </Modal>
  );
}

function Summary({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "success" | "danger" }) {
  const color = tone === "success" ? "text-emerald-700" : tone === "danger" ? "text-red-700" : "text-slate-900";
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><div className={`text-2xl font-black ${color}`}>{value}</div><div className="text-xs font-bold text-slate-500">{label}</div></div>;
}

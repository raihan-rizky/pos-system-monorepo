"use client";

import { AlertTriangle, CheckCircle2, Database, Lock } from "lucide-react";
import { Button } from "@pos/ui";
import { useState } from "react";
import { useDatabaseResetExecute, useDatabaseResetPreview } from "@/hooks/useDatabaseReset";
import {
  DATABASE_RESET_CONFIRMATION,
  type DatabaseResetDomain,
  type DatabaseResetPreview,
  type DatabaseResetSummary,
} from "@/features/database-reset/types/database-reset";

const DOMAIN_OPTIONS: Array<{ id: DatabaseResetDomain; label: string; description: string }> = [
  { id: "productCatalog", label: "Katalog Produk", description: "Produk, brand, grup stok, dan riwayat harga." },
  { id: "customers", label: "Pelanggan", description: "Data pelanggan di store ini." },
  { id: "salesFinance", label: "Penjualan & Keuangan", description: "Transaksi, pembayaran, shift, dan pengeluaran." },
  { id: "supplierProcurement", label: "Supplier & Pengadaan", description: "Supplier, daftar belanja, pembelian, dan penerimaan." },
  { id: "inventoryOperations", label: "Inventaris & Operasional", description: "Log stok, surat jalan, task, dan koreksi." },
  { id: "importBatchJobs", label: "Import & Batch Jobs", description: "Riwayat import dan operasi batch." },
  { id: "storeNotifications", label: "Notifikasi Store", description: "Notifikasi dan push subscription store ini." },
];

export interface DatabaseResetViewProps {
  selectedDomains: DatabaseResetDomain[];
  preview: DatabaseResetPreview | null;
  confirmation: string;
  isPreviewing: boolean;
  isExecuting: boolean;
  error: string | null;
  success: DatabaseResetSummary | null;
  onToggleDomain: (domain: DatabaseResetDomain) => void;
  onPreview: () => void;
  onConfirmationChange: (value: string) => void;
  onExecute: () => void;
}

export function DatabaseResetView({
  selectedDomains,
  preview,
  confirmation,
  isPreviewing,
  isExecuting,
  error,
  success,
  onToggleDomain,
  onPreview,
  onConfirmationChange,
  onExecute,
}: DatabaseResetViewProps) {
  const blockingDependencies = preview?.requiredDependencies.filter((dependency) => dependency.blocking) ?? [];
  const canExecute = Boolean(
    preview?.canExecute &&
      selectedDomains.length > 0 &&
      confirmation === DATABASE_RESET_CONFIRMATION &&
      !isExecuting,
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-50 text-danger-600">
            <Database className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-surface-900">Reset Database</h2>
            <p className="mt-1 text-sm text-surface-500">Bersihkan data operasional store secara selektif.</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">Aksi ini irreversible.</p>
            <p className="mt-1">Pilih data dengan teliti. User, store settings, RBAC, dan data shared tetap dipertahankan.</p>
          </div>
        </div>
      </div>

      <section aria-labelledby="reset-domain-heading">
        <h3 id="reset-domain-heading" className="text-sm font-bold text-surface-900">Pilih data yang mau di-reset</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {DOMAIN_OPTIONS.map((option) => (
            <label key={option.id} className="flex cursor-pointer gap-3 rounded-xl border border-surface-200 p-4 hover:border-brand-300">
              <input
                type="checkbox"
                checked={selectedDomains.includes(option.id)}
                onChange={() => onToggleDomain(option.id)}
                className="mt-1 h-4 w-4 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-semibold text-surface-900">{option.label}</span>
                <span className="mt-1 block text-xs text-surface-500">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-surface-500">Kategori global dipertahankan karena dapat dipakai lintas store. Chat assistant dan data shared juga tidak ikut di-reset.</p>
      </section>

      <Button type="button" onClick={onPreview} loading={isPreviewing} disabled={selectedDomains.length === 0 || isExecuting}>
        Lihat Dampak Reset
      </Button>

      {preview && (
        <section aria-labelledby="reset-impact-heading" className="space-y-4 rounded-xl border border-surface-200 bg-surface-50 p-4">
          <div>
            <h3 id="reset-impact-heading" className="text-sm font-bold text-surface-900">Preview Dampak Reset</h3>
            <p className="mt-1 text-xs text-surface-500">Data cascade otomatis ikut terhapus dan tidak bisa di-uncheck.</p>
          </div>

          <div className="space-y-2">
            {preview.operations.map((operation) => (
              <div key={operation.model} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-surface-700">
                  {operation.mode === "cascade" && <Lock className="h-3.5 w-3.5 text-surface-400" aria-hidden="true" />}
                  {operation.model}
                </span>
                <span className="font-semibold text-surface-900">{operation.count}</span>
              </div>
            ))}
          </div>

          {preview.cascades.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-bold">Cascade</p>
              {preview.cascades.map((cascade) => <p key={`${cascade.sourceDomain}-${cascade.model}`} className="mt-1">{cascade.model}: {cascade.reason} ({cascade.count})</p>)}
            </div>
          )}

          {blockingDependencies.length > 0 && (
            <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">
              <p className="font-bold">Wajib dipilih</p>
              <p className="mt-1">Pilih domain yang diwajibkan terlebih dahulu.</p>
              {blockingDependencies.map((dependency) => <p key={dependency.domain} className="mt-1">{dependency.domain}: {dependency.reason}</p>)}
            </div>
          )}

          <div className="rounded-lg border border-surface-200 bg-white p-3 text-xs text-surface-600">
            <p className="font-semibold text-surface-800">Data yang dipertahankan</p>
            {preview.preserved.map((item) => <p key={item.model} className="mt-1">{item.model}: {item.reason}</p>)}
          </div>

          <div className="space-y-2">
            <label htmlFor="database-reset-confirmation" className="block text-sm font-semibold text-surface-900">Ketik RESET DATABASE</label>
            <input
              id="database-reset-confirmation"
              value={confirmation}
              onChange={(event) => onConfirmationChange(event.target.value)}
              placeholder={DATABASE_RESET_CONFIRMATION}
              className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm outline-none focus:border-danger-400 focus:ring-2 focus:ring-danger-100"
            />
            <Button type="button" variant="danger" loading={isExecuting} disabled={!canExecute} onClick={onExecute}>
              Reset Data Terpilih
            </Button>
          </div>
        </section>
      )}

      {error && <p className="rounded-lg bg-danger-50 p-3 text-sm font-medium text-danger-700">{error}</p>}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Reset berhasil</div>
          <div className="mt-2 space-y-1">{success.deleted.map((item) => <p key={item.model}>{item.model}: {item.count}</p>)}</div>
        </div>
      )}
    </div>
  );
}

export default function DatabaseResetTab() {
  const [selectedDomains, setSelectedDomains] = useState<DatabaseResetDomain[]>([]);
  const [preview, setPreview] = useState<DatabaseResetPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [success, setSuccess] = useState<DatabaseResetSummary | null>(null);
  const previewMutation = useDatabaseResetPreview();
  const executeMutation = useDatabaseResetExecute();

  const toggleDomain = (domain: DatabaseResetDomain) => {
    setSelectedDomains((current) => current.includes(domain) ? current.filter((item) => item !== domain) : [...current, domain]);
    setPreview(null);
    setSuccess(null);
    setConfirmation("");
  };

  return (
    <DatabaseResetView
      selectedDomains={selectedDomains}
      preview={preview}
      confirmation={confirmation}
      isPreviewing={previewMutation.isPending}
      isExecuting={executeMutation.isPending}
      error={previewMutation.error?.message ?? executeMutation.error?.message ?? null}
      success={success}
      onToggleDomain={toggleDomain}
      onPreview={() => { setSuccess(null); previewMutation.mutate(selectedDomains, { onSuccess: setPreview }); }}
      onConfirmationChange={setConfirmation}
      onExecute={() => executeMutation.mutate({ domains: selectedDomains, confirmation }, { onSuccess: setSuccess })}
    />
  );
}

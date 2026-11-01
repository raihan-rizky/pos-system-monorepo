"use client";

import { AlertTriangle, CheckCircle2, Database, Lock } from "lucide-react";
import { Button } from "@pos/ui";
import { useState } from "react";
import { useDatabaseResetExecute, useDatabaseResetPreview } from "@/hooks/useDatabaseReset";
import {
  DATABASE_RESET_CONFIRMATION,
  type DatabaseResetDomain,
  type DatabaseResetModel,
  type DatabaseResetPreview,
  type DatabaseResetSummary,
} from "@/features/database-reset/types/database-reset";
import { DATABASE_RESET_MODEL_LABELS, DATABASE_RESET_OPTIONS, DATABASE_RESET_SELECTABLE_MODELS, toggleDatabaseResetCategory } from "@/features/database-reset/helpers/database-reset-options";

export interface DatabaseResetViewProps {
  selectedModels: DatabaseResetModel[];
  preview: DatabaseResetPreview | null;
  confirmation: string;
  isPreviewing: boolean;
  isExecuting: boolean;
  error: string | null;
  success: DatabaseResetSummary | null;
  onToggleDomain: (domain: DatabaseResetDomain) => void;
  onToggleModel: (model: DatabaseResetModel) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onPreview: () => void;
  onConfirmationChange: (value: string) => void;
  onExecute: () => void;
}

export function DatabaseResetView({
  selectedModels,
  preview,
  confirmation,
  isPreviewing,
  isExecuting,
  error,
  success,
  onToggleDomain,
  onToggleModel,
  onSelectAll,
  onClearSelection,
  onPreview,
  onConfirmationChange,
  onExecute,
}: DatabaseResetViewProps) {
  const blockingDependencies = preview?.requiredDependencies.filter((dependency) => dependency.blocking) ?? [];
  const canExecute = Boolean(
    preview?.canExecute &&
      selectedModels.length > 0 &&
      confirmation === DATABASE_RESET_CONFIRMATION &&
      !isExecuting && !isPreviewing && !success,
  );
  const selectionDisabled = isPreviewing || isExecuting;

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
            <p className="font-bold">Data yang dihapus tidak dapat dikembalikan.</p>
            <p className="mt-1">Pilih data dengan teliti. Akun pengguna, pengaturan toko, RBAC, dan data bersama tetap dipertahankan.</p>
          </div>
        </div>
      </div>

      <section aria-labelledby="reset-domain-heading">
        <h3 id="reset-domain-heading" className="text-sm font-bold text-surface-900">Pilih data yang mau di-reset</h3>
        <p className="mt-1 text-xs text-surface-500">Centang kategori untuk memilih semua sub-data, atau pilih sub-data satu per satu.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={onSelectAll} disabled={selectionDisabled || selectedModels.length === DATABASE_RESET_SELECTABLE_MODELS.length}>Pilih Semua</Button>
          <Button type="button" variant="secondary" onClick={onClearSelection} disabled={selectionDisabled || selectedModels.length === 0}>Hapus Semua Pilihan</Button>
          <span className="text-xs text-surface-500" role="status">{selectedModels.length} sub-data dipilih</span>
        </div>
        <div className="mt-3 grid items-start gap-3 md:grid-cols-2">
          {DATABASE_RESET_OPTIONS.map((option) => {
            const count = option.items.filter(item => selectedModels.includes(item.model)).length;
            const partial = count > 0 && count < option.items.length;
            return (
              <fieldset key={option.id} disabled={selectionDisabled} aria-label={option.label} className="min-w-0 rounded-xl border border-surface-200 disabled:opacity-60">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 border-b border-surface-100 p-4">
                  <input type="checkbox" aria-label={option.label} checked={count === option.items.length} aria-checked={partial ? "mixed" : count === option.items.length}
                    ref={node => { if (node) node.indeterminate = partial; }}
                    onChange={() => onToggleDomain(option.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-surface-900">{option.label}</span>
                    <span className="mt-1 block text-xs text-surface-500">{option.description}</span>
                  </span>
                  <span className="shrink-0 text-xs text-surface-500">{count}/{option.items.length}</span>
                </label>
                <div className="px-4 py-2">
                  {option.items.map(item => (
                    <label key={item.model} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-50">
                      <input type="checkbox" aria-label={item.label} checked={selectedModels.includes(item.model)} onChange={() => onToggleModel(item.model)} className="h-4 w-4 shrink-0 accent-brand-600" />
                      <span className="text-sm text-surface-700">{item.label}
                        {item.model === "ProductPriceLog" && <span className="mt-0.5 block text-xs text-surface-500">Harga produk saat ini tetap tersimpan.</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-surface-500">Data terkait yang wajib ikut terhapus ditampilkan pada preview dampak reset.</p>
        <p className="mt-3 text-xs text-surface-500">Kategori global dipertahankan karena dapat dipakai lintas store. Chat assistant dan data shared juga tidak ikut di-reset.</p>
      </section>

      <Button type="button" onClick={onPreview} loading={isPreviewing} disabled={selectedModels.length === 0 || selectionDisabled}>
        Lihat Dampak Reset
      </Button>

      {preview && (
        <section aria-labelledby="reset-impact-heading" className="space-y-4 rounded-xl border border-surface-200 bg-surface-50 p-4">
          <div>
            <h3 id="reset-impact-heading" className="text-sm font-bold text-surface-900">Preview Dampak Reset</h3>
            <p className="mt-1 text-xs text-surface-500">Data cascade wajib ikut terhapus bersama data induknya dan ditandai dengan ikon kunci.</p>
          </div>

          <div className="space-y-2">
            {preview.operations.map((operation) => (
              <div key={operation.model} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-surface-700">
                  {(operation.mode === "cascade" || preview.cascades.some(cascade => cascade.model === operation.model)) && <Lock className="h-3.5 w-3.5 text-surface-400" aria-hidden="true" />}
                  {DATABASE_RESET_MODEL_LABELS[operation.model]}
                </span>
                <span className="font-semibold text-surface-900">{operation.count}</span>
              </div>
            ))}
          </div>

          {preview.cascades.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-bold">Cascade</p>
              {preview.cascades.map((cascade) => <p key={`${cascade.sourceDomain}-${cascade.model}`} className="mt-1">{DATABASE_RESET_MODEL_LABELS[cascade.model]}: {cascade.reason} ({cascade.count})</p>)}
            </div>
          )}

          {blockingDependencies.length > 0 && (
            <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">
              <p className="font-bold">Reset belum dapat dilanjutkan</p>
              <p className="mt-1">Periksa alasan di bawah, lalu ubah pilihan dan lihat dampaknya lagi.</p>
              {blockingDependencies.map((dependency, index) => <p key={`${dependency.domain}-${dependency.model ?? index}`} className="mt-1">{dependency.model ? DATABASE_RESET_MODEL_LABELS[dependency.model] : DATABASE_RESET_OPTIONS.find(option => option.id === dependency.domain)?.label}: {dependency.reason}</p>)}
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
              disabled={selectionDisabled || Boolean(success)}
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
          <div className="mt-2 space-y-1">{success.deleted.map((item) => <p key={item.model}>{DATABASE_RESET_MODEL_LABELS[item.model]}: {item.count}</p>)}</div>
        </div>
      )}
    </div>
  );
}

export default function DatabaseResetTab() {
  const [selectedModels, setSelectedModels] = useState<DatabaseResetModel[]>([]);
  const [preview, setPreview] = useState<DatabaseResetPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [success, setSuccess] = useState<DatabaseResetSummary | null>(null);
  const previewMutation = useDatabaseResetPreview();
  const executeMutation = useDatabaseResetExecute();

  const changeSelection = (update: (current: DatabaseResetModel[]) => DatabaseResetModel[]) => {
    setSelectedModels(update);
    setPreview(null);
    setSuccess(null);
    setConfirmation("");
    previewMutation.reset();
    executeMutation.reset();
  };

  return (
    <DatabaseResetView
      selectedModels={selectedModels}
      preview={preview}
      confirmation={confirmation}
      isPreviewing={previewMutation.isPending}
      isExecuting={executeMutation.isPending}
      error={previewMutation.error?.message ?? executeMutation.error?.message ?? null}
      success={success}
      onToggleDomain={domain => changeSelection(current => toggleDatabaseResetCategory(current, domain))}
      onToggleModel={model => changeSelection(current => current.includes(model) ? current.filter(item => item !== model) : [...current, model])}
      onSelectAll={() => changeSelection(() => [...DATABASE_RESET_SELECTABLE_MODELS])}
      onClearSelection={() => changeSelection(() => [])}
      onPreview={() => { setSuccess(null); setPreview(null); setConfirmation(""); previewMutation.mutate({ models: selectedModels }, { onSuccess: setPreview }); }}
      onConfirmationChange={setConfirmation}
      onExecute={() => executeMutation.mutate({ models: selectedModels, confirmation }, { onSuccess: summary => { setSuccess(summary); setPreview(null); setConfirmation(""); } })}
    />
  );
}

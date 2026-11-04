"use client";

import { useState } from "react";
import { useRole } from "@/components/providers/RoleProvider";
import { usePriceRoundingCategories } from "../hooks/usePriceRoundingCategories";
import { DEFAULT_PRICE_ROUNDING_SETTINGS, roundSellingPrice, type PriceRoundingSettings } from "../rounding";
import { usePriceRoundingSettings, useUpdatePriceRoundingSettings } from "../hooks/usePriceRoundingSettings";

export interface PriceRoundingSettingsViewProps {
  settings: PriceRoundingSettings;
  canUpdate: boolean;
  isLoading: boolean;
  isUpdating: boolean;
  unavailable?: boolean;
  error: string | null;
  success: boolean;
  categories?: Array<{ id: string; name: string }>;
  categoriesLoading?: boolean;
  categoriesError?: boolean;
  onRetryCategories?: () => void;
  onChange: (settings: PriceRoundingSettings) => void;
  onSubmit: () => void;
}

const currency = (value: number) => `Rp${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;

export function PriceRoundingSettingsView({ settings, canUpdate, isLoading, isUpdating, unavailable = false, error, success, categories = [], categoriesLoading = false, categoriesError = false, onRetryCategories, onChange, onSubmit }: PriceRoundingSettingsViewProps) {
  const [search, setSearch] = useState("");
  const selected = settings.excludedCategoryIds ?? [];
  const visibleCategories = categories.filter(category => category.name.toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID")));
  const validIncrement = Number.isSafeInteger(settings.increment) && settings.increment >= 1 && settings.increment <= 1_000_000_000;
  const validThreshold = Number.isSafeInteger(settings.threshold) && settings.threshold >= 0 && settings.threshold <= settings.increment;
  const validationError = !validIncrement
    ? "Kelipatan harus berupa bilangan bulat dari 1 sampai 1.000.000.000."
    : !validThreshold ? "Ambang naik harus berupa bilangan bulat dari nol sampai kelipatan." : null;
  const disabled = isLoading || isUpdating || unavailable || !canUpdate;
  const categoriesUnavailable = categoriesLoading || categoriesError;

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (!disabled && !categoriesUnavailable && !validationError) onSubmit(); }} className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-surface-900">Pembulatan Harga</h2>
        <p className="mt-1 text-sm text-surface-500">Atur pembulatan hasil akhir harga jual produk untuk transaksi baru.</p>
      </div>
      {isLoading && <p role="status" className="text-sm text-surface-500">Memuat pengaturan pembulatan…</p>}
      {!canUpdate && <p className="text-sm text-surface-500">Anda dapat melihat pengaturan. Minta izin Ubah Pembulatan Harga kepada Owner untuk menyimpan perubahan.</p>}
      <fieldset disabled={disabled} className="space-y-5">
        <legend className="sr-only">Kebijakan pembulatan harga jual</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-surface-900">
          <input type="checkbox" role="switch" checked={settings.enabled} aria-checked={settings.enabled}
            onChange={(event) => onChange({ ...settings, enabled: event.target.checked })} className="h-5 w-5 accent-brand-600" />
          Aktifkan pembulatan harga jual
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rounding-increment" className="mb-1 block text-sm font-semibold text-surface-900">Kelipatan (Rp)</label>
            <input id="rounding-increment" type="number" inputMode="numeric" min={1} max={1_000_000_000} step={1} required
              value={Number.isNaN(settings.increment) ? "" : settings.increment}
              aria-invalid={!validIncrement} aria-describedby="rounding-rule"
              onChange={(event) => onChange({ ...settings, increment: event.target.valueAsNumber })}
              className="min-h-11 w-full rounded-xl border border-surface-300 px-3 text-sm disabled:opacity-60" />
          </div>
          <div>
            <label htmlFor="rounding-threshold" className="mb-1 block text-sm font-semibold text-surface-900">Ambang naik (Rp)</label>
            <input id="rounding-threshold" type="number" inputMode="numeric" min={0} max={validIncrement ? settings.increment : undefined} step={1} required
              value={Number.isNaN(settings.threshold) ? "" : settings.threshold}
              aria-invalid={!validThreshold} aria-describedby="rounding-rule"
              onChange={(event) => onChange({ ...settings, threshold: event.target.valueAsNumber })}
              className="min-h-11 w-full rounded-xl border border-surface-300 px-3 text-sm disabled:opacity-60" />
          </div>
        </div>
      </fieldset>
      <p id="rounding-rule" className="text-sm text-surface-500">Sisa harga di bawah ambang dibulatkan ke bawah. Mulai ambang, harga naik ke kelipatan berikutnya. Harga yang sudah tepat kelipatan tetap.</p>
      <fieldset disabled={isLoading || isUpdating || unavailable || categoriesUnavailable} className="space-y-3 rounded-xl border border-surface-200 p-4">
        <legend className="px-1 text-sm font-bold text-surface-900">Kategori yang dikecualikan</legend>
        <p className="text-sm text-surface-600">Semua harga produk dalam kategori yang dipilih tidak dibulatkan. Kosongkan pilihan untuk menerapkan aturan ke semua kategori.</p>
        <label htmlFor="rounding-category-search" className="block text-sm font-semibold text-surface-900">Cari kategori</label>
        <input id="rounding-category-search" type="search" value={search} onChange={event => setSearch(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-surface-300 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500" />
        <p aria-live="polite" className="text-sm text-surface-600">{selected.length} kategori dipilih</p>
        {categoriesLoading ? <p role="status" className="text-sm text-surface-500">Memuat kategori…</p> :
          !categoriesError && (visibleCategories.length ? <div className="max-h-60 overflow-y-auto rounded-lg border border-surface-200">
            {visibleCategories.map(category => <label key={category.id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm text-surface-900 hover:bg-surface-50">
              <input type="checkbox" disabled={!canUpdate} checked={selected.includes(category.id)} onChange={event => onChange({ ...settings,
                excludedCategoryIds: event.target.checked ? [...selected, category.id] : selected.filter(id => id !== category.id),
              })} className="h-5 w-5 accent-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500" />
              <span>{category.name}</span>
            </label>)}
          </div> : <p role="status" className="text-sm text-surface-500">{categories.length ? "Tidak ada kategori yang cocok." : "Belum ada kategori produk."}</p>)}
      </fieldset>
      {categoriesError && <p role="alert" className="text-sm text-danger-700">Kategori belum dapat dimuat. {onRetryCategories && <button type="button" onClick={onRetryCategories} className="min-h-11 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">Coba lagi</button>}</p>}
      {validationError && <p role="alert" className="text-sm text-danger-700">{validationError}</p>}
      {!validationError && (
        <section aria-label="Pratinjau pembulatan" className="rounded-xl border border-surface-200 bg-surface-50 p-4">
          <h3 className="text-sm font-bold text-surface-900">Pratinjau langsung</h3>
          <p className="mt-1 text-xs text-surface-600">Contoh untuk kategori yang tidak dikecualikan.</p>
          <div aria-live="polite" aria-atomic="true" className="mt-3 space-y-2 text-sm text-surface-700">
            {[4049, 4050, 4549, 4550].map((price) => {
              const result = roundSellingPrice(price, settings);
              return <p key={price}>{currency(price)} → <strong>{currency(result.roundedPrice)}</strong> <span>({result.direction === "UP" ? "dibulatkan ke atas" : result.direction === "DOWN" ? "dibulatkan ke bawah" : "tetap"})</span></p>;
            })}
          </div>
        </section>
      )}
      {error && <p role="alert" className="rounded-xl bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700">Pengaturan pembulatan berhasil disimpan.</p>}
      <button type="submit" disabled={disabled || categoriesUnavailable || !!validationError} className="min-h-11 rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {isUpdating ? "Menyimpan…" : "Simpan pengaturan"}
      </button>
    </form>
  );
}

export default function PriceRoundingSettingsTab() {
  const { canPerform } = useRole();
  const query = usePriceRoundingSettings();
  const categories = usePriceRoundingCategories(canPerform("settings.price_rounding", "read") || canPerform("settings.price_rounding", "update"));
  const update = useUpdatePriceRoundingSettings();
  const [draft, setDraft] = useState<PriceRoundingSettings | null>(null);
  const awaitingServerPolicy = !query.isFetchedAfterMount;
  if (!canPerform("settings.price_rounding", "read") && !canPerform("settings.price_rounding", "update")) return null;
  return <PriceRoundingSettingsView
    settings={draft ?? query.data ?? DEFAULT_PRICE_ROUNDING_SETTINGS}
    canUpdate={canPerform("settings.price_rounding", "update")}
    isLoading={query.isFetching && awaitingServerPolicy}
    isUpdating={update.isPending}
    unavailable={query.isError || query.isPlaceholderData || !query.data || awaitingServerPolicy}
    error={query.error?.message ?? update.error?.message ?? null}
    success={update.isSuccess}
    categories={categories.data ?? []}
    categoriesLoading={categories.isPending}
    categoriesError={categories.isError}
    onRetryCategories={() => { void categories.refetch(); }}
    onChange={(settings) => { setDraft(settings); update.reset(); }}
    onSubmit={() => {
      if (query.isError || query.isPlaceholderData || !query.data || awaitingServerPolicy || categories.isPending || categories.isError) return;
      update.mutate(draft ?? query.data, { onSuccess: () => setDraft(null) });
    }}
  />;
}

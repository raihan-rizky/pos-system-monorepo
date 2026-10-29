"use client";

import React, { useEffect, useRef, useState } from "react";
import { useCategories } from "@/hooks/useProducts";
import { useBrands, useCreateBrand } from "@/hooks/useBrands";
import {
  usePricingScopeOptions,
  usePricingUnitOptions,
  useCustomerCategoryPricingRules,
  type CustomerCategoryPricingRule,
  type CustomerCategoryPricingRuleInput,
} from "@/hooks/useCustomerCategoryPricingRules";
import { PRICING_CUSTOMER_TYPES, normalizePricingUnits, calculateCustomPriceMargin } from "../helpers/pricing-rules";
import {
  CUSTOMER_TARGET_LABELS,
  PRICING_METHODS,
  getPricingMethod,
  previewPricingForm,
  toggleCustomerTarget,
  validatePricingForm,
  type PricingFormState,
  type PricingFormErrors,
} from "../helpers/pricing-form";
import { PriceRoundingBadge } from "@/features/product-price-rounding/components/PriceRoundingBadge";
import { roundSellingPrice, type PriceRoundingResult, type PriceRoundingSettings } from "@/features/product-price-rounding/rounding";
import { formatRupiah } from "@/lib/utils";

interface Props {
  roundingSettings?: PriceRoundingSettings;
  initialRule?: CustomerCategoryPricingRule | null;
  onSave: (input: CustomerCategoryPricingRuleInput) => Promise<unknown>;
  onClose: () => void;
  isSaving: boolean;
}
const controlClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500";
const buttonClass =
  "rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50";

export function PricingRuleForm({
  initialRule,
  onSave,
  onClose,
  isSaving,
  roundingSettings,
}: Props) {
  const [form, setForm] = useState<PricingFormState>(() => ({
    categoryId: initialRule?.categoryId ?? "",
    unit: initialRule?.unit ?? "",
    units: normalizePricingUnits(initialRule?.units, initialRule?.unit),
    customerTypes: initialRule?.customerTypes?.length
      ? initialRule.customerTypes
      : [initialRule?.customerType ?? "ALL"],
    brandId: initialRule?.brandId ?? "",
    mode: initialRule?.mode ?? "COST_PLUS_FLAT",
    value: initialRule ? String(initialRule.value) : "",
    discountPercent: initialRule?.discountPercent != null ? String(initialRule.discountPercent) : "",
    isActive: initialRule?.isActive ?? true,
  }));
  const [errors, setErrors] = useState<PricingFormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandError, setBrandError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const categoriesQuery = useCategories();
  const brandsQuery = useBrands();
  const createBrand = useCreateBrand();
  const rulesQuery = useCustomerCategoryPricingRules();
  const unitsQuery = usePricingUnitOptions(form.categoryId);
  const method = getPricingMethod(form.mode);
  const isUnitFormula = form.mode === "UNIT_COST_PLUS_PERCENT_DISCOUNT";
  const isFormula = form.mode.startsWith("COST_PLUS") || isUnitFormula;
  const selectedUnits = normalizePricingUnits(form.units, form.unit);
  const scopeQuery = usePricingScopeOptions(
    form.categoryId,
    selectedUnits.length === 1 ? selectedUnits[0] : selectedUnits.length ? selectedUnits : null,
    form.brandId || null,
    { enabled: Boolean(form.categoryId) },
  );
  const categories = categoriesQuery.data ?? [];
  const brands = brandsQuery.data ?? [];
  const units = Array.from(
    new Set([
      ...(unitsQuery.data ?? []),
      ...(rulesQuery.data ?? [])
        .filter((rule) => rule.categoryId === form.categoryId)
        .flatMap((rule) => normalizePricingUnits(rule.units, rule.unit)),
      ...selectedUnits,
    ]),
  );
  const products = scopeQuery.data?.products ?? [];

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog =
      formRef.current?.closest('[role="dialog"]') ?? formRef.current;
    formRef.current?.querySelector<HTMLElement>("select")?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      previous?.focus();
    };
  }, []);

  const change = <K extends keyof PricingFormState>(
    key: K,
    value: PricingFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSaveError(null);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving || createBrand.isPending) return;
    const nextErrors = validatePricingForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const field = Object.keys(nextErrors)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
      return;
    }
    try {
      setSaveError(null);
      await onSave({
        categoryId: form.categoryId,
        customerTypes: [...form.customerTypes],
        unit: selectedUnits.length === 1 ? selectedUnits[0] : null,
        units: selectedUnits,
        brandId: form.brandId || null,
        mode: form.mode,
        value: Number(form.value),
        ...(isUnitFormula ? { discountPercent: Number(form.discountPercent) } : {}),
        isActive: form.isActive,
      });
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Aturan belum tersimpan. Silakan coba lagi.",
      );
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>("[data-save-error]")
          ?.focus(),
      );
    }
  };
  const addBrand = async () => {
    if (!brandName.trim()) {
      setBrandError("Isi nama merek terlebih dahulu.");
      return;
    }
    try {
      setBrandError(null);
      const brand = await createBrand.mutateAsync({ name: brandName.trim() });
      change("brandId", brand.id);
      setBrandName("");
    } catch (error) {
      setBrandError(
        error instanceof Error
          ? error.message
          : "Merek belum berhasil ditambahkan.",
      );
    }
  };
  const inlineError = (field: keyof PricingFormErrors) =>
    errors[field] ? (
      <p
        id={`pricing-${field}-error`}
        className="mt-1 text-sm text-red-700"
        role="alert"
      >
        {errors[field]}
      </p>
    ) : null;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-6">
      {saveError && (
        <p
          role="alert"
          tabIndex={-1}
          data-save-error
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {saveError}
        </p>
      )}
      <fieldset disabled={isSaving} className="space-y-3">
        <legend className="mb-2 text-sm font-bold text-slate-900">
          Produk yang mendapat harga khusus
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="pricing-category"
              className="text-sm font-semibold text-slate-700"
            >
              Kategori <span className="text-red-600">*</span>
            </label>
            <select
              id="pricing-category"
              name="categoryId"
              value={form.categoryId}
              aria-invalid={Boolean(errors.categoryId)}
              aria-describedby={
                errors.categoryId ? "pricing-categoryId-error" : undefined
              }
              className={controlClass}
              onChange={(event) => {
                change("categoryId", event.target.value);
                change("unit", "");
                change("units", []);
              }}
            >
              <option value="">Pilih kategori</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {inlineError("categoryId")}
            {categoriesQuery.isError && (
              <p role="alert" className="mt-1 text-sm text-red-700">
                Kategori belum dapat dimuat.{" "}
                <button
                  type="button"
                  onClick={() => void categoriesQuery.refetch()}
                  className="underline"
                >
                  Coba lagi
                </button>
              </p>
            )}
          </div>
          <div>
            <fieldset id="pricing-unit" disabled={!form.categoryId} aria-busy={Boolean(form.categoryId && unitsQuery.isPending)} aria-describedby="pricing-unit-help">
              <legend className="text-sm font-semibold text-slate-700">Satuan</legend>
              <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700">
                  <input type="checkbox" checked={selectedUnits.length === 0} onChange={() => change("units", [])} className="h-4 w-4 accent-brand-600" />
                  Semua satuan
                </label>
                {units.map((unit) => (
                  <label key={unit} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700">
                    <input type="checkbox" name="units" value={unit} checked={selectedUnits.includes(unit)}
                      onChange={(event) => change("units", event.target.checked ? [...selectedUnits, unit] : selectedUnits.filter((selected) => selected !== unit))}
                      className="h-4 w-4 accent-brand-600" />
                    {unit}
                  </label>
                ))}
              </div>
            </fieldset>
            {inlineError("unit")}
            {form.categoryId && unitsQuery.isPending && (
              <p role="status" className="mt-1 text-xs text-slate-600">Memuat satuan…</p>
            )}
            {form.categoryId && unitsQuery.isError && (
              <p role="alert" className="mt-1 text-xs text-red-700">
                Satuan belum berhasil dimuat.{" "}
                <button type="button" className="underline" onClick={() => void unitsQuery.refetch()}>
                  Coba muat satuan
                </button>
              </p>
            )}
            {form.categoryId && !unitsQuery.isPending && !unitsQuery.isError && !units.length && (
              <p role="status" className="mt-1 text-xs text-slate-600">
                Belum ada satuan yang tersedia untuk kategori ini.
              </p>
            )}
            <p id="pricing-unit-help" className="mt-1 text-xs text-slate-500">
              {selectedUnits.length
                ? "Aturan berlaku pada satuan yang dipilih."
                : "Aturan berlaku pada semua satuan dalam kategori ini, termasuk satuan yang ditambahkan nanti."}
            </p>
          </div>
        </div>
      </fieldset>
      <fieldset
        disabled={isSaving}
        aria-describedby={
          errors.customerTypes
            ? "pricing-customerTypes-error"
            : "pricing-customer-help"
        }
      >
        <legend className="text-sm font-bold text-slate-900">
          Harga untuk pelanggan <span className="text-red-600">*</span>
        </legend>
        <p id="pricing-customer-help" className="mt-1 text-xs text-slate-500">
          Boleh pilih lebih dari satu tipe, misalnya Umum dan Agen.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRICING_CUSTOMER_TYPES.map((type) => (
            <label
              key={type}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${form.customerTypes.includes(type) ? "border-brand-300 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-700"}`}
            >
              <input
                type="checkbox"
                name="customerTypes"
                value={type}
                checked={form.customerTypes.includes(type)}
                onChange={() =>
                  change(
                    "customerTypes",
                    toggleCustomerTarget(form.customerTypes, type),
                  )
                }
                className="h-4 w-4 accent-brand-600"
              />
              {CUSTOMER_TARGET_LABELS[type]}
            </label>
          ))}
        </div>
        {inlineError("customerTypes")}
      </fieldset>
      <fieldset disabled={isSaving}>
        <legend className="text-sm font-bold text-slate-900">
          Cara menghitung harga
        </legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PRICING_METHODS.map((option) => (
            <label
              key={option.mode}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 ${form.mode === option.mode ? "border-brand-300 bg-brand-50" : "border-slate-200"}`}
            >
              <input
                type="radio"
                name="mode"
                value={option.mode}
                checked={form.mode === option.mode}
                onChange={() => change("mode", option.mode)}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs text-slate-600">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4">
          <label
            htmlFor="pricing-value"
            className="text-sm font-semibold text-slate-700"
          >
            {method.valueLabel} <span className="text-red-600">*</span>
          </label>
          <input
            id="pricing-value"
            name="value"
            type="number"
            inputMode="decimal"
            min={isFormula ? 0 : 0.01}
            max={form.mode === "PERCENT_DISCOUNT" ? 100 : undefined}
            step="0.01"
            value={form.value}
            className={controlClass}
            aria-invalid={Boolean(errors.value)}
            aria-describedby={
              errors.value ? "pricing-value-error" : "pricing-value-help"
            }
            onChange={(event) => change("value", event.target.value)}
          />
          {inlineError("value")}
          {isUnitFormula && <div className="mt-4">
            <label htmlFor="pricing-discountPercent" className="text-sm font-semibold text-slate-700">Potongan setelah tambahan (%) <span className="text-red-600">*</span></label>
            <input id="pricing-discountPercent" name="discountPercent" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.discountPercent ?? ""} className={controlClass} aria-invalid={Boolean(errors.discountPercent)} aria-describedby={errors.discountPercent ? "pricing-discountPercent-error" : "pricing-value-help"} onChange={(event) => change("discountPercent", event.target.value)} />
            {inlineError("discountPercent")}
          </div>}
          <p id="pricing-value-help" className="mt-1 text-xs text-slate-500">
            {isUnitFormula
              ? "HPP masing-masing satuan × (1 + tambahan/100) × (1 − potongan/100). Contoh: Rp12.000 +10% lalu −5% = Rp12.540. Untuk tambahan saja, isi potongan 0%."
              : isFormula
              ? "HPP memakai satuan terkecil, tanpa dikalikan isi satuan. Contoh: Rp700/pcs + Rp4.000 = Rp4.700/rim. Untuk mengikuti HPP tiap kemasan, pilih HPP masing-masing satuan + persen − persen."
              : "Diskon dihitung dari harga normal produk."}
          </p>
          {isFormula && <p className="mt-1 text-xs text-slate-600">Persentase tambahan dihitung dari HPP; tambahan 35% menghasilkan margin 25,93% jika potongan 0%, sebelum pembulatan harga jual.</p>}
        </div>
      </fieldset>
      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Pengaturan tambahan
        </summary>
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="pricing-brand"
              className="text-sm font-semibold text-slate-700"
            >
              Merek (opsional)
            </label>
            <select
              id="pricing-brand"
              name="brandId"
              value={form.brandId}
              disabled={isSaving}
              className={controlClass}
              onChange={(event) => change("brandId", event.target.value)}
            >
              <option value="">Semua merek</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            {brandsQuery.isError && (
              <p role="alert" className="mt-1 text-sm text-red-700">
                Merek belum dapat dimuat.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => void brandsQuery.refetch()}
                >
                  Coba lagi
                </button>
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="pricing-new-brand"
              className="text-sm font-semibold text-slate-700"
            >
              Tambah merek baru
            </label>
            <div className="flex gap-2">
              <input
                id="pricing-new-brand"
                name="newBrandName"
                value={brandName}
                disabled={isSaving || createBrand.isPending}
                className={controlClass}
                aria-describedby={
                  brandError ? "pricing-brand-error" : undefined
                }
                onChange={(event) => {
                  setBrandName(event.target.value);
                  setBrandError(null);
                }}
              />
              <button
                type="button"
                disabled={isSaving || createBrand.isPending}
                onClick={() => void addBrand()}
                className={`${buttonClass} mt-1 shrink-0`}
              >
                {createBrand.isPending ? "Menambah…" : "Tambah merek"}
              </button>
            </div>
            {brandError && (
              <p
                id="pricing-brand-error"
                role="alert"
                className="mt-1 text-sm text-red-700"
              >
                {brandError}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isActive"
              checked={form.isActive}
              disabled={isSaving}
              onChange={(event) => change("isActive", event.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            Aturan aktif
          </label>
        </div>
      </details>
      <section
        aria-live="polite"
        aria-label="Pratinjau harga"
        className="rounded-xl bg-slate-50 p-4"
      >
        <h3 className="text-sm font-bold text-slate-900">Pratinjau harga</h3>
        <p className="mt-1 text-xs text-slate-600">Contoh hasil aturan ini. HPP, laba, dan margin mengikuti satuan jual masing-masing. Aturan yang lebih spesifik dapat diprioritaskan saat transaksi.</p>
        {!form.categoryId ? (
          <p className="mt-2 text-sm text-slate-600">
            Pilih kategori untuk melihat contoh harga.
          </p>
        ) : scopeQuery.isPending || scopeQuery.isFetching ? (
          <p className="mt-2 text-sm text-slate-600">Memuat contoh produk…</p>
        ) : scopeQuery.isError ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            Contoh produk belum dapat dimuat.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void scopeQuery.refetch()}
            >
              Coba lagi
            </button>
          </p>
        ) : !products.length ? (
          <p className="mt-2 text-sm text-slate-600">
            Belum ada produk untuk kategori, satuan, dan merek ini.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200">
            {products.slice(0, 3).map((product) => {
              const preview = previewPricingForm(form, product);
              const invalid = Object.keys(validatePricingForm(form)).length > 0;
              let priceRounding: PriceRoundingResult | null = null;
              if (!preview.missingBaseCost && !invalid) {
                try { priceRounding = roundSellingPrice(preview.price, roundingSettings); } catch { /* Hide incomplete or out-of-range previews. */ }
              }
              const showResult = priceRounding !== null;
              const effectivePrice = priceRounding?.roundedPrice ?? preview.price;
              const margin = calculateCustomPriceMargin({
                costPrice: product.costPrice != null && Number.isFinite(product.costPrice) && product.costPrice >= 0 ? product.costPrice : null,
                catalogPrice: product.price,
                customPrice: effectivePrice,
              });
              return (
                <li key={product.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-slate-900">
                      {product.name}
                    </span>
                    {showResult && (
                      <span className={`font-bold ${margin.isBelowCost ? "text-red-700" : "text-emerald-800"}`}>
                        <span className="sr-only">Harga aturan </span>
                        {formatRupiah(effectivePrice)}/{product.unit}
                      </span>
                    )}
                  </div>
                  {showResult && <PriceRoundingBadge rounding={priceRounding} />}
                  <p className="mt-1 text-xs text-slate-600">
                    {preview.missingBaseCost
                      ? isUnitFormula ? "Modal unit dipilih belum tersedia. Harga normal atau member akan digunakan." : "Modal unit terkecil belum tersedia. Harga normal atau member akan digunakan."
                      : invalid
                        ? "Lengkapi aturan untuk melihat hasil perhitungan."
                        : isUnitFormula
                          ? `Modal ${formatRupiah(product.costPrice ?? 0)}/${product.unit}`
                          : isFormula
                          ? `Modal ${formatRupiah(product.baseCostPrice ?? 0)}/${product.baseCostUnit}`
                          : `Harga asal ${formatRupiah(product.price)}/${product.unit}`}
                  </p>
                  {showResult && (margin.hasCostPrice ? (
                    <>
                      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div>
                          <dt className="text-xs text-slate-600">HPP satuan ({product.unit})</dt>
                          <dd className="font-medium tabular-nums text-slate-900">{formatRupiah(product.costPrice!)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-600">Laba</dt>
                          <dd className={`font-semibold tabular-nums ${margin.isBelowCost ? "text-red-700" : "text-emerald-800"}`}>{formatRupiah(margin.customProfit!)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-600">Margin</dt>
                          <dd className={`font-semibold tabular-nums ${margin.isBelowCost ? "text-red-700" : "text-emerald-800"}`}>{effectivePrice > 0 ? `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(margin.customMarginPercent!)}%` : "—"}</dd>
                        </div>
                      </dl>
                      {margin.isBelowCost && <p className="mt-2 text-xs font-semibold text-red-700">Harga di bawah HPP satuan. Periksa sumber HPP dan rumus sebelum menyimpan.</p>}
                    </>
                  ) : <p className="mt-2 text-xs text-slate-600">HPP satuan belum tersedia; laba dan margin belum dapat dihitung.</p>)}
                </li>
              );
            })}
          </ul>
        )}
        {!form.isActive && (
          <p className="mt-2 text-xs text-slate-600">
            Ini hanya pratinjau. Aturan nonaktif belum diterapkan ke harga
            produk.
          </p>
        )}
      </section>
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving || createBrand.isPending}
          className={buttonClass}
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={isSaving || createBrand.isPending}
          className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50"
        >
          {isSaving ? "Menyimpan…" : "Simpan aturan"}
        </button>
      </div>
    </form>
  );
}

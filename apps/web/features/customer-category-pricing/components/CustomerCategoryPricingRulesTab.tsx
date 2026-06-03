"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Percent, Save, Tag, Trash2 } from "lucide-react";
import { useCategories, useProductsPage } from "@/hooks/useProducts";
import {
  useCreateCustomerCategoryPricingRule,
  useCustomerCategoryPricingRules,
  useDeleteCustomerCategoryPricingRule,
  useUpdateCustomerCategoryPricingRule,
  type CustomerCategoryPricingRule,
} from "@/hooks/useCustomerCategoryPricingRules";
import {
  countProductsAtOrBelowFlatDiscount,
  type CategoryCustomerPricingMode,
  type CustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";
import { formatRupiah } from "@/lib/utils";

const CUSTOMER_TYPE_OPTIONS: CustomerType[] = [
  "UMUM",
  "AGEN",
  "INDUSTRI",
  "PEMERINTAH",
];

type FormState = {
  id: string | null;
  customerType: CustomerType;
  categoryId: string;
  mode: CategoryCustomerPricingMode;
  value: number;
  isActive: boolean;
};

const emptyForm: FormState = {
  id: null,
  customerType: "AGEN",
  categoryId: "",
  mode: "PERCENT_DISCOUNT",
  value: 10,
  isActive: true,
};

function ruleValueLabel(rule: CustomerCategoryPricingRule) {
  if (rule.mode === "FLAT_DISCOUNT") return `-${formatRupiah(rule.value)}`;
  return `${rule.value}%`;
}

export function CustomerCategoryPricingRulesTab() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const { data: categories = [] } = useCategories();
  const rulesQuery = useCustomerCategoryPricingRules();
  const createRule = useCreateCustomerCategoryPricingRule();
  const updateRule = useUpdateCustomerCategoryPricingRule();
  const deleteRule = useDeleteCustomerCategoryPricingRule();
  const categoryProductsQuery = useProductsPage("", form.categoryId, {
    page: 1,
    limit: 200,
  });
  const categoryProducts = categoryProductsQuery.data?.data ?? [];
  const selectedCategory = categories.find((category) => category.id === form.categoryId);
  const zeroedProductCount = useMemo(() => {
    if (form.mode !== "FLAT_DISCOUNT" || form.value <= 0) return 0;
    return countProductsAtOrBelowFlatDiscount(categoryProducts, form.value);
  }, [categoryProducts, form.mode, form.value]);
  const rules = rulesQuery.data ?? [];
  const isSaving = createRule.isPending || updateRule.isPending;

  useEffect(() => {
    if (!form.categoryId && categories.length > 0) {
      setForm((current) => ({ ...current, categoryId: categories[0].id }));
    }
  }, [categories, form.categoryId]);

  const resetForm = () => {
    setForm({
      ...emptyForm,
      categoryId: categories[0]?.id ?? "",
    });
    setError(null);
  };

  const editRule = (rule: CustomerCategoryPricingRule) => {
    setForm({
      id: rule.id,
      customerType: rule.customerType,
      categoryId: rule.categoryId,
      mode: rule.mode,
      value: Number(rule.value),
      isActive: rule.isActive,
    });
    setError(null);
  };

  const saveRule = async () => {
    setError(null);
    if (!form.categoryId) {
      setError("Kategori wajib dipilih");
      return;
    }
    if (form.mode === "FLAT_DISCOUNT" && form.value <= 0) {
      setError("Diskon tetap harus lebih dari 0");
      return;
    }
    if (form.mode === "PERCENT_DISCOUNT" && (form.value <= 0 || form.value > 100)) {
      setError("Diskon harus lebih dari 0 dan maksimal 100%");
      return;
    }

    try {
      if (form.id) {
        await updateRule.mutateAsync({
          id: form.id,
          customerType: form.customerType,
          categoryId: form.categoryId,
          mode: form.mode,
          value: form.value,
          isActive: form.isActive,
        });
      } else {
        await createRule.mutateAsync({
          customerType: form.customerType,
          categoryId: form.categoryId,
          mode: form.mode,
          value: form.value,
          isActive: form.isActive,
        });
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan aturan");
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0">
        <div className="mb-4 flex items-center gap-2">
          <Tag className="h-5 w-5 text-slate-500" />
          <h2 className="text-base font-black text-slate-900">Harga Khusus</h2>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Nilai</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map((rule) => (
                <tr key={rule.id} className={!rule.isActive ? "opacity-50" : ""}>
                  <td className="px-4 py-3 font-bold text-slate-900">{rule.customerType}</td>
                  <td className="px-4 py-3 text-slate-700">{rule.category.name}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {rule.mode === "FLAT_DISCOUNT" ? "Diskon Rp" : "Diskon %"}
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900">{ruleValueLabel(rule)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-bold ${rule.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {rule.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => editRule(rule)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      {rule.isActive && (
                        <button
                          type="button"
                          onClick={() => deleteRule.mutateAsync(rule.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                          aria-label="Nonaktifkan aturan"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-medium text-slate-500" colSpan={6}>
                    Belum ada aturan harga khusus.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-black text-slate-900">
          {form.id ? "Edit Aturan" : "Aturan Baru"}
        </h3>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">Tipe pelanggan</span>
            <select
              value={form.customerType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  customerType: event.target.value as CustomerType,
                }))
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900"
            >
              {CUSTOMER_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">Kategori</span>
            <select
              value={form.categoryId}
              onChange={(event) =>
                setForm((current) => ({ ...current, categoryId: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1 block text-xs font-bold text-slate-500">Mode</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, mode: "PERCENT_DISCOUNT" }))}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold ${form.mode === "PERCENT_DISCOUNT" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"}`}
              >
                <Percent className="h-4 w-4" />
                Diskon
              </button>
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, mode: "FLAT_DISCOUNT" }))}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold ${form.mode === "FLAT_DISCOUNT" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"}`}
              >
                <Tag className="h-4 w-4" />
                Diskon Rp
              </button>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              {form.mode === "FLAT_DISCOUNT" ? "Diskon tetap (Rp)" : "Diskon (%)"}
            </span>
            <input
              type="number"
              min={form.mode === "FLAT_DISCOUNT" ? 1 : 0.01}
              max={form.mode === "PERCENT_DISCOUNT" ? 100 : undefined}
              step={form.mode === "FLAT_DISCOUNT" ? 1 : 0.5}
              value={form.value || ""}
              onChange={(event) =>
                setForm((current) => ({ ...current, value: Number(event.target.value) || 0 }))
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900"
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
            <span className="text-sm font-bold text-slate-700">Aktif</span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((current) => ({ ...current, isActive: event.target.checked }))
              }
              className="h-4 w-4"
            />
          </label>

          {zeroedProductCount > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Diskon tetap ini sama atau lebih besar dari harga {zeroedProductCount} produk di kategori{" "}
                  {selectedCategory?.name ?? "terpilih"}. Harga produk tersebut akan menjadi Rp 0 untuk pelanggan tipe{" "}
                  {form.customerType}.
                </span>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveRule}
              disabled={isSaving}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Menyimpan..." : "Simpan"}
            </button>
            {form.id && (
              <button
                type="button"
                onClick={resetForm}
                className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600"
              >
                Batal
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

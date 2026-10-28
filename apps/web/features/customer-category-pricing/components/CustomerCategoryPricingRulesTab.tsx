"use client";
import React, { useState } from "react";
import { Modal } from "@pos/ui";
import { Plus, RefreshCcw, Tag } from "lucide-react";
import {
  useCreateCustomerCategoryPricingRule,
  useCustomerCategoryPricingRules,
  useDeleteCustomerCategoryPricingRule,
  useUpdateCustomerCategoryPricingRule,
  type CustomerCategoryPricingRule,
  type CustomerCategoryPricingRuleInput,
} from "@/hooks/useCustomerCategoryPricingRules";
import {
  CUSTOMER_TARGET_LABELS,
  pricingFormRuleLabel,
} from "../helpers/pricing-form";
import type { PriceRoundingSettings } from "@/features/product-price-rounding/rounding";
import { PricingRuleForm } from "./PricingRuleForm";

export function CustomerCategoryPricingRulesTab({ roundingSettings }: { roundingSettings?: PriceRoundingSettings } = {}) {
  const [editor, setEditor] = useState<{
    rule: CustomerCategoryPricingRule | null;
  } | null>(null);
  const [removing, setRemoving] = useState<CustomerCategoryPricingRule | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rulesQuery = useCustomerCategoryPricingRules();
  const createRule = useCreateCustomerCategoryPricingRule();
  const updateRule = useUpdateCustomerCategoryPricingRule();
  const deleteRule = useDeleteCustomerCategoryPricingRule();
  const isSaving = createRule.isPending || updateRule.isPending;
  const rules = rulesQuery.data ?? [];
  const save = async (input: CustomerCategoryPricingRuleInput) => {
    if (editor?.rule)
      await updateRule.mutateAsync({ id: editor.rule.id, ...input });
    else await createRule.mutateAsync(input);
    setEditor(null);
    setNotice("Aturan harga berhasil disimpan");
  };
  const remove = async () => {
    if (!removing || deleteRule.isPending) return;
    try {
      setError(null);
      await deleteRule.mutateAsync(removing.id);
      setRemoving(null);
      setNotice("Aturan harga berhasil dinonaktifkan");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Aturan belum berhasil dinonaktifkan. Silakan coba lagi.",
      );
    }
  };
  return (
    <section className="space-y-4" aria-label="Harga Khusus">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Tag aria-hidden="true" className="h-5 w-5 text-slate-500" />
            Harga Khusus
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Atur harga otomatis per kategori, satuan, dan tipe pelanggan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditor({ rule: null });
            setNotice(null);
          }}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Tambah aturan
        </button>
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {error && !removing && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {rulesQuery.isPending ? (
        <p role="status" className="py-8 text-center text-sm text-slate-500">
          Memuat aturan harga…
        </p>
      ) : rulesQuery.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Aturan harga belum dapat dimuat.{" "}
          <button
            type="button"
            onClick={() => void rulesQuery.refetch()}
            className="ml-2 inline-flex items-center gap-1 font-semibold underline"
          >
            <RefreshCcw aria-hidden="true" className="h-4 w-4" />
            Coba lagi
          </button>
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
          <p className="font-semibold text-slate-800">
            Belum ada aturan harga khusus
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Mulai dari kategori dan satuan yang paling sering dijual.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {rules.map((rule) => {
            const targets = rule.customerTypes?.length
              ? rule.customerTypes
              : [rule.customerType];
            return (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {rule.category.name} · {rule.unit || "Semua satuan"}
                    </h3>
                    {!rule.isActive && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Nonaktif
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {targets
                      .map((target) => CUSTOMER_TARGET_LABELS[target])
                      .join(", ")}
                    {rule.brand?.name ? ` · ${rule.brand.name}` : ""}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {pricingFormRuleLabel(rule.mode, rule.value, rule.discountPercent)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Ubah aturan ${rule.category.name} ${rule.unit || "semua satuan"}`}
                    onClick={() => {
                      setEditor({ rule });
                      setNotice(null);
                    }}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    Ubah
                  </button>
                  {rule.isActive && <button
                    type="button"
                    aria-label={`Nonaktifkan aturan ${rule.category.name} ${rule.unit || "semua satuan"}`}
                    disabled={deleteRule.isPending}
                    onClick={() => {
                      setRemoving(rule);
                      setError(null);
                    }}
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
                  >
                    Nonaktifkan
                  </button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        open={Boolean(editor)}
        onClose={() => {
          if (!isSaving) setEditor(null);
        }}
        title={editor?.rule ? "Ubah aturan harga" : "Tambah aturan harga"}
        size="2xl"
      >
        {editor && (
          <PricingRuleForm
            roundingSettings={roundingSettings}
            key={editor.rule?.id ?? "new"}
            initialRule={editor.rule}
            onSave={save}
            onClose={() => setEditor(null)}
            isSaving={isSaving}
          />
        )}
      </Modal>
      <Modal
        open={Boolean(removing)}
        onClose={() => {
          if (!deleteRule.isPending) setRemoving(null);
        }}
        title="Nonaktifkan aturan harga?"
        size="sm"
      >
        <p className="text-sm text-slate-600">
          Aturan tetap tersimpan dan dapat diaktifkan kembali lewat Ubah.
          Harga produk akan mengikuti aturan lain, harga member, atau harga
          normal.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={deleteRule.isPending}
            onClick={() => setRemoving(null)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={deleteRule.isPending}
            onClick={() => void remove()}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {deleteRule.isPending ? "Menonaktifkan…" : "Nonaktifkan aturan"}
          </button>
        </div>
      </Modal>
    </section>
  );
}

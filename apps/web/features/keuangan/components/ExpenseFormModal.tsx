"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, Button } from "@pos/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategoryKey,
} from "@/features/keuangan/helpers/keuangan-core";
import { CATEGORY_LABELS_ID, customExpenseCategoryId, customExpenseCategoryKey, expenseCategoryColor, type CustomExpenseCategory } from "@/features/keuangan/helpers/category-meta";
import { useCustomExpenseCategories } from "@/features/keuangan/hooks/useKeuangan";
import { formatRupiah } from "@/lib/utils";
import { ProofImageUploader, deleteUploadedProof } from "@/features/proof-upload/components/ProofImageUploader";



function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function jakartaIsoToInputDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function fiveYearsAgoJakarta(): string {
  const today = jakartaToday();
  const [y, m, d] = today.split("-").map(Number);
  return `${y - 5}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseRupiah(input: string): number {
  const cleaned = input.replace(/[^0-9]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function formatThousands(n: number): string {
  return n.toLocaleString("id-ID");
}

export type ExpenseFormInitial = {
  id?: string;
  applicantName: string;
  category: ExpenseCategoryKey;
  description: string | null;
  amount: number;
  changeAmount: number;
  occurredAt: string; // ISO
  transactionId: string | null;
  attachmentUrl: string | null;
};

const EMPTY_INITIAL: ExpenseFormInitial = {
  applicantName: "",
  category: "SUPPLIES",
  description: null,
  amount: 0,
  changeAmount: 0,
  occurredAt: "",
  transactionId: null,
  attachmentUrl: null,
};

export function ExpenseFormModal({
  open,
  onClose,
  onSaved,
  initial,
  mode,
  canCreateCategory = true,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: ExpenseFormInitial;
  mode: "create" | "edit";
  canCreateCategory?: boolean;
}) {
  const queryClient = useQueryClient();
  const categoryQuery = useCustomExpenseCategories();
  const customCategories = categoryQuery.data?.data ?? [];
  const today = useMemo(() => jakartaToday(), []);
  const minDate = useMemo(() => fiveYearsAgoJakarta(), []);
  const [form, setForm] = useState<ExpenseFormInitial & { occurredAtInput: string }>({
    ...EMPTY_INITIAL,
    occurredAtInput: today,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        ...initial,
        occurredAtInput: jakartaIsoToInputDate(initial.occurredAt),
      });
    } else {
      setForm({ ...EMPTY_INITIAL, occurredAtInput: today });
    }
    setError(null);
    setFieldErrors({});
    setAddingCategory(false);
    setCategoryName("");
    setCategoryError(null);
  }, [open, initial, today]);

  const netExpense = Math.max(0, form.amount - form.changeAmount);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const createCategory = async () => {
    if (creatingCategory) return;
    if (!categoryName.trim()) { setCategoryError("Isi nama kategori terlebih dahulu."); return; }
    setCreatingCategory(true);
    setCategoryError(null);
    try {
      const response = await fetch("/api/finance/expense-categories", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: categoryName }),
      });
      const body = await response.json().catch(() => null) as { data?: CustomExpenseCategory; message?: string } | null;
      if (!response.ok || !body?.data) throw new Error(body?.message || "Kategori belum dapat disimpan.");
      const created = body.data;
      queryClient.setQueryData<{ data: CustomExpenseCategory[] }>(["finance", "expense-categories"], (current) => ({
        data: [...(current?.data ?? []).filter((item) => item.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name, "id")),
      }));
      update("category", customExpenseCategoryKey(created.id));
      setCategoryName("");
      setAddingCategory(false);
      void queryClient.invalidateQueries({ queryKey: ["finance", "expense-categories"] });
    } catch (cause) {
      setCategoryError(cause instanceof Error ? cause.message : "Kategori belum dapat disimpan.");
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleSubmit = async () => {
    if (submitting || creatingCategory) return;
    if (addingCategory && categoryName.trim()) {
      setCategoryError("Simpan kategori baru terlebih dahulu atau tutup isian kategori.");
      return;
    }
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const payload = {
        applicantName: form.applicantName,
        category: customExpenseCategoryId(form.category) ? "OTHER" : form.category,
        customCategoryId: customExpenseCategoryId(form.category),
        description: form.description || undefined,
        amount: form.amount,
        changeAmount: form.changeAmount,
        occurredAt: form.occurredAtInput,
        transactionId: form.transactionId || undefined,
        attachmentUrl: form.attachmentUrl || undefined,
      };
      const url =
        mode === "edit" && initial?.id
          ? `/api/finance/expenses/${initial.id}`
          : "/api/finance/expenses";
      const method = mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.errors && typeof body.errors === "object") {
          const map: Record<string, string> = {};
          for (const [field, messages] of Object.entries(body.errors)) {
            const arr = messages as string[];
            if (arr.length > 0) map[field] = arr[0];
          }
          setFieldErrors(map);
        }
        throw new Error(body.message || "Gagal menyimpan");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!submitting && !creatingCategory) onClose(); }}
      size="lg"
      title={mode === "edit" ? "Ubah Pengeluaran" : "Tambah Pengeluaran"}
    >
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
        <FormField
          id="expense-applicant"
          label="Nama Pemohon"
          required
          error={fieldErrors.applicantName}
        >
          <input
            id="expense-applicant"
            type="text"
            required
            aria-invalid={!!fieldErrors.applicantName}
            aria-describedby={fieldErrors.applicantName ? "expense-applicant-error" : undefined}
            value={form.applicantName}
            onChange={(e) => update("applicantName", e.target.value)}
            maxLength={100}
            className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
            placeholder="Pak Budi"
          />
        </FormField>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-surface-700">Kategori <span className="text-red-500">*</span></legend>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-surface-500">Pilih kategori untuk mengelompokkan pengeluaran.</p>
            {canCreateCategory && <button type="button" aria-expanded={addingCategory} aria-controls="new-expense-category" onClick={() => { setAddingCategory((value) => !value); setCategoryError(null); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"><Plus className="h-4 w-4" aria-hidden="true" /> Tambah kategori</button>}
          </div>
          <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
            {[...EXPENSE_CATEGORIES.map((category) => ({ key: category as ExpenseCategoryKey, label: CATEGORY_LABELS_ID[category] })), ...customCategories.map((category) => ({ key: customExpenseCategoryKey(category.id), label: category.name }))].map(({ key, label }) => {
              const selected = form.category === key;
              return <label key={key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${selected ? "border-brand-600 bg-brand-50 text-brand-800" : "border-surface-200 bg-white text-surface-700 hover:bg-surface-50"}`}>
                <input className="sr-only peer" type="radio" name="expense-category" value={key} checked={selected} onChange={() => update("category", key)} />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-brand-600" style={{ backgroundColor: expenseCategoryColor(key) }} aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words">{label}</span>{selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </label>;
            })}
          </div>
          {categoryQuery.isError && <p role="alert" className="text-xs text-red-700">Kategori khusus belum dapat dimuat. <button type="button" className="underline" onClick={() => void categoryQuery.refetch()}>Coba lagi</button></p>}
          {addingCategory && <div id="new-expense-category" className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
            <label htmlFor="expense-category-name" className="block text-xs font-semibold text-surface-800">Nama kategori baru</label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input id="expense-category-name" autoFocus maxLength={50} value={categoryName} onChange={(event) => { setCategoryName(event.target.value); setCategoryError(null); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void createCategory(); } }} placeholder="Contoh: Kemasan" className="min-h-11 min-w-0 flex-1 rounded-lg border border-surface-300 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 sm:text-sm" aria-invalid={!!categoryError} aria-describedby={categoryError ? "expense-category-error" : undefined} />
              <Button type="button" size="sm" onClick={() => void createCategory()} loading={creatingCategory} disabled={creatingCategory}>Simpan kategori</Button>
            </div>
            <p className="mt-1.5 text-xs text-surface-600">Kategori tersimpan untuk digunakan kembali dan dipilih di filter.</p>
            {categoryError && <p id="expense-category-error" role="alert" className="mt-1 text-xs text-red-700">{categoryError}</p>}
          </div>}
          {fieldErrors.category && <p role="alert" className="text-xs text-red-600">{fieldErrors.category}</p>}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <FormField id="expense-amount" label="Jumlah" required error={fieldErrors.amount}>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-sm text-surface-500">
                Rp
              </span>
              <input
                id="expense-amount"
                type="text"
                required
                aria-invalid={!!fieldErrors.amount}
                aria-describedby={fieldErrors.amount ? "expense-amount-error" : undefined}
                inputMode="numeric"
                value={form.amount ? formatThousands(form.amount) : ""}
                onChange={(e) => update("amount", parseRupiah(e.target.value))}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm tabular-nums"
                placeholder="0"
              />
            </div>
          </FormField>
          <FormField id="expense-change" label="Kembalian" error={fieldErrors.changeAmount}>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-sm text-surface-500">
                Rp
              </span>
              <input
                id="expense-change"
                type="text"
                aria-invalid={!!fieldErrors.changeAmount}
                aria-describedby={fieldErrors.changeAmount ? "expense-change-error" : undefined}
                inputMode="numeric"
                value={form.changeAmount ? formatThousands(form.changeAmount) : ""}
                onChange={(e) => update("changeAmount", parseRupiah(e.target.value))}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm tabular-nums"
                placeholder="0"
              />
            </div>
          </FormField>
        </div>

        <div className="rounded-lg bg-brand-50 border border-brand-100 px-3 py-2.5">
          <p className="text-xs font-medium text-brand-700">Pengeluaran bersih</p>
          <p className="text-base font-bold text-brand-900 tabular-nums">
            {formatRupiah(netExpense)}
          </p>
        </div>

        <FormField id="expense-date" label="Tanggal" required error={fieldErrors.occurredAt}>
          <input
            id="expense-date"
            type="date"
            required
            aria-invalid={!!fieldErrors.occurredAt}
            aria-describedby={fieldErrors.occurredAt ? "expense-date-error" : undefined}
            value={form.occurredAtInput}
            min={minDate}
            max={today}
            onChange={(e) => update("occurredAtInput", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
          />
        </FormField>

        <FormField id="expense-description" label="Keterangan (opsional)" error={fieldErrors.description}>
          <textarea
            id="expense-description"
            aria-invalid={!!fieldErrors.description}
            aria-describedby={fieldErrors.description ? "expense-description-error" : undefined}
            value={form.description ?? ""}
            onChange={(e) => update("description", e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm resize-none"
            placeholder="Detail tambahan..."
          />
          <p className="text-[11px] text-surface-500 mt-1 text-right">
            {form.description?.length ?? 0}/500
          </p>
        </FormField>

        <ProofImageUploader
          context="expense"
          label="Lampiran pengeluaran (opsional)"
          value={form.attachmentUrl || ""}
          onChange={(url) => update("attachmentUrl", url || null)}
          disabled={submitting}
          onDelete={async (url) => {
            if (mode !== "edit" || !initial?.id || initial.attachmentUrl !== url) {
              return deleteUploadedProof(url);
            }
            const response = await fetch(`/api/finance/expenses/${initial.id}/attachment`, { method: "DELETE" });
            const body = await response.json().catch(() => null) as { message?: string } | null;
            if (!response.ok) throw new Error(body?.message || "Gagal menghapus foto bukti.");
          }}
        />

        {error && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting || creatingCategory}>
            Batal
          </Button>
          <Button
            type="submit"
            disabled={submitting || creatingCategory}
          >
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FormField({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-surface-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p id={`${id}-error`} className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

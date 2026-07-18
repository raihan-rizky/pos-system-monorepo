"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, Button } from "@pos/ui";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/features/keuangan/helpers/keuangan-core";
import { CATEGORY_COLORS, CATEGORY_LABELS_ID } from "@/features/keuangan/helpers/category-meta";
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
  category: ExpenseCategory;
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
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: ExpenseFormInitial;
  mode: "create" | "edit";
}) {
  const today = useMemo(() => jakartaToday(), []);
  const minDate = useMemo(() => fiveYearsAgoJakarta(), []);
  const [form, setForm] = useState<ExpenseFormInitial & { occurredAtInput: string }>({
    ...EMPTY_INITIAL,
    occurredAtInput: today,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
  }, [open, initial, today]);

  const netExpense = Math.max(0, form.amount - form.changeAmount);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const payload = {
        applicantName: form.applicantName,
        category: form.category,
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
      onClose={onClose}
      size="lg"
      title={mode === "edit" ? "Ubah Pengeluaran" : "Tambah Pengeluaran"}
    >
      <div className="space-y-4">
        <FormField
          label="Nama Pemohon"
          required
          error={fieldErrors.applicantName}
        >
          <input
            type="text"
            value={form.applicantName}
            onChange={(e) => update("applicantName", e.target.value)}
            maxLength={100}
            className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
            placeholder="Pak Budi"
          />
        </FormField>

        <FormField label="Kategori" required error={fieldErrors.category}>
          <div className="grid grid-cols-3 gap-2">
            {EXPENSE_CATEGORIES.map((cat) => {
              const isActive = form.category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => update("category", cat)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer
                    ${
                      isActive
                        ? "border-transparent shadow-sm text-white"
                        : "border-surface-200 bg-white text-surface-700 hover:bg-surface-50"
                    }
                  `}
                  style={isActive ? { backgroundColor: CATEGORY_COLORS[cat] } : undefined}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: isActive ? "#fff" : CATEGORY_COLORS[cat],
                    }}
                  />
                  {CATEGORY_LABELS_ID[cat]}
                </button>
              );
            })}
          </div>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Jumlah" required error={fieldErrors.amount}>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-sm text-surface-500">
                Rp
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={form.amount ? formatThousands(form.amount) : ""}
                onChange={(e) => update("amount", parseRupiah(e.target.value))}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm tabular-nums"
                placeholder="0"
              />
            </div>
          </FormField>
          <FormField label="Kembalian" error={fieldErrors.changeAmount}>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-sm text-surface-500">
                Rp
              </span>
              <input
                type="text"
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

        <FormField label="Tanggal" required error={fieldErrors.occurredAt}>
          <input
            type="date"
            value={form.occurredAtInput}
            min={minDate}
            max={today}
            onChange={(e) => update("occurredAtInput", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
          />
        </FormField>

        <FormField label="Keterangan (opsional)" error={fieldErrors.description}>
          <textarea
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
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-surface-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

"use client";

import React, { useState, useCallback } from "react";

import { ReceiptModal } from "@/components/ReceiptModal";
import {
  useTransactionHistory,
  useUpdateTransaction,
  useDeleteTransaction,
  useApproveTransaction,
  useRejectTransaction,
  Transaction,
} from "@/hooks/useTransactions";
import { ApproveDraftDialog } from "@/features/transactions-draft";
import { formatDraftNumberForDisplay } from "@/features/transactions-draft/helpers/draft-number";
import { useCategories } from "@/hooks/useProducts";
import { formatRupiah, formatDate } from "@/lib/utils";
import { Button } from "@pos/ui";
import { useRole } from "@/components/providers/RoleProvider";
import { shouldShowDeleteAction, shouldShowUpdateAction } from "@/features/rbac/helpers/rbac-ui";

import { getLogger } from "@/lib/logger";

const log = getLogger("page:main:history");
// ─── Edit Modal ──────────────────────────────────────────────────────────────

type EditForm = {
  salesName: string;
  salespersonId: string;
  customerName: string;
  paymentMethod: string;
  status: string;
};

const PAYMENT_METHODS = ["CASH", "TRANSFER", "QRIS", "DEBIT", "KREDIT"];
const STATUSES = [
  { value: "COMPLETED", label: "✅ Lunas", color: "text-emerald-700" },
  { value: "DP", label: "💰 DP", color: "text-amber-700" },
  { value: "PENDING_APPROVAL", label: "⏳ Pending", color: "text-blue-600" },
  { value: "VOIDED", label: "❌ Void", color: "text-surface-500" },
  { value: "REFUNDED", label: "↩️ Refund", color: "text-red-600" },
];

const STATUS_FILTERS = [
  { value: "", label: "Semua Status" },
  { value: "COMPLETED", label: "Lunas" },
  { value: "PENDING_APPROVAL", label: "Pending" },
  { value: "DP", label: "DP" },
  { value: "DRAFT", label: "Sementara" },
  { value: "VOIDED", label: "Void" },
  { value: "REFUNDED", label: "Refund" },
];

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  COMPLETED: ["DP", "VOIDED", "REFUNDED"],
  DP: ["COMPLETED", "VOIDED"],
  PENDING_APPROVAL: ["COMPLETED", "VOIDED"],
  VOIDED: [],
  REFUNDED: [],
};

function EditModal({
  tx,
  onClose,
}: {
  tx: Transaction;
  onClose: () => void;
}) {
  const updateTx = useUpdateTransaction();

  const [form, setForm] = useState<EditForm>({
    salesName: tx.salesName ?? "",
    salespersonId: tx.salespersonId ?? "",
    customerName: tx.customerName ?? "",
    paymentMethod: tx.paymentMethod ?? "CASH",
    status: tx.status ?? "COMPLETED",
  });

  const [salespersons, setSalespersons] = useState<{ id: string; name: string }[]>([]);

  const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[tx.status] ?? [];
  const allowedSet = new Set(allowedTransitions);

  React.useEffect(() => {
    fetch("/api/salespersons?activeOnly=true")
      .then((res) => res.json())
      .then((json) => setSalespersons(json.data ?? []))
      .catch((err) => log.error("Failed to fetch salespersons:", err));
  }, []);

  const [error, setError] = useState("");

  const handleChange = (field: keyof EditForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setError("");
    try {
      const payload: Parameters<typeof updateTx.mutateAsync>[0] = {
        id: tx.id,
        salesName: form.salesName,
        salespersonId: form.salespersonId,
        customerName: form.customerName,
        paymentMethod: form.paymentMethod,
      };
      // Only include status when it actually changed
      if (form.status !== tx.status) {
        payload.status = form.status;
      }
      await updateTx.mutateAsync(payload);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan");
    }
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Blur overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-surface-900">Ubah Transaksi</h2>
            <p className="text-xs text-surface-500 mt-0.5">{tx.invoiceNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-100 transition-colors text-surface-400 hover:text-surface-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Sales Person Selection */}
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              Sales
            </label>
            <select
              value={form.salespersonId}
              onChange={(e) => {
                const spId = e.target.value;
                const spName = salespersons.find(s => s.id === spId)?.name || "";
                setForm(prev => ({ ...prev, salespersonId: spId, salesName: spName }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm
                focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            >
              <option value="">-- Pilih Sales (Opsional) --</option>
              {salespersons.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Sales Name (Fallback) */}
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              Nama Sales (Custom)
            </label>
            <input
              type="text"
              value={form.salesName}
              onChange={(e) => handleChange("salesName", e.target.value)}
              placeholder="Nama sales / kasir"
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm
                focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
          </div>

          {/* Customer Name */}
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              Nama Pelanggan
            </label>
            <input
              type="text"
              value={form.customerName}
              onChange={(e) => handleChange("customerName", e.target.value)}
              placeholder="Nama pelanggan"
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm
                focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              Metode Pembayaran
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((pm) => (
                <button
                  key={pm}
                  onClick={() => handleChange("paymentMethod", pm)}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    form.paymentMethod === pm
                      ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                      : "bg-surface-50 text-surface-600 border-surface-200 hover:border-brand-400 hover:text-brand-600"
                  }`}
                >
                  {pm}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              Status Pembayaran
            </label>
            {allowedTransitions.length === 0 && (
              <p className="text-xs text-surface-400 italic mb-2">
                Status <strong>{tx.status}</strong> tidak dapat diubah
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map((s) => {
                const isAllowed = s.value === tx.status || allowedSet.has(s.value);
                return (
                  <button
                    key={s.value}
                    onClick={() => isAllowed && handleChange("status", s.value)}
                    disabled={!isAllowed}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      form.status === s.value
                        ? "bg-surface-900 text-white border-surface-900 shadow-sm"
                        : isAllowed
                          ? "bg-surface-50 text-surface-600 border-surface-200 hover:border-surface-400"
                          : "bg-surface-50 text-surface-300 border-surface-100 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-surface-600
              hover:bg-surface-50 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={updateTx.isPending}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold
              hover:bg-brand-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {updateTx.isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "DRAFT") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        SEMENTARA
      </span>
    );
  }
  if (status === "DP") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
        💰 DP
      </span>
    );
  }
  if (status === "PENDING_APPROVAL") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-300 animate-pending-badge">
        <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-600" />
        </span>
        Pending
      </span>
    );
  }
  if (status === "VOIDED") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-500 border border-red-200 line-through decoration-red-400">
        ❌ DIBATALKAN
      </span>
    );
  }
  if (status === "REFUNDED") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200">
        ↩️ Refund
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
      ✅ Lunas
    </span>
  );
}

// ─── Payment Method Badge ─────────────────────────────────────────────────────

function PaymentBadge({ method }: { method: string }) {
  const map: Record<string, { bg: string; text: string; icon: string }> = {
    CASH:     { bg: "bg-green-100",   text: "text-green-700",   icon: "💵" },
    TRANSFER: { bg: "bg-blue-100",    text: "text-blue-700",    icon: "🏦" },
    QRIS:     { bg: "bg-purple-100",  text: "text-purple-700",  icon: "📱" },
    DEBIT:    { bg: "bg-indigo-100",  text: "text-indigo-700",  icon: "💳" },
    KREDIT:   { bg: "bg-orange-100",  text: "text-orange-700",  icon: "💳" },
  };
  const style = map[method] ?? { bg: "bg-surface-100", text: "text-surface-600", icon: "💰" };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${style.bg} ${style.text} border-transparent`}>
      {style.icon} {method}
    </span>
  );
}

function appliedPricingCount(tx: Transaction) {
  return tx.items.filter((item) => item.pricingRuleId).length;
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  tx,
  onClose,
}: {
  tx: Transaction;
  onClose: () => void;
}) {
  const deleteTx = useDeleteTransaction();
  const [error, setError] = React.useState("");

  const handleDelete = async () => {
    setError("");
    try {
      await deleteTx.mutateAsync(tx.id);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menghapus transaksi");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Blur overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Red top accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-rose-600" />

        <div className="px-6 pt-6 pb-5 text-center">
          {/* Icon */}
          <div className="mx-auto mb-4 flex items-center justify-center w-14 h-14 rounded-full bg-red-100">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="text-red-600">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </div>

          <h2 className="text-lg font-bold text-surface-900 mb-1">Hapus Transaksi?</h2>
          <p className="text-sm text-surface-500 mb-1">
            Transaksi berikut akan dihapus permanen:
          </p>
          <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-bold bg-surface-100 text-surface-700 mb-4">
            {tx.invoiceNumber}
          </span>
          <p className="text-xs text-red-500 font-medium">
            ⚠️ Tindakan ini tidak dapat dibatalkan.
          </p>

          {error && (
            <p className="mt-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-left">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={deleteTx.isPending}
            className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-surface-600
              hover:bg-surface-50 transition-colors disabled:opacity-60"
          >
            Batal
          </button>
          <button
            id="confirm-delete-btn"
            onClick={handleDelete}
            disabled={deleteTx.isPending}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold
              hover:bg-red-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {deleteTx.isPending ? "Menghapus..." : "Ya, Hapus"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Approve Modal ────────────────────────────────────────────────────────────

function ApproveModal({
  tx,
  onClose,
  onSuccess,
}: {
  tx: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const approveTx = useApproveTransaction();
  const [error, setError] = useState("");
  const amountPaid = Number(tx.amountPaid);
  const total = Number(tx.total);
  const approvalStatus = amountPaid > 0 && amountPaid < total ? "DP" : "Lunas";

  const handleApprove = async () => {
    setError("");
    try {
      await approveTx.mutateAsync({ id: tx.id });
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
        <h2 className="text-lg font-bold text-surface-900">Setujui Permintaan</h2>
        <p className="text-sm text-surface-500">
          Cocokkan invoice cetak dari sales dengan transaksi pending ini.
        </p>

        <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 text-sm">
          <div className="flex justify-between gap-3 py-1">
            <span className="text-surface-500">Invoice</span>
            <span className="font-bold text-surface-900">{tx.invoiceNumber}</span>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-surface-500">Pelanggan</span>
            <span className="font-semibold text-surface-900">
              {tx.customerName || "Pelanggan Umum"}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-surface-500">Total</span>
            <span className="font-bold text-brand-700">{formatRupiah(total)}</span>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-surface-500">Metode</span>
            <span className="font-semibold text-surface-900">{tx.paymentMethod}</span>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-surface-500">Dibayar</span>
            <span className="font-bold text-surface-900">
              {formatRupiah(amountPaid)}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-surface-500">Status setelah setujui</span>
            <span className="font-bold text-surface-900">{approvalStatus}</span>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-surface-500">Item</span>
            <span className="font-semibold text-surface-900">
              {tx.items.length} barang
            </span>
          </div>
        </div>

        {error && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex items-center gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-surface-600 hover:bg-surface-50">Batal</button>
          <button onClick={handleApprove} disabled={approveTx.isPending} className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
            {approveTx.isPending ? "Proses..." : "Setujui"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Void Confirm Modal ───────────────────────────────────────────────────────

function VoidConfirmModal({
  tx,
  onClose,
  onSuccess,
}: {
  tx: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const updateTx = useUpdateTransaction();
  const [error, setError] = useState("");

  const handleVoid = async () => {
    setError("");
    try {
      await updateTx.mutateAsync({ id: tx.id, status: "VOIDED" });
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Gagal membatalkan transaksi");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-rose-600" />
        <div className="px-6 pt-6 pb-5 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center w-14 h-14 rounded-full bg-red-100">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-600">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>

          <h2 className="text-lg font-bold text-surface-900 mb-1">Batalkan Transaksi?</h2>
          <p className="text-sm text-surface-500 mb-1">
            Transaksi berikut akan dibatalkan (Void):
          </p>
          <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-bold bg-surface-100 text-surface-700 mb-4">
            {tx.invoiceNumber}
          </span>
          <p className="text-xs text-red-500 font-medium">
            ⚠️ Status akan berubah menjadi <strong>VOID</strong>. Transaksi ini tidak akan dihitung dalam pendapatan.
          </p>

          {error && (
            <p className="mt-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-left">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 pb-6 flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={updateTx.isPending}
            className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-surface-600
              hover:bg-surface-50 transition-colors disabled:opacity-60"
          >
            Batal
          </button>
          <button
            id="confirm-void-btn"
            onClick={handleVoid}
            disabled={updateTx.isPending}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold
              hover:bg-red-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {updateTx.isPending ? "Membatalkan..." : "Ya, Batalkan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────

function RejectModal({
  tx,
  onClose,
  onSuccess,
}: {
  tx: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const rejectTx = useRejectTransaction();
  const [error, setError] = useState("");

  const handleReject = async () => {
    setError("");
    try {
      await rejectTx.mutateAsync(tx.id);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-rose-600" />
        <div className="p-6 text-center">
          <h2 className="text-lg font-bold text-surface-900 mb-1">Tolak Request?</h2>
          <p className="text-sm text-surface-500 mb-4">
            Request <span className="font-bold text-surface-700">{tx.invoiceNumber}</span> akan ditandai sebagai VOID.
          </p>
          {error && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-left mb-4">{error}</p>}
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-surface-600 hover:bg-surface-50 transition-colors">Batal</button>
            <button onClick={handleReject} disabled={rejectTx.isPending} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
              {rejectTx.isPending ? "Proses..." : "Tolak"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { role, canPerform } = useRole();
  const isSalesRole = role === "SALES";
  const canUpdateTransactions = shouldShowUpdateAction("transaction", canPerform);
  const canApproveTransactions = shouldShowUpdateAction("transaction.approve", canPerform);
  const canRejectTransactions = shouldShowDeleteAction("transaction.approve", canPerform);
  const canDeleteTransactions = shouldShowDeleteAction("transaction", canPerform);

  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [approvingTransaction, setApprovingTransaction] = useState<Transaction | null>(null);
  const [rejectingTransaction, setRejectingTransaction] = useState<Transaction | null>(null);
  const [approvingDraft, setApprovingDraft] = useState<Transaction | null>(null);
  const [voidingTransaction, setVoidingTransaction] = useState<Transaction | null>(null);

  const canApproveDrafts = canPerform("transaction.draft", "update");

  // Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // Debounce search
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  // Fetch data
  const { data: categories = [] } = useCategories();
  const { data: result, isLoading } = useTransactionHistory({
    search: debouncedSearch,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    categoryId: categoryId || undefined,
    status: statusFilter || undefined,
    page,
  });

  const transactions = result?.data ?? [];
  const total = result?.pagination.total ?? 0;
  const totalPages = result?.pagination.totalPages ?? 1;

  const hasActiveFilters =
    debouncedSearch || dateFrom || dateTo || categoryId || statusFilter;

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setDateFrom("");
    setDateTo("");
    setCategoryId("");
    setStatusFilter("");
    setPage(1);
  };

  // Calculate display range
  const startItem = total === 0 ? 0 : (page - 1) * 10 + 1;
  const endItem = Math.min(page * 10, total);

  return (
    <>
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6 bg-white border-b border-surface-100">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-surface-900">Riwayat Transaksi</h1>
            <p className="text-sm text-surface-500 mt-1">
              Daftar seluruh transaksi dan invoice toko
            </p>
          </div>
        </header>

        {/* Filters */}
        <div className="px-4 md:px-8 py-4 bg-white border-b border-surface-100 space-y-3">
          {/* Row 1: Search + Category */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="history-search"
                type="text"
                placeholder="Cari invoice, pelanggan, nama produk, atau sales..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>

            {/* Category Dropdown */}
            <select
              id="history-category-filter"
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
              className="px-4 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm
                focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all
                min-w-[180px]"
            >
              <option value="">Semua Kategori</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            {/* Status Dropdown */}
            <select
              id="history-status-filter"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-4 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm
                focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all
                min-w-[160px]"
            >
              {STATUS_FILTERS.map((status) => (
                <option key={status.value || "all"} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          {/* Row 2: Dates + Reset */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-surface-500 whitespace-nowrap">Dari</label>
              <input
                id="history-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-xl border border-surface-200 bg-surface-50 text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-surface-500 whitespace-nowrap">Sampai</label>
              <input
                id="history-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-xl border border-surface-200 bg-surface-50 text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>

            {hasActiveFilters && (
              <button
                id="history-reset-filters"
                onClick={resetFilters}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-danger-600 bg-danger-50 hover:bg-danger-100 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Reset Filter
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
            {isLoading ? (
              <div className="p-8 flex items-center justify-center">
                <p className="text-surface-400">Memuat riwayat transaksi...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-surface-400">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-50">
                  <path d="M12 8v4l3 3" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <p className="font-medium text-surface-600">
                  {hasActiveFilters ? "Tidak ada transaksi yang cocok dengan filter." : "Belum ada transaksi."}
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium underline"
                  >
                    Reset semua filter
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-50 border-b border-surface-200">
                        <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Tanggal</th>
                        <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">No. Invoice</th>
                        <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Pelanggan</th>
                        <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Sales</th>
                        <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Item</th>
                        <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Total</th>
                        <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Pembayaran</th>
                        <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Status</th>
                        <th className="py-4 px-4 font-semibold text-sm text-surface-600 text-right whitespace-nowrap">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {transactions.map((tx: Transaction) => {
                        const isDP = tx.status === "DP";
                        const isVoided = tx.status === "VOIDED";
                        const isRefunded = tx.status === "REFUNDED";
                        const isPending = tx.status === "PENDING_APPROVAL";
                        const isDraft = tx.status === "DRAFT";
                        const canVoid = (tx.status === "COMPLETED" || tx.status === "DP") && canUpdateTransactions;
                        const rowBg = isPending
                          ? "bg-blue-50/70 hover:bg-blue-50 animate-pending-row relative"
                          : isDraft
                            ? "bg-amber-50/40 hover:bg-amber-50"
                            : isDP
                              ? "bg-amber-50/60 hover:bg-amber-50"
                              : isVoided
                                ? "bg-red-50/40 opacity-70"
                                : isRefunded
                                  ? "bg-surface-50/50 hover:bg-surface-50"
                                  : "hover:bg-surface-50";
                        const textClass = isVoided ? "line-through text-surface-400" : "";
                        return (
                          <tr
                            key={tx.id}
                            className={`${rowBg} transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400`}
                            tabIndex={0}
                            role="button"
                            onClick={() => setSelectedTransaction(tx)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedTransaction(tx);
                              }
                            }}
                          >
                            <td className={`py-3.5 px-4 text-sm whitespace-nowrap ${isVoided ? "text-surface-400 line-through" : "text-surface-900"}`}>
                              {formatDate(new Date(tx.createdAt))}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${tx.status === "DRAFT" ? "bg-amber-50 text-amber-800 font-mono" : isVoided ? "bg-red-50 text-red-400 line-through" : "bg-surface-100 text-surface-700"}`}>
                                {tx.invoiceNumber ?? tx.draftNumber ?? "—"}
                              </span>
                            </td>
                            <td className={`py-3.5 px-4 text-sm font-medium whitespace-nowrap ${isVoided ? "text-surface-400 line-through" : "text-surface-700"}`}>
                              {tx.customerName || <span className="text-surface-400 italic">Umum</span>}
                            </td>
                            <td className={`py-3.5 px-4 text-sm font-medium whitespace-nowrap ${isVoided ? "text-surface-400 line-through" : "text-surface-700"}`}>
                              {tx.salesName || tx.salesperson?.name || <span className="text-surface-400 italic">—</span>}
                            </td>
                            <td className={`py-3.5 px-4 text-sm ${isVoided ? "text-surface-400 line-through" : "text-surface-600"}`}>
                              <div>{tx.items.length} Barang</div>
                              {appliedPricingCount(tx) > 0 && (
                                <div className="mt-1 text-[11px] font-bold text-emerald-700">
                                  Harga khusus {appliedPricingCount(tx)} item
                                </div>
                              )}
                            </td>
                            <td className={`py-3.5 px-4 text-sm font-bold whitespace-nowrap ${isVoided ? "text-surface-400 line-through" : "text-brand-600"}`}>
                              {formatRupiah(Number(tx.total))}
                            </td>
                            <td className="py-3.5 px-4">
                              <PaymentBadge method={tx.paymentMethod} />
                            </td>
                            <td className="py-3.5 px-4">
                              <StatusBadge status={tx.status} />
                            </td>
                            <td
                              className="py-3.5 px-4 text-right"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-2">
                                {!isSalesRole && (
                                  <>
                                    {canUpdateTransactions && (
                                      <button
                                        id={`edit-tx-${tx.id}`}
                                        onClick={() => setEditingTransaction(tx)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                          bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-700 border border-transparent
                                          hover:border-brand-200 transition-all"
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                        Ubah
                                      </button>
                                    )}
                                    {canDeleteTransactions && (
                                      <button
                                        id={`delete-tx-${tx.id}`}
                                        onClick={() => setDeletingTransaction(tx)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                          bg-surface-100 text-red-500 hover:bg-red-50 hover:text-red-700 border border-transparent
                                          hover:border-red-200 transition-all"
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                          <polyline points="3 6 5 6 21 6" />
                                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                          <path d="M10 11v6" />
                                          <path d="M14 11v6" />
                                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                        </svg>
                                        Hapus
                                      </button>
                                    )}
                                  </>
                                )}
                                {!isSalesRole && tx.status === "PENDING_APPROVAL" && (canApproveTransactions || canRejectTransactions) && (
                                  <div className="flex gap-2">
                                    {canApproveTransactions && (
                                      <button
                                        onClick={() => setApprovingTransaction(tx)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                          bg-surface-100 text-blue-600 hover:bg-blue-50 hover:text-blue-700 border border-transparent
                                          hover:border-blue-200 transition-all"
                                      >
                                        Setujui
                                      </button>
                                    )}
                                    {canRejectTransactions && (
                                      <button
                                        onClick={() => setRejectingTransaction(tx)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                          bg-surface-100 text-red-500 hover:bg-red-50 hover:text-red-700 border border-transparent
                                          hover:border-red-200 transition-all"
                                      >
                                        Tolak
                                      </button>
                                    )}
                                  </div>
                                )}
                                {!isSalesRole && tx.status === "DRAFT" && canApproveDrafts && (
                                  <button
                                    id={`approve-draft-${tx.id}`}
                                    onClick={() => setApprovingDraft(tx)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                      bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 border border-amber-200
                                      transition-all cursor-pointer"
                                  >
                                    Setujui
                                  </button>
                                )}
                                {!isSalesRole && canVoid && (
                                  <button
                                    id={`void-tx-${tx.id}`}
                                    onClick={() => setVoidingTransaction(tx)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                      bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-200
                                      transition-all"
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <line x1="18" y1="6" x2="6" y2="18" />
                                      <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                    Void
                                  </button>
                                )}
                                <Button
                                  variant="secondary"
                                  onClick={() => setSelectedTransaction(tx)}
                                  className="!py-1.5 !px-3 text-sm h-auto"
                                >
                                  Lihat Struk
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="flex flex-col gap-3 md:hidden p-4 border-b border-surface-100">
                  {transactions.map((tx: Transaction) => {
                    const isDP = tx.status === "DP";
                    const isVoided = tx.status === "VOIDED";
                    const isRefunded = tx.status === "REFUNDED";
                    const isPending = tx.status === "PENDING_APPROVAL";
                    const isDraft = tx.status === "DRAFT";
                    const canVoid = (tx.status === "COMPLETED" || tx.status === "DP") && canUpdateTransactions;
                    const cardBg = isPending ? "bg-blue-50/30 border-blue-100" 
                      : isDraft ? "bg-amber-50/20 border-amber-100"
                      : isVoided ? "bg-red-50/20 border-red-100 opacity-80"
                      : "bg-white border-surface-200 shadow-sm";

                    return (
                      <div
                        key={tx.id}
                        className={`flex flex-col p-4 rounded-2xl border ${cardBg} cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400`}
                        tabIndex={0}
                        role="button"
                        onClick={() => setSelectedTransaction(tx)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedTransaction(tx);
                          }
                        }}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-mono text-sm font-bold ${isVoided ? "line-through text-surface-400" : "text-brand-700"}`}>
                                {tx.invoiceNumber ?? (tx.draftNumber ? formatDraftNumberForDisplay(tx.draftNumber) : "—")}
                              </span>
                              {isDraft && <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">Draft</span>}
                            </div>
                            <p className="text-xs text-surface-500">{formatDate(new Date(tx.createdAt))}</p>
                          </div>
                          <StatusBadge status={tx.status} />
                        </div>

                        <div className="flex flex-col gap-1 mb-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-surface-500">Pelanggan</span>
                            <span className={`font-medium ${isVoided ? "line-through text-surface-400" : "text-surface-900"}`}>
                              {tx.customerName || <span className="text-surface-400 italic">Umum</span>}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-surface-500">Sales</span>
                            <span className={`font-medium ${isVoided ? "line-through text-surface-400" : "text-surface-900"}`}>
                              {tx.salesName || tx.salesperson?.name || <span className="text-surface-400 italic">—</span>}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mt-2 pt-2 border-t border-surface-100">
                            <PaymentBadge method={tx.paymentMethod} />
                            <span className={`font-bold text-lg tabular-nums ${isVoided ? "line-through text-surface-400" : "text-brand-600"}`}>
                              {formatRupiah(Number(tx.total))}
                            </span>
                          </div>
                        </div>

                        <div
                          className="flex flex-wrap gap-2 pt-3 border-t border-surface-100"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Button
                            variant="secondary"
                            onClick={() => setSelectedTransaction(tx)}
                            className="flex-1 !py-2 !px-3 text-xs h-auto"
                          >
                            Lihat Struk
                          </Button>

                          {!isSalesRole && (
                            <>
                              {canUpdateTransactions && (
                                <button
                                  onClick={() => setEditingTransaction(tx)}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-surface-100 text-surface-700 hover:bg-brand-50 hover:text-brand-700"
                                >
                                  Ubah
                                </button>
                              )}
                              {canDeleteTransactions && (
                                <button
                                  onClick={() => setDeletingTransaction(tx)}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                                >
                                  Hapus
                                </button>
                              )}
                            </>
                          )}

                          {!isSalesRole && tx.status === "PENDING_APPROVAL" && (canApproveTransactions || canRejectTransactions) && (
                            <>
                              {canApproveTransactions && (
                                <button
                                  onClick={() => setApprovingTransaction(tx)}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
                                >
                                  Setujui
                                </button>
                              )}
                              {canRejectTransactions && (
                                <button
                                  onClick={() => setRejectingTransaction(tx)}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                                >
                                  Tolak
                                </button>
                              )}
                            </>
                          )}

                          {!isSalesRole && tx.status === "DRAFT" && canApproveDrafts && (
                            <button
                              onClick={() => setApprovingDraft(tx)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                            >
                              Setujui
                            </button>
                          )}

                          {!isSalesRole && canVoid && (
                            <button
                              onClick={() => setVoidingTransaction(tx)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                            >
                              Void
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-surface-100 gap-3">
                  <p className="text-sm text-surface-500">
                    Menampilkan <span className="font-semibold text-surface-700">{startItem}–{endItem}</span> dari{" "}
                    <span className="font-semibold text-surface-700">{total}</span> transaksi
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      id="history-prev-page"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-surface-200 text-sm font-medium
                        text-surface-600 hover:bg-surface-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      Sebelumnya
                    </button>
                    <span className="px-3 py-2 rounded-xl bg-brand-50 text-brand-700 text-sm font-bold min-w-[40px] text-center">
                      {page}
                    </span>
                    <span className="text-sm text-surface-400">dari {totalPages}</span>
                    <button
                      id="history-next-page"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-surface-200 text-sm font-medium
                        text-surface-600 hover:bg-surface-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Berikutnya
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Receipt View Modal */}
      {selectedTransaction && (
        <ReceiptModal
          open={!!selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          transaction={selectedTransaction}
        />
      )}

      {/* Edit Modal */}
      {editingTransaction && canUpdateTransactions && (
        <EditModal
          tx={editingTransaction}
          onClose={() => setEditingTransaction(null)}
        />
      )}

      {/* Delete Confirm Modal */}
      {deletingTransaction && canDeleteTransactions && (
        <DeleteConfirmModal
          tx={deletingTransaction}
          onClose={() => setDeletingTransaction(null)}
        />
      )}

      {/* Approve Modal */}
      {approvingTransaction && canApproveTransactions && (
        <ApproveModal
          tx={approvingTransaction}
          onClose={() => setApprovingTransaction(null)}
          onSuccess={() => setApprovingTransaction(null)}
        />
      )}

      {/* Void Confirm Modal */}
      {voidingTransaction && canUpdateTransactions && (
        <VoidConfirmModal
          tx={voidingTransaction}
          onClose={() => setVoidingTransaction(null)}
          onSuccess={() => setVoidingTransaction(null)}
        />
      )}

      {/* Reject Modal */}
      {rejectingTransaction && canRejectTransactions && (
        <RejectModal
          tx={rejectingTransaction}
          onClose={() => setRejectingTransaction(null)}
          onSuccess={() => setRejectingTransaction(null)}
        />
      )}

      {/* Approve Draft Dialog */}
      {approvingDraft && canApproveDrafts && (
        <ApproveDraftDialog
          draft={approvingDraft}
          onClose={() => setApprovingDraft(null)}
          onSuccess={() => setApprovingDraft(null)}
        />
      )}
    </>
  );
}

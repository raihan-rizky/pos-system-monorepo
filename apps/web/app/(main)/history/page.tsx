"use client";

import React, { useState, useCallback } from "react";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Edit2,
  ChevronUp,
  ChevronDown,
  CalendarDays,
  FileText,
  History,
  Search,
  Smartphone,
  Trash2,
  Truck,
  Undo2,
  X,
  XCircle,
  MoreHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ReceiptModal } from "@/components/ReceiptModal";
import { SuratJalanBundleButton } from "@/features/surat-jalan/components/SuratJalanBundleButton";
import { Modal } from "@pos/ui";
import { TransactionActionMenu } from "./TransactionActionMenu";
import { TransactionCartEditor, type CartEditorItem } from "./components/TransactionCartEditor";
import { ApproveModal } from "./components/ApproveModal";
import { SuratJalanCreateModal } from "@/features/surat-jalan/components/SuratJalanCreateModal";
import {
  formatSuratJalanBundleProgress,
  isSuratJalanBundle,
} from "@/features/transaction-history/helpers/surat-jalan-bundle";
import {
  buildTransactionHistoryQuickDateRange,
  type TransactionHistoryQuickDateFilter,
} from "@/features/transaction-history/helpers/date-range";
import {
  useTransactionHistory,
  useTransaction,
  useUpdateTransaction,
  useUpdateTransactionInvoiceDate,
  useDeleteTransaction,
  useRejectTransaction,
  Transaction,
} from "@/hooks/useTransactions";
import {
  getLatestPreviousInvoiceDate,
  getTransactionInvoiceDate,
  hasInvoiceDateChange,
} from "@/features/invoice-date/helpers/history-invoice-date-display";
import { ApproveDraftDialog } from "@/features/transactions-draft";
import { formatDraftNumberForDisplay } from "@/features/transactions-draft/helpers/draft-number";
import { useCategories } from "@/hooks/useProducts";
import { formatRupiah, formatDate } from "@/lib/utils";
import { Button } from "@pos/ui";
import { useRole } from "@/components/providers/RoleProvider";
import { shouldShowDeleteAction, shouldShowUpdateAction } from "@/features/rbac/helpers/rbac-ui";

import { getLogger } from "@/lib/logger";

const log = getLogger("page:main:history");

function formatJakartaDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function formatJakartaTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  return hour && minute ? `${hour}:${minute}` : "";
}
// ─── Edit Modal ──────────────────────────────────────────────────────────────

type EditForm = {
  salesName: string;
  salespersonId: string;
  customerName: string;
  paymentMethod: string;
  status: string;
};

const PAYMENT_METHODS = ["CASH", "TRANSFER", "QRIS", "DEBIT", "CREDIT"];
const STATUSES = [
  { value: "COMPLETED", label: "Lunas", color: "text-emerald-700" },
  { value: "DP", label: "DP", color: "text-amber-700" },
  { value: "PENDING_APPROVAL", label: "Pending", color: "text-blue-600" },
  { value: "VOIDED", label: "Void", color: "text-surface-500" },
  { value: "REFUNDED", label: "Refund", color: "text-red-600" },
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

const QUICK_DATE_FILTERS: Array<{
  value: TransactionHistoryQuickDateFilter;
  label: string;
  title: string;
}> = [
  { value: "daily", label: "Harian", title: "Transaksi hari ini" },
  { value: "weekly", label: "Mingguan", title: "Transaksi 7 hari terakhir" },
  { value: "monthly", label: "Bulanan", title: "Transaksi bulan berjalan" },
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

  const [cartItems, setCartItems] = useState<CartEditorItem[]>(
    tx.items.map((i) => ({
      productId: i.productId || "",
      productName: i.productName,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      originalUnitPrice: Number(i.originalUnitPrice || i.unitPrice),
      appliedUnitPrice: Number(i.appliedUnitPrice || i.unitPrice),
      subtotal: Number(i.subtotal),
    }))
  );
  const [isUpdatingItems, setIsUpdatingItems] = useState(false);

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
    setIsUpdatingItems(true);
    try {
      const itemsRes = await fetch(`/api/transactions/${tx.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cartItems }),
      });
      if (!itemsRes.ok) {
        const errData = await itemsRes.json();
        throw new Error(errData.message || "Gagal menyimpan produk");
      }

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
    } finally {
      setIsUpdatingItems(false);
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
      <div className="relative flex flex-col w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-surface-900">Ubah Transaksi</h2>
            <p className="text-xs text-surface-500 mt-0.5">{tx.invoiceNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-100 transition-colors text-surface-400 hover:text-surface-700"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 px-6 py-5 space-y-4 overflow-y-auto min-h-0">
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
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${form.paymentMethod === pm
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
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${form.status === s.value
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

          <div className="pt-2 border-t border-surface-100">
            <TransactionCartEditor
              items={cartItems}
              onChange={setCartItems}
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-surface-100 bg-white flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-surface-600
              hover:bg-surface-50 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={updateTx.isPending || isUpdatingItems}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold
              hover:bg-brand-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {updateTx.isPending || isUpdatingItems ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function InvoiceDateEditModal({
  tx,
  onClose,
}: {
  tx: Transaction;
  onClose: () => void;
}) {
  const updateInvoiceDate = useUpdateTransactionInvoiceDate();
  const currentInvoiceDate = getTransactionInvoiceDate(tx);
  const previousChangedDate = getLatestPreviousInvoiceDate(tx);
  const [invoiceDate, setInvoiceDate] = useState(
    formatJakartaDateInput(currentInvoiceDate),
  );
  const [invoiceTime, setInvoiceTime] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const existingTime = formatJakartaTimeInput(currentInvoiceDate);
  const documentNumber = tx.invoiceNumber ?? tx.draftNumber ?? "-";
  const canSubmit =
    Boolean(invoiceDate) &&
    reason.trim().length > 0 &&
    !updateInvoiceDate.isPending;

  const handleSave = async () => {
    setError("");
    if (!canSubmit) return;
    try {
      await updateInvoiceDate.mutateAsync({
        id: tx.id,
        invoiceDate,
        invoiceTime: invoiceTime || null,
        reason: reason.trim(),
        regenerateNumber: true,
      });
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal mengubah tanggal invoice",
      );
    }
  };

  return (
    <Modal open onClose={onClose} title="Ubah Tanggal Invoice" size="md">
      <div className="space-y-4">
        <div className="rounded-xl border border-surface-200 bg-surface-50 p-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-surface-500">Nomor</span>
            <span className="font-mono font-bold text-surface-900 text-right">
              {documentNumber}
            </span>
          </div>
          <div className="mt-2 flex justify-between gap-3">
            <span className="text-surface-500">Tanggal invoice saat ini</span>
            <span className="font-semibold text-surface-900 text-right">
              {formatDate(new Date(currentInvoiceDate))}
            </span>
          </div>
          <div className="mt-2 flex justify-between gap-3">
            <span className="text-surface-500">Tanggal dibuat sistem</span>
            <span className="font-semibold text-surface-900 text-right">
              {formatDate(new Date(tx.createdAt))}
            </span>
          </div>
          {previousChangedDate && (
            <div className="mt-2 flex justify-between gap-3">
              <span className="text-surface-500">Tanggal sebelumnya</span>
              <span className="font-semibold text-amber-700 text-right">
                {formatDate(new Date(previousChangedDate))}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              Tanggal Invoice
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              Jam Invoice (Opsional)
            </label>
            <input
              type="time"
              value={invoiceTime}
              onChange={(e) => setInvoiceTime(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          </div>
        </div>

        <p className="text-xs text-surface-500">
          Jika jam dikosongkan, sistem mempertahankan jam invoice sebelumnya
          ({existingTime || "tidak tersedia"}).
        </p>

        <div>
          <label className="block text-xs font-semibold text-surface-600 mb-1.5">
            Alasan perubahan
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Contoh: transaksi seharusnya masuk pembukuan tanggal sebelumnya"
            className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
        </div>

        {error && (
          <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={updateInvoiceDate.isPending}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="accent"
            onClick={handleSave}
            disabled={!canSubmit}
            loading={updateInvoiceDate.isPending}
          >
            Simpan Tanggal
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "DRAFT") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <FileText className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden="true" />
        SEMENTARA
      </span>
    );
  }
  if (status === "DP") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
        <CircleDollarSign className="h-3 w-3" aria-hidden="true" />
        DP
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
        <XCircle className="h-3 w-3" aria-hidden="true" />
        DIBATALKAN
      </span>
    );
  }
  if (status === "REFUNDED") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200">
        <Undo2 className="h-3 w-3" aria-hidden="true" />
        Refund
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      Lunas
    </span>
  );
}

// Payment Method Badge

function PaymentBadge({ method }: { method: string }) {
  const map: Record<string, { bg: string; text: string; Icon: LucideIcon }> = {
    CASH: { bg: "bg-green-100", text: "text-green-700", Icon: Banknote },
    TRANSFER: { bg: "bg-blue-100", text: "text-blue-700", Icon: Building2 },
    QRIS: { bg: "bg-purple-100", text: "text-purple-700", Icon: Smartphone },
    DEBIT: { bg: "bg-indigo-100", text: "text-indigo-700", Icon: CreditCard },
    CREDIT: { bg: "bg-orange-100", text: "text-orange-700", Icon: CreditCard },
  };
  const style = map[method] ?? { bg: "bg-surface-100", text: "text-surface-600", Icon: CircleDollarSign };
  const Icon = style.Icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${style.bg} ${style.text} border-transparent`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {method}
    </span>
  );
}

function appliedPricingCount(tx: Transaction) {
  return tx.items.filter((item) => item.pricingRuleId).length;
}

function needsCashierApproval(tx: Transaction) {
  return tx.status === "PENDING_APPROVAL" || (Boolean(tx.requestedById) && !tx.cashierId);
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
            <Trash2 className="h-[26px] w-[26px] text-red-600" aria-hidden="true" />
          </div>

          <h2 className="text-lg font-bold text-surface-900 mb-1">Hapus Transaksi?</h2>
          <p className="text-sm text-surface-500 mb-1">
            Transaksi berikut akan dihapus permanen:
          </p>
          <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-bold bg-surface-100 text-surface-700 mb-4">
            {tx.invoiceNumber}
          </span>
          <p className="text-xs text-red-500 font-medium">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
            Stok barang akan dikembalikan ke inventory. Tindakan ini tidak dapat dibatalkan.
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
            <XCircle className="h-[26px] w-[26px] text-red-600" aria-hidden="true" />
          </div>

          <h2 className="text-lg font-bold text-surface-900 mb-1">Batalkan Transaksi?</h2>
          <p className="text-sm text-surface-500 mb-1">
            Transaksi berikut akan dibatalkan (Void):
          </p>
          <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-bold bg-surface-100 text-surface-700 mb-4">
            {tx.invoiceNumber}
          </span>
          <p className="text-xs text-red-500 font-medium">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
            Status akan berubah menjadi <strong>VOID</strong>. Transaksi ini tidak akan dihitung dalam pendapatan.
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

// ─── Transaction Row Actions ───────────────────────────────────────────────────

function TransactionRowActions({
  tx,
  canApproveTransactions,
  canUpdateTransactions,
  canDeleteTransactions,
  canRejectTransactions,
  onAction,
}: {
  tx: Transaction;
  canApproveTransactions: boolean;
  canUpdateTransactions: boolean;
  canDeleteTransactions: boolean;
  canRejectTransactions: boolean;
  onAction: (e: React.MouseEvent, action: string, tx: Transaction) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleActionClick = (e: React.MouseEvent, action: string) => {
    e.stopPropagation();
    setIsOpen(false);
    onAction(e, action, tx);
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors focus:outline-none"
        aria-label="Aksi Lainnya"
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 overflow-hidden border border-surface-100">
          <div className="py-1">
            {tx.status === "PENDING" && canApproveTransactions && (
              <button
                onClick={(e) => handleActionClick(e, 'approve')}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-brand-50 hover:text-brand-700 flex items-center transition-colors"
              >
                <CheckCircle2 className="mr-3 h-4 w-4 text-brand-600" aria-hidden="true" />
                Setujui
              </button>
            )}
            {tx.status === "PENDING" && canRejectTransactions && (
              <button
                onClick={(e) => handleActionClick(e, 'reject')}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-red-50 hover:text-red-700 flex items-center transition-colors"
              >
                <XCircle className="mr-3 h-4 w-4 text-red-600" aria-hidden="true" />
                Tolak
              </button>
            )}
            <div className="h-px bg-surface-100 my-1"></div>
            <SuratJalanBundleButton
              transaction={tx}
              asDropdownItem
            />
            {tx.status !== "VOIDED" && canUpdateTransactions && (
              <>
                <button
                  onClick={(e) => handleActionClick(e, 'edit')}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-50 flex items-center transition-colors"
                >
                  <Edit2 className="mr-3 h-4 w-4 text-surface-500" aria-hidden="true" />
                  Edit
                </button>
                <button
                  onClick={(e) => handleActionClick(e, 'void')}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 flex items-center transition-colors"
                >
                  <AlertTriangle className="mr-3 h-4 w-4 text-red-500" aria-hidden="true" />
                  Void
                </button>
              </>
            )}
            {canDeleteTransactions && (
              <button
                onClick={(e) => handleActionClick(e, 'delete')}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 flex items-center transition-colors"
              >
                <Trash2 className="mr-3 h-4 w-4 text-red-500" aria-hidden="true" />
                Hapus
              </button>
            )}
          </div>
        </div>
      )}
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
  const canChangeInvoiceDate =
    canUpdateTransactions && (role === "OWNER" || role === "ADMIN");

  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedSuratJalanTransactionId, setSelectedSuratJalanTransactionId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingInvoiceDateTransaction, setEditingInvoiceDateTransaction] =
    useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [approvingTransaction, setApprovingTransaction] = useState<Transaction | null>(null);
  const [rejectingTransaction, setRejectingTransaction] = useState<Transaction | null>(null);
  const [approvingDraft, setApprovingDraft] = useState<Transaction | null>(null);
  const [voidingTransaction, setVoidingTransaction] = useState<Transaction | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const canApproveDrafts = canPerform("transaction.draft", "update");

  // Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [quickDateFilter, setQuickDateFilter] =
    useState<TransactionHistoryQuickDateFilter | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [suratJalanOnly, setSuratJalanOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

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

  const applyQuickDateFilter = useCallback((filter: TransactionHistoryQuickDateFilter) => {
    const range = buildTransactionHistoryQuickDateRange(filter);
    setQuickDateFilter(filter);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setPage(1);
  }, []);

  const handleDateFromChange = useCallback((value: string) => {
    setQuickDateFilter("");
    setDateFrom(value);
    setPage(1);
  }, []);

  const handleDateToChange = useCallback((value: string) => {
    setQuickDateFilter("");
    setDateTo(value);
    setPage(1);
  }, []);

  // Fetch data
  const { data: categories = [] } = useCategories();
  const { data: result, isLoading } = useTransactionHistory({
    search: debouncedSearch,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    categoryId: categoryId || undefined,
    status: statusFilter || undefined,
    suratJalan: suratJalanOnly ? "bundled" : undefined,
    page,
  });

  const transactions = result?.data ?? [];
  const total = result?.pagination.total ?? 0;
  const totalPages = result?.pagination.totalPages ?? 1;
  const { data: selectedTransactionDetail } = useTransaction(
    selectedTransaction?.id ?? null,
  );
  const receiptTransaction = selectedTransactionDetail ?? selectedTransaction;

  const hasActiveFilters =
    debouncedSearch || dateFrom || dateTo || categoryId || statusFilter || suratJalanOnly;

  const openTransactionDetail = useCallback((tx: Transaction) => {
    if (isSuratJalanBundle(tx)) {
      setSelectedSuratJalanTransactionId(tx.id);
      return;
    }

    setSelectedTransaction(tx);
  }, []);

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setDateFrom("");
    setDateTo("");
    setQuickDateFilter("");
    setCategoryId("");
    setStatusFilter("");
    setSuratJalanOnly(false);
    setPage(1);
  };

  // Calculate display range
  const startItem = total === 0 ? 0 : (page - 1) * 10 + 1;
  const endItem = Math.min(page * 10, total);

  return (
    <>
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header + Filters (collapsible) */}
        <div
          className={`relative transition-all duration-300 ease-out ${isHeaderVisible ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
            }`}
        >
          {/* Header */}
          <header className="relative px-4 md:px-8 pt-4 pb-0 bg-white border-b border-surface-100">
            {/* Hide button — inside header, connected to bottom border */}

            <div className="pb-4 md:pb-6">
              <h1 className="text-xl md:text-2xl font-extrabold text-surface-900">Riwayat Transaksi</h1>
              <p className="text-sm text-surface-500 mt-1">
                Daftar seluruh transaksi dan invoice toko
              </p>
            </div>
          </header>

          {/* Filters */}
          <div
            id="history-filters"
            className={`md:block px-4 md:px-8 py-4 bg-white border-b border-surface-100 space-y-3`}
          >
            {/* Row 1: Search + Category */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" aria-hidden="true" />
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
                {categories.map((cat: any) => (
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-surface-500">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  Filter cepat
                </span>
                <div className="inline-flex rounded-xl border border-surface-200 bg-surface-50 p-1">
                  {QUICK_DATE_FILTERS.map((filter) => {
                    const isActive = quickDateFilter === filter.value;
                    return (
                      <button
                        key={filter.value}
                        type="button"
                        title={filter.title}
                        aria-pressed={isActive}
                        onClick={() => applyQuickDateFilter(filter.value)}
                        className={`min-h-8 rounded-lg px-3 text-xs font-bold transition-colors ${isActive
                          ? "bg-brand-600 text-white shadow-sm"
                          : "text-surface-600 hover:bg-white hover:text-brand-700"
                          }`}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-surface-500 whitespace-nowrap">Dari</label>
                <input
                  id="history-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => handleDateFromChange(e.target.value)}
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
                  onChange={(e) => handleDateToChange(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-surface-200 bg-surface-50 text-sm
                      focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
                />
              </div>

              <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100">
                <input
                  id="history-surat-jalan-filter"
                  type="checkbox"
                  checked={suratJalanOnly}
                  onChange={(e) => {
                    setSuratJalanOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                />
                <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                Surat Jalan saja
              </label>

              {hasActiveFilters && (
                <button
                  id="history-reset-filters"
                  onClick={resetFilters}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-danger-600 bg-danger-50 hover:bg-danger-100 transition-colors"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Reset Filter
                </button>
              )}
            </div>
          </div>
          <button
            id="history-toggle-header"
            type="button"
            onClick={() => setIsHeaderVisible((v) => !v)}
            className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-1/2 z-10 inline-flex h-6 w-8 items-center justify-center rounded-b-lg  bg-white text-surface-500 shadow-brand-500/30 shadow-lg hover:shadow-brand-500/50 transition-all duration-300 hover:text-surface-700"
            style={{
              opacity: isHeaderVisible ? 1 : 0,
              pointerEvents: isHeaderVisible ? "auto" : "none",
            }}
            aria-label="Sembunyikan header"
          >
            {isHeaderVisible ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

        </div>



        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 relative">
          {/* Show button — sticky top, centered horizontally */}
          <button
            id="history-toggle-header-show"
            type="button"
            onClick={() => setIsHeaderVisible((v) => !v)}
            className="sticky top-0 left-1/2 -translate-x-1/2 z-10 inline-flex h-6 w-8 items-center justify-center rounded-b-xl border border-surface-200 border-t-0 bg-white text-surface-500 shadow-brand-500/30 shadow-lg hover:shadow-brand-500/50 transition-all duration-300 hover:text-surface-700"
            style={{
              opacity: isHeaderVisible ? 0 : 1,
              pointerEvents: isHeaderVisible ? "none" : "auto",
            }}
            aria-label="Tampilkan header"
          >
            {isHeaderVisible ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
            {isLoading ? (
              <div className="p-8 flex items-center justify-center">
                <p className="text-surface-400">Memuat riwayat transaksi...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-surface-400">
                <History className="mb-4 h-16 w-16 opacity-50" strokeWidth={1} aria-hidden="true" />
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
                        const isPending = needsCashierApproval(tx);
                        const isDraft = tx.status === "DRAFT";
                        const isBundled = isSuratJalanBundle(tx);
                        const bundleProgress = formatSuratJalanBundleProgress(tx.suratJalanSummary);
                        const invoiceDateForDisplay = getTransactionInvoiceDate(tx);
                        const previousInvoiceDate = getLatestPreviousInvoiceDate(tx);
                        const canVoid = (tx.status === "COMPLETED" || tx.status === "DP") && canUpdateTransactions;
                        const rowBg = isPending
                          ? "bg-blue-50/70 hover:bg-blue-50 animate-pending-row relative"
                          : isDraft
                            ? "bg-amber-50/40 hover:bg-amber-50"
                            : isBundled
                              ? "bg-emerald-50/50 hover:bg-emerald-50 history-surat-jalan-glow"
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
                            onClick={() => openTransactionDetail(tx)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openTransactionDetail(tx);
                              }
                            }}
                          >
                            <td className={`py-3.5 px-4 text-sm whitespace-nowrap ${isVoided ? "text-surface-400 line-through" : "text-surface-900"}`}>
                              <div className="font-semibold">
                                {formatDate(new Date(invoiceDateForDisplay))}
                              </div>
                              <div className="mt-0.5 text-[11px] text-surface-500">
                                Dibuat: {formatDate(new Date(tx.createdAt))}
                              </div>
                              {previousInvoiceDate && (
                                <div className="mt-0.5 text-[11px] font-semibold text-amber-700">
                                  Sebelumnya: {formatDate(new Date(previousInvoiceDate))}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${tx.status === "DRAFT" ? "bg-amber-50 text-amber-800 font-mono" : isVoided ? "bg-red-50 text-red-400 line-through" : "bg-surface-100 text-surface-700"}`}>
                                    {tx.invoiceNumber ?? tx.draftNumber ?? "—"}
                                  </span>
                                  {isBundled && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                      <Truck className="h-3 w-3" aria-hidden="true" />
                                      Surat Jalan
                                    </span>
                                  )}
                                  {hasInvoiceDateChange(tx) && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                                      <CalendarDays className="h-3 w-3" aria-hidden="true" />
                                      Tanggal diubah
                                    </span>
                                  )}
                                </div>
                                {tx.buktiTransaksiUrls && tx.buktiTransaksiUrls.length > 0 && (
                                  <div className="flex -space-x-1.5" title={`${tx.buktiTransaksiUrls.length} Bukti Transaksi`}>
                                    {tx.buktiTransaksiUrls.map((url, i) => {
                                      const resolvedUrl = url.includes("prnt.sc") ? `/api/prntsc?url=${encodeURIComponent(url)}` : url;
                                      return (
                                        <div key={i} className="group relative z-0 hover:z-[60]">
                                          <img
                                            src={resolvedUrl}
                                            alt={`Bukti ${i + 1}`}
                                            className="inline-block h-8 w-8 rounded-md ring-2 ring-white object-cover bg-surface-100 border border-surface-200 cursor-pointer hover:ring-brand-500 hover:scale-110 transition-all relative z-10"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedImageUrl(resolvedUrl);
                                            }}
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).style.display = "none";
                                            }}
                                          />
                                          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all duration-200 pointer-events-none z-50 flex">
                                            <div className="bg-white p-1.5 rounded-xl shadow-xl border border-surface-200 shadow-black/10 flex">
                                              <img src={resolvedUrl} alt={`Preview ${i + 1}`} className="w-auto max-w-[300px] h-auto max-h-[420px] object-contain rounded-lg" />
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className={`py-3.5 px-4 text-sm font-medium whitespace-nowrap ${isVoided ? "text-surface-400 line-through" : "text-surface-700"}`}>
                              {tx.customerName || <span className="text-surface-400 italic">Umum</span>}
                            </td>
                            <td className={`py-3.5 px-4 text-sm font-medium whitespace-nowrap ${isVoided ? "text-surface-400 line-through" : "text-surface-700"}`}>
                              {tx.salesName || tx.salesperson?.name || <span className="text-surface-400 italic">—</span>}
                            </td>
                            <td className={`py-3.5 px-4 text-sm ${isVoided ? "text-surface-400 line-through" : "text-surface-600"}`}>
                              <div>{tx.items.length} Barang</div>
                              {bundleProgress && (
                                <div className="mt-1 text-[11px] font-bold text-emerald-700">
                                  {bundleProgress}
                                </div>
                              )}
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
                              <div className="flex flex-wrap items-center gap-2">
                                {tx.payments && tx.payments.length > 0 ? (
                                  tx.payments.map((p, idx) => (
                                    <PaymentBadge key={idx} method={p.method} />
                                  ))
                                ) : (
                                  <PaymentBadge method={tx.paymentMethod} />
                                )}
                                {isPending && tx.status === "DP" && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-amber-200 bg-amber-100 text-[10px] font-bold text-amber-700">
                                    DP
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <StatusBadge status={isPending ? "PENDING_APPROVAL" : tx.status} />
                            </td>
                            <td
                              className="py-3.5 px-4 text-right"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-2">
                                {!isBundled && (
                                  <Button
                                    variant="secondary"
                                    onClick={(e) => { e.stopPropagation(); openTransactionDetail(tx); }}
                                    className="!py-1.5 !px-3 text-sm h-auto"
                                  >
                                    Lihat Struk
                                  </Button>
                                )}
                                {!isSalesRole && isPending && (canApproveTransactions || canRejectTransactions) && (
                                  <div className="flex gap-2">
                                    {canApproveTransactions && (
                                      <Button
                                        onClick={(e) => { e.stopPropagation(); setApprovingTransaction(tx); }}
                                        className="!py-1.5 !px-3 text-sm h-auto bg-blue-600 hover:bg-blue-700 text-white"
                                      >
                                        Setujui
                                      </Button>
                                    )}
                                    {canRejectTransactions && (
                                      <Button
                                        onClick={(e) => { e.stopPropagation(); setRejectingTransaction(tx); }}
                                        className="!py-1.5 !px-3 text-sm h-auto bg-red-600 hover:bg-red-700 text-white border-transparent"
                                      >
                                        Tolak
                                      </Button>
                                    )}
                                  </div>
                                )}
                                {!isSalesRole && tx.status === "DRAFT" && canApproveDrafts && (
                                  <Button
                                    onClick={(e) => { e.stopPropagation(); setApprovingDraft(tx); }}
                                    className="!py-1.5 !px-3 text-sm h-auto bg-amber-600 hover:bg-amber-700 text-white"
                                  >
                                    Setujui Draft
                                  </Button>
                                )}
                                <TransactionActionMenu
                                  tx={tx}
                                  isSalesRole={isSalesRole}
                                  canUpdateTransactions={canUpdateTransactions}
                                  canDeleteTransactions={canDeleteTransactions}
                                  canApproveTransactions={canApproveTransactions}
                                  canRejectTransactions={canRejectTransactions}
                                  canApproveDrafts={canApproveDrafts}
                                  canVoid={canVoid}
                                  canChangeInvoiceDate={canChangeInvoiceDate}
                                  isPending={isPending}
                                  isBundled={isBundled}
                                  onEdit={() => setEditingTransaction(tx)}
                                  onEditInvoiceDate={() => setEditingInvoiceDateTransaction(tx)}
                                  onDelete={() => setDeletingTransaction(tx)}
                                  onApprove={() => setApprovingTransaction(tx)}
                                  onReject={() => setRejectingTransaction(tx)}
                                  onApproveDraft={() => setApprovingDraft(tx)}
                                  onVoid={() => setVoidingTransaction(tx)}
                                />
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
                    const isPending = needsCashierApproval(tx);
                    const isDraft = tx.status === "DRAFT";
                    const isBundled = isSuratJalanBundle(tx);
                    const bundleProgress = formatSuratJalanBundleProgress(tx.suratJalanSummary);
                    const invoiceDateForDisplay = getTransactionInvoiceDate(tx);
                    const previousInvoiceDate = getLatestPreviousInvoiceDate(tx);
                    const canVoid = (tx.status === "COMPLETED" || tx.status === "DP") && canUpdateTransactions;
                    const cardBg = isPending ? "bg-blue-50/30 border-blue-100"
                      : isDraft ? "bg-amber-50/20 border-amber-100"
                        : isBundled ? "bg-emerald-50/60 border-emerald-200 history-surat-jalan-glow"
                          : isVoided ? "bg-red-50/20 border-red-100 opacity-80"
                            : "bg-white border-surface-200 shadow-sm";

                    return (
                      <div
                        key={tx.id}
                        className={`flex flex-col p-4 rounded-2xl border ${cardBg} cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400`}
                        tabIndex={0}
                        role="button"
                        onClick={() => openTransactionDetail(tx)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openTransactionDetail(tx);
                          }
                        }}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`font-mono text-sm font-bold ${isVoided ? "line-through text-surface-400" : "text-brand-700"}`}>
                                {tx.invoiceNumber ?? (tx.draftNumber ? formatDraftNumberForDisplay(tx.draftNumber) : "—")}
                              </span>
                              {isDraft && <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">Draft</span>}
                              {isBundled && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                  <Truck className="h-3 w-3" aria-hidden="true" />
                                  Surat Jalan
                                </span>
                              )}
                              {hasInvoiceDateChange(tx) && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                  <CalendarDays className="h-3 w-3" aria-hidden="true" />
                                  Tanggal diubah
                                </span>
                              )}
                            </div>
                            {tx.buktiTransaksiUrls && tx.buktiTransaksiUrls.length > 0 && (
                              <div className="flex -space-x-1.5 mb-1">
                                {tx.buktiTransaksiUrls.map((url, i) => {
                                  const resolvedUrl = url.includes("prnt.sc") ? `/api/prntsc?url=${encodeURIComponent(url)}` : url;
                                  return (
                                    <div key={i} className="group relative z-0 hover:z-50">
                                      <img
                                        src={resolvedUrl}
                                        alt={`Bukti ${i + 1}`}
                                        className="inline-block h-8 w-8 rounded-md ring-2 ring-white object-cover bg-surface-100 border border-surface-200 cursor-pointer hover:ring-brand-500 hover:scale-110 transition-all relative z-10"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedImageUrl(resolvedUrl);
                                        }}
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = "none";
                                        }}
                                      />
                                      <div className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all duration-200 pointer-events-none z-50">
                                        <div className="bg-white p-1 rounded-xl shadow-2xl border border-surface-200 shadow-black/10">
                                          <img src={resolvedUrl} alt={`Preview ${i + 1}`} className="w-32 h-auto max-h-48 object-contain rounded-lg" />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <p className="text-xs font-semibold text-surface-700">
                              {formatDate(new Date(invoiceDateForDisplay))}
                            </p>
                            <p className="text-[11px] text-surface-500">
                              Dibuat: {formatDate(new Date(tx.createdAt))}
                            </p>
                            {previousInvoiceDate && (
                              <p className="text-[11px] font-semibold text-amber-700">
                                Sebelumnya: {formatDate(new Date(previousInvoiceDate))}
                              </p>
                            )}
                            {bundleProgress && (
                              <p className="mt-1 text-[11px] font-bold text-emerald-700">
                                {bundleProgress}
                              </p>
                            )}
                          </div>
                          <StatusBadge status={isPending ? "PENDING_APPROVAL" : tx.status} />
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
                            <div className="flex flex-wrap items-center gap-2">
                              {tx.payments && tx.payments.length > 0 ? (
                                tx.payments.map((p, idx) => (
                                  <PaymentBadge key={idx} method={p.method} />
                                ))
                              ) : (
                                <PaymentBadge method={tx.paymentMethod} />
                              )}
                              {isPending && tx.status === "DP" && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-amber-200 bg-amber-100 text-[10px] font-bold text-amber-700">
                                  DP
                                </span>
                              )}
                            </div>
                            <span className={`font-bold text-lg tabular-nums ${isVoided ? "line-through text-surface-400" : "text-brand-600"}`}>
                              {formatRupiah(Number(tx.total))}
                            </span>
                          </div>
                        </div>

                        {!isBundled && (
                          <div
                            className="flex items-center justify-end gap-2 pt-3 border-t border-surface-100"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {!isBundled && (
                              <Button
                                variant="secondary"
                                onClick={(e) => { e.stopPropagation(); openTransactionDetail(tx); }}
                                className="flex-1 !py-2 !px-3 text-xs h-auto"
                              >
                                Lihat Struk
                              </Button>
                            )}
                            {!isSalesRole && isPending && (canApproveTransactions || canRejectTransactions) && (
                              <>
                                {canApproveTransactions && (
                                  <Button
                                    onClick={(e) => { e.stopPropagation(); setApprovingTransaction(tx); }}
                                    className="flex-1 !py-2 !px-3 text-xs h-auto bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    Setujui
                                  </Button>
                                )}
                                {canRejectTransactions && (
                                  <Button
                                    onClick={(e) => { e.stopPropagation(); setRejectingTransaction(tx); }}
                                    className="flex-1 !py-2 !px-3 text-xs h-auto bg-red-600 hover:bg-red-700 text-white border-transparent"
                                  >
                                    Tolak
                                  </Button>
                                )}
                              </>
                            )}
                            {!isSalesRole && tx.status === "DRAFT" && canApproveDrafts && (
                              <Button
                                onClick={(e) => { e.stopPropagation(); setApprovingDraft(tx); }}
                                className="flex-1 !py-2 !px-3 text-xs h-auto bg-amber-600 hover:bg-amber-700 text-white"
                              >
                                Setujui Draft
                              </Button>
                            )}
                            <TransactionActionMenu
                              tx={tx}
                              isSalesRole={isSalesRole}
                              canUpdateTransactions={canUpdateTransactions}
                              canDeleteTransactions={canDeleteTransactions}
                              canApproveTransactions={canApproveTransactions}
                              canRejectTransactions={canRejectTransactions}
                              canApproveDrafts={canApproveDrafts}
                              canVoid={canVoid}
                              canChangeInvoiceDate={canChangeInvoiceDate}
                              isPending={isPending}
                              isBundled={isBundled}
                              onEdit={() => setEditingTransaction(tx)}
                              onEditInvoiceDate={() => setEditingInvoiceDateTransaction(tx)}
                              onDelete={() => setDeletingTransaction(tx)}
                              onApprove={() => setApprovingTransaction(tx)}
                              onReject={() => setRejectingTransaction(tx)}
                              onApproveDraft={() => setApprovingDraft(tx)}
                              onVoid={() => setVoidingTransaction(tx)}
                            />
                          </div>
                        )}
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
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
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
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Receipt View Modal */}
      {selectedTransaction && receiptTransaction && (
        <ReceiptModal
          open={!!selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          transaction={receiptTransaction}
        />
      )}

      {selectedSuratJalanTransactionId && (
        <SuratJalanCreateModal
          open={!!selectedSuratJalanTransactionId}
          transactionId={selectedSuratJalanTransactionId}
          onClose={() => setSelectedSuratJalanTransactionId(null)}
        />
      )}

      {/* Edit Modal */}
      {editingTransaction && canUpdateTransactions && (
        <EditModal
          tx={editingTransaction}
          onClose={() => setEditingTransaction(null)}
        />
      )}

      {editingInvoiceDateTransaction && canChangeInvoiceDate && (
        <InvoiceDateEditModal
          tx={editingInvoiceDateTransaction}
          onClose={() => setEditingInvoiceDateTransaction(null)}
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

      {selectedImageUrl && (
        <Modal
          open={!!selectedImageUrl}
          onClose={() => setSelectedImageUrl(null)}
          title="Bukti Transaksi"
          size="2xl"
        >
          <div className="flex justify-center items-center py-4 bg-surface-50 rounded-xl">
            <img
              src={selectedImageUrl}
              alt="Preview Bukti Transaksi"
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
              onError={(e) => {
                // If it fails to load here, maybe we show an error
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div className="flex justify-end mt-4">
            <a
              href={selectedImageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-xl transition-colors"
            >
              Buka di Tab Baru
            </a>
          </div>
        </Modal>
      )}
    </>
  );
}

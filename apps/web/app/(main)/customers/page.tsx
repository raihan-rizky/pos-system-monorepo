"use client";

import React, {
  lazy,
  Suspense,
  startTransition,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Receipt,
  RefreshCcw,
  Search,
  Sparkles,
  Users2,
  Wallet,
  X,
} from "lucide-react";
import {
  type CreateCustomerInput,
  type Customer,
  type CustomerType,
  useCreateCustomer,
  useCustomerDetail,
  useCustomerDpTransactions,
  useCustomers,
  useDeleteCustomer,
  usePayTransactionDebt,
  useUpdateCustomer,
} from "@/hooks/useCustomers";
import { useDebounce } from "@/hooks/useDebounce";
import { useRole } from "@/components/providers/RoleProvider";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import {
  shouldShowAction,
  shouldShowDeleteAction,
  shouldShowUpdateAction,
} from "@/features/rbac/helpers/rbac-ui";
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS } from "@/lib/customers";
import {
  getDebtQuickPaymentAmount,
  getTransactionDebtRemaining,
  isValidDebtPayment,
} from "@/features/customer-debt/helpers/debt-payment";
import { buildCustomerRecapRange } from "@/features/customer-recap/helpers/recap-core";
import type { CustomerRecapQuery } from "@/features/customer-recap/types/customer-recap";

const CustomerImportDrawer = lazy(() =>
  import("@/features/customer-import/components/CustomerImportDrawer").then(
    (mod) => ({ default: mod.CustomerImportDrawer }),
  ),
);

const CustomerRecapSection = lazy(() =>
  import("@/features/customer-recap/components/CustomerRecapSection").then(
    (mod) => ({ default: mod.CustomerRecapSection }),
  ),
);

const CustomerRecapPanel = lazy(() =>
  import("@/features/customer-recap/components/CustomerRecapPanel").then(
    (mod) => ({ default: mod.CustomerRecapPanel }),
  ),
);

const TYPE_CONFIG: Record<
  CustomerType,
  { label: string; className: string; accentClassName: string }
> = {
  UMUM: {
    label: "UMUM",
    className: "bg-slate-100 text-slate-700",
    accentClassName: "from-slate-200 to-slate-50",
  },
  AGEN: {
    label: "AGEN",
    className: "bg-emerald-100 text-emerald-700",
    accentClassName: "from-emerald-200 to-emerald-50",
  },
  INDUSTRI: {
    label: "INDUSTRI",
    className: "bg-amber-100 text-amber-700",
    accentClassName: "from-amber-200 to-amber-50",
  },
  PEMERINTAH: {
    label: "PEMERINTAH",
    className: "bg-sky-100 text-sky-700",
    accentClassName: "from-sky-200 to-sky-50",
  },
};

const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Tunai" },
  { value: "QRIS", label: "QRIS" },
  { value: "DEBIT", label: "Debit" },
  { value: "TRANSFER", label: "Transfer" },
] as const;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getVisitLabel(value: string | null): string {
  if (!value) return "Belum ada kunjungan";
  const visitDate = new Date(value);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - visitDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays <= 0) return "Aktif hari ini";
  if (diffDays === 1) return "Aktif kemarin";
  if (diffDays < 30) return `Aktif ${diffDays} hari lalu`;

  return `Terakhir ${formatDate(value)}`;
}

function TypeBadge({ type }: { type: CustomerType }) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.UMUM;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function DebtBadge({ amount }: { amount: number }) {
  if (amount <= 0) {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
        Aman
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">
      {formatCurrency(amount)}
    </span>
  );
}

function DetailMetricCard({
  label,
  value,
  tone = "slate",
  info,
}: {
  label: string;
  value: string;
  tone?: "slate" | "amber" | "emerald" | "sky";
  info?: string;
}) {
  const toneMap = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
  } as const;

  return (
    <div className={`min-w-0 rounded-2xl border p-3 sm:p-4 ${toneMap[tone]}`}>
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-current/70">
          {label}
        </p>
        {info && <InfoTooltip title={label} description={info} />}
      </div>
      <p className="mt-1.5 break-words text-base font-black sm:mt-2 sm:text-lg">{value}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: "slate" | "red" | "sky" | "amber";
}) {
  const toneMap = {
    slate:
      "border-slate-200 bg-white text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.06)]",
    red: "border-red-200 bg-gradient-to-br from-red-50 via-white to-red-100/70 text-red-950",
    sky: "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-sky-100/70 text-sky-950",
    amber:
      "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-100/70 text-amber-950",
  } as const;

  return (
    <div className={`min-w-0 rounded-[22px] border p-4 sm:rounded-[28px] sm:p-5 ${toneMap[tone]}`}>
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-current/60">
            {label}
          </p>
          <p className="break-words text-xl font-black leading-none sm:text-2xl">{value}</p>
          <p className="break-words text-xs leading-5 text-current/70 sm:text-sm">{hint}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm sm:h-12 sm:w-12">
          {icon}
        </div>
      </div>
    </div>
  );
}

interface PayDebtModalProps {
  customer: Customer;
  onClose: () => void;
}

type DpTransaction = {
  id: string;
  invoiceNumber: string | null;
  total: number;
  amountPaid: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  items: { productName: string; quantity: number; subtotal: number }[];
};

function PayDebtModal({ customer, onClose }: PayDebtModalProps) {
  const dpTransactionsQuery = useCustomerDpTransactions(customer.id);
  const payTransactionDebt = usePayTransactionDebt();
  const [amountByTransaction, setAmountByTransaction] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [noteByTransaction, setNoteByTransaction] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [payingTransactionId, setPayingTransactionId] = useState<string | null>(null);

  const dpTransactions = (dpTransactionsQuery.data ?? []) as DpTransaction[];
  const debt = dpTransactionsQuery.data
    ? dpTransactions.reduce(
      (sum, transaction) => sum + getTransactionDebtRemaining(transaction),
      0,
    )
    : Number(customer.totalDebt);

  const updateAmount = useCallback((transactionId: string, amount: number) => {
    setAmountByTransaction((current) => ({
      ...current,
      [transactionId]: amount,
    }));
  }, []);

  const updateNote = useCallback((transactionId: string, note: string) => {
    setNoteByTransaction((current) => ({
      ...current,
      [transactionId]: note,
    }));
  }, []);

  const handleSubmit = async (transaction: DpTransaction) => {
    setError("");

    const remaining = getTransactionDebtRemaining(transaction);
    const amount = Number(amountByTransaction[transaction.id] ?? 0);

    if (!isValidDebtPayment({ amount, remaining })) {
      setError("Jumlah pembayaran harus lebih dari 0 dan tidak melebihi sisa piutang.");
      return;
    }

    try {
      setPayingTransactionId(transaction.id);
      await payTransactionDebt.mutateAsync({
        transactionId: transaction.id,
        customerId: customer.id,
        amount,
        paymentMethod,
        note: noteByTransaction[transaction.id] || undefined,
      });
      updateAmount(transaction.id, 0);
      updateNote(transaction.id, "");
      await dpTransactionsQuery.refetch();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Gagal memproses pembayaran",
      );
    } finally {
      setPayingTransactionId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4 transition-all">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        {/* Header - Sticky */}
        <div className="relative z-10 flex flex-col gap-3 border-b border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600">
                <Receipt className="h-3.5 w-3.5" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-600">
                Bayar Piutang
              </p>
            </div>
            <h2 className="mt-2 break-words text-xl font-black text-slate-900">
              {customer.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 sm:px-4 sm:py-2 sm:text-sm sm:font-bold"
          >
            <span className="hidden sm:inline">Tutup</span>
            <X className="h-5 w-5 sm:hidden" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6">
          <div className="mx-auto w-full max-w-3xl space-y-6">
            {/* Summary Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-red-600 via-red-500 to-rose-600 p-6 text-white shadow-lg shadow-red-600/20">
              <div className="absolute -right-4 -top-4 opacity-10">
                <Wallet className="h-32 w-32" />
              </div>
              <div className="relative z-10">
                <p className="text-xs font-bold uppercase tracking-wider text-red-100">
                  Total Piutang Tersisa
                </p>
                <p className="mt-1 break-words text-3xl font-black tracking-tight sm:text-4xl">
                  {formatCurrency(debt)}
                </p>
                <p className="mt-3 text-sm font-medium text-red-100/90">
                  Silakan pilih invoice di bawah untuk mencatat pembayaran.
                </p>
              </div>
            </div>

            {error ? (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}

            {/* Payment Method */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="mb-3 block text-sm font-bold text-slate-700">
                Metode Pembayaran
              </label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value)}
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold transition-all ${
                      paymentMethod === option.value
                        ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Transactions List */}
            <div>
              {dpTransactionsQuery.isLoading ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                  <p className="mt-3 text-sm font-bold text-slate-600">
                    Memuat data tagihan...
                  </p>
                </div>
              ) : dpTransactions.length > 0 ? (
                <div className="space-y-4">
                  {dpTransactions.map((transaction) => {
                    const remaining = getTransactionDebtRemaining(transaction);
                    const amount = Number(amountByTransaction[transaction.id] ?? 0);
                    const canPay = isValidDebtPayment({ amount, remaining });
                    const isFullPayment = amount >= remaining && remaining > 0;
                    const isPaying = payingTransactionId === transaction.id;

                    return (
                      <div
                        key={transaction.id}
                        className="overflow-hidden rounded-3xl border border-slate-200 bg-white transition-shadow hover:shadow-md"
                      >
                        {/* Transaction Info */}
                        <div className="p-5">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                                  INVOICE
                                </span>
                                <p className="break-words text-sm font-black text-slate-900">
                                  {transaction.invoiceNumber || transaction.id}
                                </p>
                              </div>
                              <p className="mt-1.5 text-xs font-semibold text-slate-500">
                                {formatDateTime(transaction.createdAt)} •{" "}
                                {transaction.paymentMethod}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {transaction.items.slice(0, 2).map((item) => (
                                  <span
                                    key={`${transaction.id}-${item.productName}`}
                                    className="inline-flex max-w-full rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600"
                                  >
                                    <span className="truncate">
                                      {item.productName} ×{item.quantity}
                                    </span>
                                  </span>
                                ))}
                                {transaction.items.length > 2 ? (
                                  <span className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                                    +{transaction.items.length - 2} item
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex gap-4 text-sm sm:flex-col sm:gap-2 sm:text-right">
                              <div>
                                <p className="text-xs font-medium text-slate-500">
                                  Sisa Tagihan
                                </p>
                                <p className="font-black text-amber-600">
                                  {formatCurrency(remaining)}
                                </p>
                              </div>
                              <div className="h-px w-full bg-slate-100 hidden sm:block"></div>
                              <div>
                                <p className="text-xs font-medium text-slate-500">
                                  Total: {formatCurrency(Number(transaction.total))}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Payment Input Area */}
                        <div className="border-t border-slate-100 bg-slate-50/80 p-5">
                          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_auto] lg:items-start">
                            <div>
                              <label className="mb-1.5 block text-xs font-bold text-slate-700">
                                Nominal Pembayaran
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                                  Rp
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={remaining}
                                  value={amount || ""}
                                  onChange={(event) =>
                                    updateAmount(
                                      transaction.id,
                                      Number(event.target.value) || 0,
                                    )
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-bold text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                                  placeholder="0"
                                />
                              </div>
                              <div className="mt-2 flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateAmount(
                                      transaction.id,
                                      getDebtQuickPaymentAmount(remaining, "half"),
                                    )
                                  }
                                  className="rounded-lg bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700 transition hover:bg-amber-200"
                                >
                                  Bayar 50%
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateAmount(
                                      transaction.id,
                                      getDebtQuickPaymentAmount(remaining, "full"),
                                    )
                                  }
                                  className="rounded-lg bg-red-100 px-2.5 py-1 text-[10px] font-bold text-red-700 transition hover:bg-red-200"
                                >
                                  LUNAS
                                </button>
                              </div>
                            </div>

                            <div>
                              <label className="mb-1.5 block text-xs font-bold text-slate-700">
                                Catatan
                              </label>
                              <input
                                value={noteByTransaction[transaction.id] ?? ""}
                                onChange={(event) =>
                                  updateNote(transaction.id, event.target.value)
                                }
                                placeholder="Opsional"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSubmit(transaction)}
                              disabled={!canPay || payTransactionDebt.isPending}
                              className="mt-2 w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:mt-0 lg:mt-[22px] lg:w-auto"
                            >
                              {isPaying ? (
                                <span className="flex items-center justify-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />{" "}
                                  Proses
                                </span>
                              ) : isFullPayment ? (
                                "Lunaskan"
                              ) : (
                                "Bayar"
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-900">
                    Semua Tagihan Lunas
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Pelanggan ini tidak memiliki piutang aktif.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FormModalProps {
  initial?: Customer | null;
  onClose: () => void;
}

function CustomerFormModal({ initial, onClose }: FormModalProps) {
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const isPending = createCustomer.isPending || updateCustomer.isPending;
  const [error, setError] = useState("");
  const [form, setForm] = useState<CreateCustomerInput>({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    company: initial?.company ?? "",
    address: initial?.address ?? "",
    type: initial?.type ?? "UMUM",
    notes: initial?.notes ?? "",
  });

  const updateField = useCallback(
    (field: keyof CreateCustomerInput, value: string) => {
      setForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      if (initial) {
        await updateCustomer.mutateAsync({ id: initial.id, ...form });
      } else {
        await createCustomer.mutateAsync(form);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan data");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 backdrop-blur-sm sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-[30px] border border-white/70 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-600">
              {initial ? "Edit Pelanggan" : "Tambah Pelanggan"}
            </p>
            <h2 className="mt-1 break-words text-xl font-black text-slate-900">
              {initial ? initial.name : "Bangun profil pelanggan baru"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Simpan identitas, tipe akun, dan catatan agar proses checkout lebih
              cepat.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            Tutup
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-4 sm:p-6">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Nama Pelanggan
              </label>
              <input
                required
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
                placeholder="Nama yang tampil di transaksi"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                No. HP / WhatsApp
              </label>
              <input
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="08xx / +628xx"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="nama@perusahaan.com"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Perusahaan / Instansi
              </label>
              <input
                value={form.company}
                onChange={(event) => updateField("company", event.target.value)}
                placeholder="Opsional"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Tipe Pelanggan
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {CUSTOMER_TYPES.map((type) => {
                  const config = TYPE_CONFIG[type];
                  const active = form.type === type;

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => updateField("type", type)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${active
                        ? "border-brand-500 bg-brand-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                    >
                      <p className="text-sm font-bold text-slate-900">
                        {CUSTOMER_TYPE_LABELS[type]}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {type === "UMUM"
                          ? "Untuk pelanggan harian dan transaksi cepat."
                          : type === "AGEN"
                            ? "Cocok untuk reseller dan akun repeat order."
                            : type === "INDUSTRI"
                              ? "Untuk perusahaan yang butuh profil resmi."
                              : "Untuk sekolah, kantor, atau instansi pemerintah."}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Alamat
              </label>
              <textarea
                rows={3}
                value={form.address}
                onChange={(event) => updateField("address", event.target.value)}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
                placeholder="Alamat pengiriman atau penagihan"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Catatan
              </label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
                placeholder="Catatan preferensi, termin pembayaran, atau informasi penting lainnya"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Menyimpan..." : "Simpan Pelanggan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomerListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-[28px] border border-slate-200 bg-white p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-4">
              <div className="h-12 w-12 rounded-2xl bg-slate-100" />
              <div className="min-w-0 space-y-2">
                <div className="h-4 w-32 rounded bg-slate-100 sm:w-40" />
                <div className="h-3 w-28 rounded bg-slate-100" />
                <div className="h-3 w-32 rounded bg-slate-100" />
              </div>
            </div>
            <div className="h-8 w-24 rounded-full bg-slate-100" />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="h-16 rounded-2xl bg-slate-50" />
            <div className="h-16 rounded-2xl bg-slate-50" />
            <div className="h-16 rounded-2xl bg-slate-50" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface CustomerListCardProps {
  customer: Customer;
  isSelected: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onSelect: (customerId: string) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
  onPayDebt: (customer: Customer) => void;
}

function CustomerListCard({
  customer,
  isSelected,
  canUpdate,
  canDelete,
  onSelect,
  onEdit,
  onDelete,
  onPayDebt,
}: CustomerListCardProps) {
  const debt = Number(customer.totalDebt);
  const spent = Number(customer.totalSpent);
  const accent = TYPE_CONFIG[customer.type] ?? TYPE_CONFIG.UMUM;
  const handleSelect = useCallback(() => {
    onSelect(customer.id);
  }, [customer.id, onSelect]);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleSelect();
      }
    },
    [handleSelect],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      className={`group min-w-0 w-full rounded-[24px] border p-3.5 text-left transition sm:rounded-[28px] sm:p-5 ${isSelected
        ? "border-brand-400 bg-white shadow-[0_20px_50px_rgba(37,99,235,0.12)]"
        : "border-slate-200 bg-white/90 hover:border-slate-300 hover:bg-white"
        }`}
    >
      <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 gap-3 sm:gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-black text-slate-800 sm:h-14 sm:w-14 ${accent.accentClassName}`}
          >
            {getInitials(customer.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <p className="min-w-0 break-words text-[15px] font-black leading-tight text-slate-900 sm:text-base">
                {customer.name}
              </p>
              <TypeBadge type={customer.type} />
            </div>
            <div className="mt-1.5 flex flex-col gap-y-1 text-xs text-slate-500 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:text-sm">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                <span className="truncate">{customer.phone ?? "Tanpa nomor HP"}</span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                <span className="truncate">{customer.email ?? "Tanpa email"}</span>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs sm:gap-2">
              {customer.company ? (
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="truncate">{customer.company}</span>
                </span>
              ) : null}
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-500">
                {getVisitLabel(customer.lastVisitAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-2 xl:justify-end">
          <DebtBadge amount={debt} />
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white sm:px-3">
            Lihat Detail
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>

      <div className="mt-3 grid min-w-0 grid-cols-3 gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
        <DetailMetricCard 
          label="Total Belanja" 
          value={formatCurrency(spent)} 
          info="Total akumulasi pembelanjaan (omzet) dari seluruh pesanan pelanggan ini." 
        />
        <DetailMetricCard
          label="Total Order"
          value={`${customer.totalOrders} transaksi`}
          tone="sky"
          info="Jumlah total transaksi yang pernah dilakukan oleh pelanggan ini."
        />
        <DetailMetricCard
          label="Piutang"
          value={debt > 0 ? formatCurrency(debt) : "Tidak ada"}
          tone={debt > 0 ? "amber" : "emerald"}
          info="Sisa hutang atau tagihan yang belum dilunasi oleh pelanggan."
        />
      </div>

      {(canUpdate || canDelete || debt > 0) ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:mt-4 sm:flex sm:flex-wrap sm:pt-4">
          {debt > 0 && canUpdate ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPayDebt(customer);
              }}
              className="rounded-full bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 sm:py-1.5"
            >
              Bayar Piutang
            </button>
          ) : null}
          {canUpdate ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(customer);
              }}
              className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-brand-50 hover:text-brand-700 sm:py-1.5"
            >
              Ubah Data
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(customer);
              }}
              className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-red-50 hover:text-red-700 sm:py-1.5"
            >
              Hapus
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CustomerDetailPanel({
  customerId,
  fallbackCustomer,
  canUpdate,
  onClose,
  onEdit,
  onPayDebt,
  recapRange,
}: {
  customerId: string | null;
  fallbackCustomer: Customer | null;
  canUpdate: boolean;
  onClose: () => void;
  onEdit: (customer: Customer) => void;
  onPayDebt: (customer: Customer) => void;
  recapRange: CustomerRecapQuery;
}) {
  const detailQuery = useCustomerDetail(customerId);
  const detailCustomer = detailQuery.data;
  const customer = fallbackCustomer;

  if (!customerId || !customer) {
    return (
      <div className="rounded-[32px] border border-dashed border-slate-300 bg-white/70 p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Users2 className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-black text-slate-900">
          Pilih pelanggan untuk melihat detail
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Panel ini menampilkan informasi kontak, piutang, dan transaksi terbaru
          agar tim bisa menindaklanjuti pelanggan tanpa pindah halaman.
        </p>
      </div>
    );
  }

  const displayName = detailCustomer?.name ?? customer.name;
  const debtAmount = Number(detailCustomer?.totalDebt ?? customer.totalDebt);
  const spentAmount = Number(detailCustomer?.totalSpent ?? customer.totalSpent);
  const transactions = detailCustomer?.transactions ?? [];
  const type = detailCustomer?.type ?? customer.type;
  const company = detailCustomer?.company ?? customer.company;
  const phone = detailCustomer?.phone ?? customer.phone;
  const email = detailCustomer?.email ?? customer.email;
  const address = detailCustomer?.address ?? customer.address;
  const notes = detailCustomer?.notes ?? customer.notes;
  const lastVisitAt = detailCustomer?.lastVisitAt ?? customer.lastVisitAt;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <aside className="max-h-[92dvh] w-full max-w-5xl min-w-0 overflow-y-auto rounded-t-[30px] border border-white/70 bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-[32px] sm:p-6">
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 pb-4 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand-600">
            Detail Pelanggan
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Riwayat, kontak, dan tindakan akun.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Tutup
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3 sm:gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br text-base font-black text-slate-800 sm:h-16 sm:w-16 sm:rounded-[22px] sm:text-lg ${(TYPE_CONFIG[type] ?? TYPE_CONFIG.UMUM).accentClassName
              }`}
          >
            {getInitials(displayName)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-lg font-black text-slate-900 sm:text-xl">
                {displayName}
              </h2>
              <TypeBadge type={type} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{getVisitLabel(lastVisitAt)}</p>
            {company ? (
              <p className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                <Building2 className="h-3.5 w-3.5" />
                <span className="truncate">{company}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {debtAmount > 0 && canUpdate ? (
            <button
              type="button"
              onClick={() => onPayDebt(customer)}
              className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 sm:flex-none"
            >
              Bayar Piutang
            </button>
          ) : null}
          {canUpdate ? (
            <button
              type="button"
              onClick={() => onEdit(customer)}
              className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:flex-none"
            >
              Ubah Profil
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-2 sm:mt-6 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
        <DetailMetricCard
          label="Total Belanja"
          value={formatCurrency(spentAmount)}
          tone="slate"
          info="Total akumulasi pembelanjaan (omzet) dari seluruh pesanan pelanggan ini."
        />
        <DetailMetricCard
          label="Total Order"
          value={`${detailCustomer?.totalOrders ?? customer.totalOrders} transaksi`}
          tone="sky"
          info="Jumlah total transaksi yang pernah dilakukan oleh pelanggan ini."
        />
        <DetailMetricCard
          label="Piutang"
          value={debtAmount > 0 ? formatCurrency(debtAmount) : "Tidak ada"}
          tone={debtAmount > 0 ? "amber" : "emerald"}
          info="Sisa hutang atau tagihan yang belum dilunasi oleh pelanggan."
        />
      </div>

      <Suspense
        fallback={
          <div className="mt-5 h-80 rounded-3xl border border-slate-200 bg-slate-50 sm:mt-6" />
        }
      >
        <CustomerRecapPanel customerId={customerId} range={recapRange} />
      </Suspense>

      <div className="mt-5 grid gap-3 sm:mt-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
            Kontak Utama
          </p>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p className="flex min-w-0 items-center gap-2">
              <Phone className="h-4 w-4 text-slate-400" />
              <span className="truncate">{phone ?? "Belum ada nomor HP"}</span>
            </p>
            <p className="flex min-w-0 items-center gap-2">
              <Mail className="h-4 w-4 text-slate-400" />
              <span className="truncate">{email ?? "Belum ada email"}</span>
            </p>
            <p className="flex min-w-0 items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
              <span className="min-w-0 break-words">{address ?? "Belum ada alamat"}</span>
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
            Catatan Internal
          </p>
          <p className="mt-3 break-words text-sm leading-6 text-slate-600">
            {notes || "Belum ada catatan untuk pelanggan ini."}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-white sm:mt-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Riwayat Transaksi
            </p>
            <h3 className="mt-1 text-base font-black text-slate-900">
              Aktivitas terbaru pelanggan
            </h3>
          </div>
          {detailQuery.isFetching ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
              Memuat
            </span>
          ) : null}
        </div>

        <div className="divide-y divide-slate-100">
          {transactions.length > 0 ? (
            transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="space-y-3 px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold text-slate-900">
                      {transaction.invoiceNumber || transaction.id}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(transaction.createdAt)}
                    </p>
                  </div>
                  <div className="min-w-0 text-left sm:text-right">
                    <p className="text-sm font-black text-slate-900">
                      {formatCurrency(Number(transaction.total))}
                    </p>
                    <p className="mt-1 break-words text-xs font-semibold text-slate-500">
                      {[transaction.paymentMethod, transaction.status].join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {transaction.items.slice(0, 3).map((item) => (
                    <span
                      key={`${transaction.id}-${item.productName}`}
                      className="inline-flex max-w-full rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
                    >
                      <span className="truncate">
                        {item.productName} x{item.quantity}
                      </span>
                    </span>
                  ))}
                  {transaction.items.length > 3 ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                      +{transaction.items.length - 3} item lain
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-bold text-slate-900">
                Belum ada transaksi tercatat
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Setelah pelanggan dipakai di transaksi, riwayat akan muncul di
                sini.
              </p>
            </div>
          )}
        </div>
      </div>
      </aside>
    </div>
  );
}

export default function CustomersPage() {
  const { canPerform } = useRole();
  const canCreateCustomers = shouldShowAction("customer", "create", canPerform);
  const canUpdateCustomers = shouldShowUpdateAction("customer", canPerform);
  const canDeleteCustomers = shouldShowDeleteAction("customer", canPerform);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<CustomerType | "">("");
  const [hasDebtFilter, setHasDebtFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [debtTarget, setDebtTarget] = useState<Customer | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [recapRange, setRecapRange] = useState<CustomerRecapQuery>(() =>
    buildCustomerRecapRange("month"),
  );

  const deferredSearch = useDeferredValue(search);
  const debouncedSearch = useDebounce(deferredSearch, 250);
  const deleteCustomer = useDeleteCustomer();

  const { data, isLoading, isFetching } = useCustomers({
    search: debouncedSearch,
    type: typeFilter,
    hasDebt: hasDebtFilter,
    page,
    limit: 20,
  });

  const customers = useMemo(() => data?.data ?? [], [data?.data]);

  const selectedCustomer = useMemo(
    () =>
      customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const metrics = useMemo(() => {
    const totalDebtVisible = customers.reduce(
      (sum, customer) => sum + Number(customer.totalDebt),
      0,
    );
    const totalSpentVisible = customers.reduce(
      (sum, customer) => sum + Number(customer.totalSpent),
      0,
    );
    const debtCustomerCount = customers.filter(
      (customer) => Number(customer.totalDebt) > 0,
    ).length;
    const businessCustomerCount = customers.filter(
      (customer) => Boolean(customer.company) || customer.type !== "UMUM",
    ).length;
    const activeThirtyDayCount = customers.filter((customer) => {
      if (!customer.lastVisitAt) return false;
      const diffDays =
        (Date.now() - new Date(customer.lastVisitAt).getTime()) /
        (1000 * 60 * 60 * 24);
      return diffDays <= 30;
    }).length;

    return {
      totalDebtVisible,
      totalSpentVisible,
      debtCustomerCount,
      businessCustomerCount,
      activeThirtyDayCount,
    };
  }, [customers]);

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value);
      startTransition(() => {
        setPage(1);
      });
    },
    [],
  );

  const handleTypeFilterChange = useCallback((nextType: CustomerType | "") => {
    startTransition(() => {
      setTypeFilter(nextType);
      setPage(1);
    });
  }, []);

  const handleDebtFilterToggle = useCallback(() => {
    startTransition(() => {
      setHasDebtFilter((prev) => !prev);
      setPage(1);
    });
  }, []);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      startTransition(() => {
        setPage(nextPage);
      });
    },
    [],
  );

  const openCreateModal = useCallback(() => {
    if (!canCreateCustomers) return;
    setEditTarget(null);
    setModalOpen(true);
  }, [canCreateCustomers]);

  const openEditModal = useCallback(
    (customer: Customer) => {
      if (!canUpdateCustomers) return;
      setEditTarget(customer);
      setModalOpen(true);
    },
    [canUpdateCustomers],
  );

  const closeFormModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleDeleteCustomer = useCallback(
    async (customer: Customer) => {
      if (!canDeleteCustomers) return;
      if (!confirm(`Hapus pelanggan "${customer.name}"?`)) return;
      await deleteCustomer.mutateAsync(customer.id);
    },
    [canDeleteCustomers, deleteCustomer],
  );

  const hasActiveFilters = search.trim().length > 0 || typeFilter !== "" || hasDebtFilter;

  return (
    <div className="min-h-full overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_24%),linear-gradient(180deg,_#fffdf8_0%,_#f8fafc_34%,_#f8fafc_100%)]">
      <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-4 px-3 py-3 sm:gap-6 sm:px-6 sm:py-4 lg:px-8">
        <section className="min-w-0 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_30px_70px_rgba(15,23,42,0.08)] sm:rounded-[34px]">
          <div className="relative px-4 py-4 sm:px-6 sm:py-7 lg:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.16),_transparent_26%),radial-gradient(circle_at_bottom_left,_rgba(245,158,11,0.14),_transparent_22%)]" />
            <div className="relative flex min-w-0 flex-col gap-4 sm:gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
              <div className="min-w-0 max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 sm:text-xs sm:tracking-[0.2em]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Customer Workspace
                </div>
                <h1 className="mt-3 max-w-2xl text-balance text-lg font-black leading-tight text-slate-950 sm:mt-4 sm:text-3xl lg:text-4xl">
                  Kelola pelanggan, pantau piutang, dan baca riwayat transaksi.
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:mt-3 sm:text-base sm:leading-7">
                  Fokus ke pelanggan yang aktif, akun bisnis, dan piutang yang
                  perlu ditindaklanjuti.
                </p>
              </div>

              {canCreateCustomers ? (
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setImportOpen(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto sm:px-4 sm:py-3 sm:text-sm"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Import Excel
                  </button>
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-700 sm:w-auto sm:px-5 sm:py-3 sm:text-sm"
                  >
                    <Users2 className="h-4 w-4" />
                    Tambah Pelanggan
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <Suspense
          fallback={
            <section className="h-[520px] rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:rounded-[32px]" />
          }
        >
          <CustomerRecapSection
            range={recapRange}
            onRangeChange={setRecapRange}
            onSelectCustomer={setSelectedCustomerId}
          />
        </Suspense>

        <section className="min-w-0 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-5">
          <div className="flex min-w-0 flex-col gap-3 sm:gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Cari nama pelanggan, nomor HP, email, atau perusahaan..."
                  className="w-full rounded-[20px] border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100 sm:rounded-[22px]"
                />
              </div>
            </div>

            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch] 2xl:mx-0 2xl:flex-wrap 2xl:overflow-visible 2xl:px-0">
              <button
                type="button"
                onClick={() => handleTypeFilterChange("")}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold transition ${typeFilter === ""
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
              >
                Semua
              </button>
              {CUSTOMER_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeFilterChange(type)}
                    className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold transition ${typeFilter === type
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                >
                  {CUSTOMER_TYPE_LABELS[type]}
                </button>
              ))}
              <div className="mx-1 h-8 w-px self-center bg-slate-200" />
              <button
                type="button"
                onClick={handleDebtFilterToggle}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition ${hasDebtFilter
                  ? "bg-red-600 text-white"
                  : "bg-red-50 text-red-700 hover:bg-red-100"
                  }`}
              >
                <Wallet className="h-3.5 w-3.5" />
                Ada Piutang
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:pt-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="max-w-full break-words rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 sm:text-sm">
                {data?.pagination.total ?? 0} pelanggan
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 sm:text-sm">
                Nilai belanja terlihat {formatCurrency(metrics.totalSpentVisible)}
              </span>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    handleTypeFilterChange("");
                  }}
                  className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 sm:text-sm"
                >
                  Reset filter
                </button>
              ) : null}
            </div>

            {isFetching ? (
              <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
                Memperbarui hasil...
              </div>
            ) : null}
          </div>
        </section>

        <section className="min-w-0">
          <div className="min-w-0 space-y-4">
            {isLoading ? (
              <CustomerListSkeleton />
            ) : customers.length === 0 ? (
              <div className="rounded-[32px] border border-dashed border-slate-300 bg-white/80 px-6 py-14 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-100 text-slate-500">
                  <Users2 className="h-7 w-7" />
                </div>
                <h2 className="mt-5 text-2xl font-black text-slate-900">
                  Belum ada pelanggan yang cocok
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
                  {hasActiveFilters
                    ? "Hasil pencarian masih kosong. Coba ubah kata kunci atau reset tipe pelanggan."
                    : "Bangun database pelanggan lebih rapi agar checkout, nota penawaran, dan follow-up piutang lebih cepat."}
                </p>
                {canCreateCustomers ? (
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
                    >
                      Tambah pelanggan pertama
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportOpen(true)}
                      className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Import dari Excel
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="grid min-w-0 gap-3 sm:gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {customers.map((customer) => (
                    <CustomerListCard
                      key={customer.id}
                      customer={customer}
                      isSelected={customer.id === selectedCustomerId}
                      canUpdate={canUpdateCustomers}
                      canDelete={canDeleteCustomers}
                      onSelect={setSelectedCustomerId}
                      onEdit={openEditModal}
                      onDelete={handleDeleteCustomer}
                      onPayDebt={setDebtTarget}
                    />
                  ))}
                </div>

                {(data?.pagination.totalPages ?? 1) > 1 ? (
                  <div className="flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="text-sm text-slate-500">
                      Halaman{" "}
                      <span className="font-bold text-slate-900">
                        {data?.pagination.page}
                      </span>{" "}
                      dari{" "}
                      <span className="font-bold text-slate-900">
                        {data?.pagination.totalPages}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => handlePageChange(page - 1)}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Sebelumnya
                      </button>
                      <button
                        type="button"
                        disabled={page >= (data?.pagination.totalPages ?? 1)}
                        onClick={() => handlePageChange(page + 1)}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
                      >
                        Berikutnya
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

        </section>
      </div>

      {selectedCustomerId && selectedCustomer ? (
        <CustomerDetailPanel
          customerId={selectedCustomerId}
          fallbackCustomer={selectedCustomer}
          canUpdate={canUpdateCustomers}
          onClose={() => setSelectedCustomerId(null)}
          onEdit={openEditModal}
          onPayDebt={setDebtTarget}
          recapRange={recapRange}
        />
      ) : null}

      {modalOpen && (editTarget ? canUpdateCustomers : canCreateCustomers) ? (
        <CustomerFormModal initial={editTarget} onClose={closeFormModal} />
      ) : null}

      {debtTarget && canUpdateCustomers ? (
        <PayDebtModal
          customer={debtTarget}
          onClose={() => setDebtTarget(null)}
        />
      ) : null}

      <Suspense
        fallback={
          <div className="fixed inset-0 z-40 bg-slate-950/10 backdrop-blur-[2px]" />
        }
      >
        {importOpen && canCreateCustomers ? (
          <CustomerImportDrawer
            open={importOpen}
            onClose={() => setImportOpen(false)}
          />
        ) : null}
      </Suspense>
    </div>
  );
}

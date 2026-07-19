"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Activity,
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  Edit3,
  Plus,
  ReceiptText,
  Search,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Card } from "@pos/ui";
import { useRole } from "@/components/providers/RoleProvider";
import { useAssistantModalAction } from "@/features/ai-assistant/hooks/useAssistantModalAction";
import { shouldShowAction, shouldShowUpdateAction } from "@/features/rbac/helpers/rbac-ui";
import {
  createSalesperson,
  listSalespersonTransactions,
  listSalespersons,
  updateSalesperson,
  type Salesperson,
  type SalespersonTransaction,
} from "@/features/salespersons/api/salespersons-api";
import { getLogger } from "@/lib/logger";

const log = getLogger("page:main:salespersons");

type FilterStatus = "all" | "active" | "inactive";

interface TransactionLoadState {
  error: string | null;
  items: SalespersonTransaction[];
  loading: boolean;
}

interface StatusToggleProps {
  checked: boolean;
  disabled?: boolean;
  id: string;
  onChange: () => void;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  tone: "blue" | "green" | "orange" | "purple";
  value: string | number;
}

const filterLabels: Record<FilterStatus, string> = {
  all: "Semua",
  active: "Aktif",
  inactive: "Nonaktif",
};

const statToneClasses: Record<StatCardProps["tone"], string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  orange: "bg-orange-50 text-orange-700 ring-orange-100",
  purple: "bg-violet-50 text-violet-700 ring-violet-100",
};

function formatNumber(value: number): string {
  return value.toLocaleString("id-ID");
}

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "S";
}

function getErrorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    COMPLETED: "Lunas",
    DP: "DP",
    PENDING_APPROVAL: "Menunggu approval",
    VOIDED: "Dibatalkan",
    REFUNDED: "Refund",
    DRAFT: "Draft",
  };

  return labels[status] ?? status;
}

function StatusToggle({
  checked,
  disabled = false,
  id,
  onChange,
}: StatusToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-2 ${
        checked ? "bg-emerald-500" : "bg-surface-300"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function StatCard({ icon, label, tone, value }: StatCardProps) {
  return (
    <Card className="min-h-[104px] rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
      <div className="flex h-full items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-surface-500">
            {label}
          </p>
          <p className="mt-2 truncate text-2xl font-extrabold text-surface-950">
            {value}
          </p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${statToneClasses[tone]}`}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

export default function SalespersonsPage() {
  const { canPerform } = useRole();
  const canCreateSalespersons = shouldShowAction("salesperson", "create", canPerform);
  const canUpdateSalespersons = shouldShowUpdateAction("salesperson", canPerform);

  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [expandedSalespersonId, setExpandedSalespersonId] = useState<string | null>(null);
  const [transactionsBySalesperson, setTransactionsBySalesperson] = useState<
    Record<string, TransactionLoadState | undefined>
  >({});

  const fetchSalespersons = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setPageError(null);

    try {
      const nextSalespersons = await listSalespersons(signal);
      setSalespersons(nextSalespersons);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;

      log.error("Error fetching salespersons:", error);
      setPageError("Gagal memuat data sales. Coba muat ulang halaman.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchSalespersons(controller.signal);
    return () => controller.abort();
  }, [fetchSalespersons]);

  const totalSales = salespersons.length;
  const activeSales = useMemo(
    () => salespersons.filter((salesperson) => salesperson.isActive).length,
    [salespersons]
  );
  const inactiveSales = totalSales - activeSales;
  const totalTransactions = useMemo(
    () =>
      salespersons.reduce(
        (sum, salesperson) => sum + (salesperson._count?.transactions ?? 0),
        0
      ),
    [salespersons]
  );
  const topPerformer = useMemo(
    () =>
      salespersons.reduce<Salesperson | undefined>((top, salesperson) => {
        const currentTotal = salesperson._count?.transactions ?? 0;
        const topTotal = top?._count?.transactions ?? -1;
        return currentTotal > topTotal ? salesperson : top;
      }, undefined),
    [salespersons]
  );
  const filteredSalespersons = useMemo(
    () =>
      salespersons.filter((salesperson) => {
        const matchesSearch = salesperson.name
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase());
        const matchesStatus =
          filterStatus === "all" ||
          (filterStatus === "active" && salesperson.isActive) ||
          (filterStatus === "inactive" && !salesperson.isActive);

        return matchesSearch && matchesStatus;
      }),
    [filterStatus, salespersons, searchQuery]
  );

  const resetModal = useCallback((): void => {
    setIsModalOpen(false);
    setEditingId(null);
    setName("");
    setIsActive(true);
    setErrorMessage(null);
    setSaving(false);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const trimmedName = name.trim();
      if (!trimmedName || saving) return;

      setSaving(true);
      setErrorMessage(null);

      try {
        if (editingId) {
          await updateSalesperson(editingId, {
            name: trimmedName,
            isActive,
          });
        } else {
          await createSalesperson({
            name: trimmedName,
            isActive,
          });
        }

        resetModal();
        await fetchSalespersons();
      } catch (error) {
        log.error("Error saving salesperson:", error);
        setErrorMessage(getErrorText(error, "Gagal menyimpan sales"));
        setSaving(false);
      }
    },
    [editingId, fetchSalespersons, isActive, name, resetModal, saving]
  );

  const handleQuickToggle = useCallback(
    async (salesperson: Salesperson): Promise<void> => {
      if (!canUpdateSalespersons || togglingId) return;

      setTogglingId(salesperson.id);
      setPageError(null);

      try {
        await updateSalesperson(salesperson.id, {
          isActive: !salesperson.isActive,
        });
        setSalespersons((current) =>
          current.map((item) =>
            item.id === salesperson.id
              ? { ...item, isActive: !salesperson.isActive }
              : item
          )
        );
      } catch (error) {
        log.error("Error toggling status:", error);
        setPageError(getErrorText(error, "Gagal mengubah status sales"));
      } finally {
        setTogglingId(null);
      }
    },
    [canUpdateSalespersons, togglingId]
  );

  const openEditModal = useCallback(
    (salesperson: Salesperson): void => {
      if (!canUpdateSalespersons) return;
      setEditingId(salesperson.id);
      setName(salesperson.name);
      setIsActive(salesperson.isActive);
      setErrorMessage(null);
      setIsModalOpen(true);
    },
    [canUpdateSalespersons]
  );

  const openAddModal = useCallback((): void => {
    if (!canCreateSalespersons) return;
    setEditingId(null);
    setName("");
    setIsActive(true);
    setErrorMessage(null);
    setIsModalOpen(true);
  }, [canCreateSalespersons]);
  useAssistantModalAction("salesperson-create", openAddModal);

  const loadTransactionsForSalesperson = useCallback(
    async (salespersonId: string): Promise<void> => {
      const currentState = transactionsBySalesperson[salespersonId];
      if (currentState?.loading || (currentState?.items.length ?? 0) > 0) return;

      setTransactionsBySalesperson((current) => ({
        ...current,
        [salespersonId]: {
          error: null,
          items: current[salespersonId]?.items ?? [],
          loading: true,
        },
      }));

      try {
        const transactions = await listSalespersonTransactions(salespersonId);
        setTransactionsBySalesperson((current) => ({
          ...current,
          [salespersonId]: {
            error: null,
            items: transactions,
            loading: false,
          },
        }));
      } catch (error) {
        log.error("Error fetching salesperson transactions:", error);
        setTransactionsBySalesperson((current) => ({
          ...current,
          [salespersonId]: {
            error: getErrorText(error, "Gagal memuat transaksi sales"),
            items: current[salespersonId]?.items ?? [],
            loading: false,
          },
        }));
      }
    },
    [transactionsBySalesperson]
  );

  const toggleSalespersonTransactions = useCallback(
    (salespersonId: string): void => {
      setExpandedSalespersonId((current) => {
        if (current === salespersonId) return null;
        void loadTransactionsForSalesperson(salespersonId);
        return salespersonId;
      });
    },
    [loadTransactionsForSalesperson]
  );

  const renderTransactionPanel = useCallback(
    (salesperson: Salesperson): React.ReactNode => {
      const state = transactionsBySalesperson[salesperson.id];

      return (
        <div className="rounded-xl border border-surface-200 bg-surface-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-surface-950">
                Transaksi {salesperson.name}
              </p>
              <p className="mt-1 text-xs font-semibold text-surface-500">
                Menampilkan maksimal 20 transaksi terbaru
              </p>
            </div>
            <ReceiptText className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
          </div>

          {state?.loading ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 rounded-lg bg-white animate-pulse"
                />
              ))}
            </div>
          ) : state?.error ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {state.error}
            </div>
          ) : state?.items.length ? (
            <div className="mt-3 divide-y divide-surface-200 overflow-hidden rounded-lg border border-surface-200 bg-white">
              {state.items.map((transaction) => (
                <div
                  key={transaction.id}
                  className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-extrabold text-surface-950">
                        {transaction.invoiceNumber ?? transaction.draftNumber ?? transaction.id}
                      </p>
                      <span className="rounded-full bg-surface-100 px-2 py-0.5 text-[11px] font-bold text-surface-600">
                        {formatStatus(transaction.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-surface-500">
                      {transaction.customerName || "Pelanggan Umum"} · {formatDateTime(transaction.createdAt)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-extrabold text-surface-950">
                      {formatCurrency(Number(transaction.total))}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-surface-500">
                      {transaction.paymentMethod}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-surface-300 bg-white p-4 text-sm font-semibold text-surface-500">
              Belum ada transaksi untuk sales ini.
            </div>
          )}
        </div>
      );
    },
    [transactionsBySalesperson]
  );

  return (
    <>
      <main className="flex-1 overflow-y-auto bg-surface-50/40">
        <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 md:px-8 md:pb-10 md:pt-8">
          <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Manajemen sales
              </div>
              <h1 className="mt-3 text-2xl font-extrabold text-surface-950 sm:text-3xl">
                Tim Sales
              </h1>
              <p className="mt-2 text-sm leading-6 text-surface-500">
                Kelola anggota sales yang muncul saat checkout dan pantau kontribusi transaksi mereka.
              </p>
            </div>

            {canCreateSalespersons && (
              <button
                id="add-salesperson-btn"
                onClick={openAddModal}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-2 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Tambah Sales
              </button>
            )}
          </section>

          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
              label="Total Sales"
              tone="blue"
              value={loading ? "..." : formatNumber(totalSales)}
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
              label="Aktif"
              tone="green"
              value={loading ? "..." : formatNumber(activeSales)}
            />
            <StatCard
              icon={<Activity className="h-5 w-5" aria-hidden="true" />}
              label="Transaksi"
              tone="orange"
              value={loading ? "..." : formatNumber(totalTransactions)}
            />
            <StatCard
              icon={<UserRound className="h-5 w-5" aria-hidden="true" />}
              label="Top Performer"
              tone="purple"
              value={loading ? "..." : topPerformer?.name ?? "-"}
            />
          </section>

          <section className="mt-5 rounded-xl border border-surface-200 bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400"
                  aria-hidden="true"
                />
                <input
                  id="salesperson-search"
                  type="text"
                  placeholder="Cari nama sales..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-11 w-full rounded-lg border border-surface-200 bg-surface-50 pl-10 pr-4 text-sm text-surface-900 transition placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div className="grid grid-cols-3 rounded-lg bg-surface-100 p-1 sm:flex sm:w-auto">
                {(["all", "active", "inactive"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilterStatus(status)}
                    className={`h-9 rounded-md px-3 text-xs font-bold transition ${
                      filterStatus === status
                        ? "bg-white text-surface-950 shadow-sm"
                        : "text-surface-500 hover:text-surface-800"
                    }`}
                  >
                    {filterLabels[status]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-surface-500">
              <span>{formatNumber(filteredSalespersons.length)} ditampilkan</span>
              <span className="h-1 w-1 rounded-full bg-surface-300" />
              <span>{formatNumber(activeSales)} aktif</span>
              <span className="h-1 w-1 rounded-full bg-surface-300" />
              <span>{formatNumber(inactiveSales)} nonaktif</span>
            </div>
          </section>

          {pageError && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-bold">Data belum sinkron</p>
                <p className="mt-1">{pageError}</p>
              </div>
              <button
                type="button"
                onClick={() => void fetchSalespersons()}
                className="ml-auto shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
              >
                Muat ulang
              </button>
            </div>
          )}

          <section className="mt-5 overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
            {loading ? (
              <div className="p-4">
                <div className="grid gap-3 md:hidden">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-28 rounded-xl bg-surface-100 animate-pulse"
                    />
                  ))}
                </div>
                <div className="hidden space-y-3 md:block">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-14 rounded-lg bg-surface-100 animate-pulse"
                    />
                  ))}
                </div>
              </div>
            ) : filteredSalespersons.length === 0 ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-100 text-surface-400">
                  <Users className="h-7 w-7" aria-hidden="true" />
                </div>
                <p className="mt-4 text-base font-bold text-surface-900">
                  {searchQuery || filterStatus !== "all"
                    ? "Tidak ada sales yang cocok"
                    : "Belum ada sales"}
                </p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-surface-500">
                  {searchQuery || filterStatus !== "all"
                    ? "Ubah kata kunci atau filter status untuk melihat anggota lain."
                    : "Tambahkan sales pertama agar bisa dipilih saat transaksi POS."}
                </p>
                {!searchQuery && filterStatus === "all" && canCreateSalespersons && (
                  <button
                    type="button"
                    onClick={openAddModal}
                    className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Tambah sales pertama
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid gap-3 p-3 md:hidden">
                  {filteredSalespersons.map((salesperson) => {
                    const transactionCount = salesperson._count?.transactions ?? 0;
                    const share =
                      totalTransactions > 0
                        ? Math.min(100, (transactionCount / totalTransactions) * 100)
                        : 0;

                    return (
                      <article
                        key={salesperson.id}
                        role="button"
                        tabIndex={0}
                        aria-expanded={expandedSalespersonId === salesperson.id}
                        onClick={() => toggleSalespersonTransactions(salesperson.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleSalespersonTransactions(salesperson.id);
                          }
                        }}
                        className="rounded-xl border border-surface-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-200 hover:bg-brand-50/20 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-extrabold ${
                              salesperson.isActive
                                ? "bg-brand-50 text-brand-700"
                                : "bg-surface-100 text-surface-400"
                            }`}
                          >
                            {getInitial(salesperson.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-extrabold text-surface-950">
                              {salesperson.name}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-surface-500">
                              {formatNumber(transactionCount)} transaksi
                            </p>
                          </div>
                          {canUpdateSalespersons && (
                            <button
                              id={`edit-sp-mobile-${salesperson.id}`}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditModal(salesperson);
                              }}
                              className="rounded-lg border border-surface-200 p-2 text-surface-500 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                              aria-label={`Ubah ${salesperson.name}`}
                            >
                              <Edit3 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div>
                            <p
                              className={`text-xs font-bold ${
                                salesperson.isActive
                                  ? "text-emerald-700"
                                  : "text-surface-500"
                              }`}
                            >
                              {togglingId === salesperson.id
                                ? "Menyimpan..."
                                : salesperson.isActive
                                  ? "Aktif di checkout"
                                  : "Tidak tampil di checkout"}
                            </p>
                            <div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-surface-100">
                              <div
                                className="h-full rounded-full bg-brand-500 transition-all"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                          </div>
                          {canUpdateSalespersons ? (
                            <span onClick={(event) => event.stopPropagation()}>
                              <StatusToggle
                                id={`toggle-mobile-${salesperson.id}`}
                                checked={salesperson.isActive}
                                disabled={togglingId === salesperson.id}
                                onChange={() => void handleQuickToggle(salesperson)}
                              />
                            </span>
                          ) : (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold ${
                                salesperson.isActive
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-surface-100 text-surface-500"
                              }`}
                            >
                              {salesperson.isActive ? "Aktif" : "Nonaktif"}
                            </span>
                          )}
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-surface-100 pt-3 text-xs font-bold text-brand-700">
                          <span>Lihat transaksi</span>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              expandedSalespersonId === salesperson.id
                                ? "rotate-180"
                                : ""
                            }`}
                            aria-hidden="true"
                          />
                        </div>
                        {expandedSalespersonId === salesperson.id && (
                          <div className="mt-3">
                            {renderTransactionPanel(salesperson)}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <th className="px-5 py-4 text-xs font-bold uppercase text-surface-500">
                          Nama
                        </th>
                        <th className="px-5 py-4 text-xs font-bold uppercase text-surface-500">
                          Status
                        </th>
                        <th className="px-5 py-4 text-xs font-bold uppercase text-surface-500">
                          Transaksi
                        </th>
                        <th className="px-5 py-4 text-right text-xs font-bold uppercase text-surface-500">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {filteredSalespersons.map((salesperson) => {
                        const transactionCount = salesperson._count?.transactions ?? 0;
                        const share =
                          totalTransactions > 0
                            ? Math.min(100, (transactionCount / totalTransactions) * 100)
                            : 0;

                        return (
                          <React.Fragment key={salesperson.id}>
                            <tr
                              aria-expanded={expandedSalespersonId === salesperson.id}
                              className="cursor-pointer transition hover:bg-surface-50"
                              onClick={() => toggleSalespersonTransactions(salesperson.id)}
                            >
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${
                                    salesperson.isActive
                                      ? "bg-brand-50 text-brand-700"
                                      : "bg-surface-100 text-surface-400"
                                  }`}
                                >
                                  {getInitial(salesperson.name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-extrabold text-surface-950">
                                    {salesperson.name}
                                  </p>
                                  <p className="text-xs font-semibold text-surface-400">
                                    ID {salesperson.id.slice(0, 8)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                {canUpdateSalespersons ? (
                                  <span onClick={(event) => event.stopPropagation()}>
                                    <StatusToggle
                                      id={`toggle-${salesperson.id}`}
                                      checked={salesperson.isActive}
                                      disabled={togglingId === salesperson.id}
                                      onChange={() => void handleQuickToggle(salesperson)}
                                    />
                                  </span>
                                ) : (
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                                      salesperson.isActive
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-surface-100 text-surface-500"
                                    }`}
                                  >
                                    {salesperson.isActive ? "Aktif" : "Nonaktif"}
                                  </span>
                                )}
                                <span
                                  className={`text-xs font-bold ${
                                    salesperson.isActive
                                      ? "text-emerald-700"
                                      : "text-surface-500"
                                  }`}
                                >
                                  {togglingId === salesperson.id
                                    ? "Menyimpan..."
                                    : salesperson.isActive
                                      ? "Aktif"
                                      : "Nonaktif"}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex max-w-xs items-center gap-3">
                                <span className="w-12 text-sm font-extrabold text-surface-950">
                                  {formatNumber(transactionCount)}
                                </span>
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-100">
                                  <div
                                    className="h-full rounded-full bg-brand-500 transition-all"
                                    style={{ width: `${share}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <ChevronDown
                                  className={`h-4 w-4 text-surface-400 transition-transform ${
                                    expandedSalespersonId === salesperson.id
                                      ? "rotate-180"
                                      : ""
                                  }`}
                                  aria-hidden="true"
                                />
                                {canUpdateSalespersons && (
                                  <button
                                    id={`edit-sp-${salesperson.id}`}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openEditModal(salesperson);
                                    }}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-surface-200 bg-white px-3 text-xs font-bold text-surface-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                                    Ubah
                                  </button>
                                )}
                              </div>
                            </td>
                            </tr>
                            {expandedSalespersonId === salesperson.id && (
                              <tr>
                                <td className="bg-surface-50 px-5 py-4" colSpan={4}>
                                  {renderTransactionPanel(salesperson)}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {isModalOpen && (editingId ? canUpdateSalespersons : canCreateSalespersons) && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4"
          onClick={(event) => event.target === event.currentTarget && resetModal()}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
          <div className="relative w-full rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-surface-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold text-surface-950">
                  {editingId ? "Ubah Sales" : "Tambah Sales"}
                </h2>
                <p className="mt-1 text-sm leading-5 text-surface-500">
                  {editingId
                    ? "Perbarui nama dan status tampil di checkout."
                    : "Buat anggota sales baru untuk pilihan transaksi POS."}
                </p>
              </div>
              <button
                type="button"
                onClick={resetModal}
                className="rounded-lg p-2 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
                aria-label="Tutup modal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="space-y-4 px-5 py-5">
                <div>
                  <label
                    htmlFor="sp-name"
                    className="block text-sm font-bold text-surface-700"
                  >
                    Nama Lengkap
                  </label>
                  <input
                    id="sp-name"
                    type="text"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setErrorMessage(null);
                    }}
                    className="mt-2 h-11 w-full rounded-lg border border-surface-200 bg-surface-50 px-3 text-sm text-surface-950 transition placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    placeholder="Contoh: Ahmad Rafi"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-surface-200 bg-surface-50 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-surface-950">
                      {isActive ? "Aktif di checkout" : "Nonaktif"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-surface-500">
                      {isActive
                        ? "Sales bisa dipilih saat transaksi POS."
                        : "Sales disimpan, tetapi tidak tampil di POS."}
                    </p>
                  </div>
                  <StatusToggle
                    id="modal-status-toggle"
                    checked={isActive}
                    onChange={() => setIsActive((current) => !current)}
                  />
                </div>

                {errorMessage && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p className="font-semibold">{errorMessage}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 border-t border-surface-100 px-5 pb-5 pt-4">
                <button
                  type="button"
                  onClick={resetModal}
                  disabled={saving}
                  className="h-11 flex-1 rounded-xl border border-surface-200 bg-white text-sm font-bold text-surface-700 transition hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="h-11 flex-1 rounded-xl bg-brand-600 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-300"
                >
                  {saving
                    ? "Menyimpan..."
                    : editingId
                      ? "Simpan Perubahan"
                      : "Tambah Sales"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

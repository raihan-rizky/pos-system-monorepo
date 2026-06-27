"use client";

import React, { Suspense, lazy } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import {
  Plus,
  ChevronDown,
  Check,
  Sparkles,
  AlertTriangle,
  History,
  CheckSquare,
  Calendar,
  TrendingUp,
  Truck,
  Layers,
  Info,
  ClipboardList,
  LogOut,
  PackageOpen,
  ArrowRight,
  Activity,
  Clock,
  Pencil,
  Trash2,
} from "lucide-react";
import type { InventorySummary } from "../types/inventory-management";
import { useRole } from "@/components/providers/RoleProvider";
import { sortTaskChecklistItems } from "../helpers/task-checklist";
import type { InventoryTaskPriority } from "../helpers/task-checklist";

import { DailyMatchingModal } from "./DailyMatchingModal";
import { WeeklyProofModal } from "./WeeklyProofModal";
import { DamagedReportModal } from "./DamagedReportModal";
import { InboundReceiptModal } from "./InboundReceiptModal";
import { InternalStockOutModal } from "./InternalStockOutModal";
import { InternalUseRecapPanel } from "@/features/internal-use-recap";
import { InventorySuratJalanTab } from "./InventorySuratJalanTab";
import { InboundReceiptTab } from "./InboundReceiptTab";
import { StockGroupBulkPanel } from "./StockGroupBulkPanel";


const StockLogsTab = lazy(() => import("@/app/(main)/inventory/StockLogsTab"));
const StockHistoryTab = lazy(() => import("@/app/(main)/inventory/StockHistoryTab"));
const DamagedReportsHistoryTab = lazy(() =>
  import("./DamagedReportsHistoryTab").then((mod) => ({
    default: mod.DamagedReportsHistoryTab,
  })),
);

const MAIN_TABS = ["Ringkasan", "Tugas", "Transaksi", "Riwayat"] as const;

const TUGAS_TABS = ["Tugas Harian", "Tugas Mingguan"] as const;
const TRANSAKSI_TABS = ["Penerimaan Barang", "Pemakaian Internal", "Surat Jalan", "Bulk & Grup Stok"] as const;
const RIWAYAT_TABS = ["Log Stok", "Rekap Stok", "Laporan Barang Rusak", "Riwayat Tugas Harian", "Riwayat Tugas Mingguan"] as const;

const HEALTH_METRICS_INFO = [
  { name: "Akurasi Inventaris", color: "#10b981", desc: "Sesuai vs Selisih", calc: "Persentase produk aktif yang tidak mengalami penyesuaian stok manual (selisih) pada hari ini." },
  { name: "Ketersediaan Stok", color: "#3b82f6", desc: "Tersedia vs Kosong", calc: "Persentase item produk yang jumlah stoknya berada di atas batas minimum (tidak kosong/low-stock)." },
  { name: "Rasio Fulfillment", color: "#f59e0b", desc: "Selesai vs Pending", calc: "Persentase Surat Jalan dan Permintaan Internal yang telah berhasil dipenuhi (Confirmed/Approved) dibandingkan total permintaan aktif." },
];

interface TaskChecklistItem {
  id: string;
  periodType: "DAILY" | "WEEKLY";
  periodKey: string;
  title: string;
  dueTime: string | null;
  priority: InventoryTaskPriority;
  isCompleted: boolean;
  completedById: string | null;
  completedAt: string | null;
  createdAt: string;
}

const PRIORITY_LABELS: Record<InventoryTaskPriority, string> = {
  HIGH: "Tinggi",
  NORMAL: "Normal",
  LOW: "Rendah",
};

const PRIORITY_CLASSES: Record<InventoryTaskPriority, string> = {
  HIGH: "bg-rose-100 text-rose-700",
  NORMAL: "bg-sky-100 text-sky-700",
  LOW: "bg-slate-100 text-slate-600",
};

export interface InventoryWorkspaceProps {
  initialSummary: InventorySummary;
  defaultTab?: typeof MAIN_TABS[number];
}

export const InventoryWorkspace: React.FC<InventoryWorkspaceProps> = ({
  initialSummary,
  defaultTab,
}) => {
  const { canPerform } = useRole();
  const [activeTab, setActiveTab] = React.useState<typeof MAIN_TABS[number]>(
    defaultTab ?? "Ringkasan"
  );
  const [activeTugasTab, setActiveTugasTab] = React.useState<typeof TUGAS_TABS[number]>("Tugas Harian");
  const [activeTransaksiTab, setActiveTransaksiTab] = React.useState<typeof TRANSAKSI_TABS[number]>("Penerimaan Barang");
  const [activeRiwayatTab, setActiveRiwayatTab] = React.useState<typeof RIWAYAT_TABS[number]>("Log Stok");
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [activeModal, setActiveModal] = React.useState<
    "matching" | "weeklyProof" | "damaged" | "inbound" | "internalStockOut" | null
  >(null);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [checklistItems, setChecklistItems] = React.useState<TaskChecklistItem[]>([]);
  const [checklistError, setChecklistError] = React.useState<string | null>(null);
  const [editingChecklistId, setEditingChecklistId] = React.useState<string | null>(null);

  const activeChecklistPeriodType = activeTugasTab === "Tugas Harian" ? "DAILY" : "WEEKLY";
  const activeChecklistPeriodKey =
    activeChecklistPeriodType === "DAILY"
      ? initialSummary.period.dateKey
      : initialSummary.period.weekKey;
  const canManageChecklist = canPerform("inventory", "delete");

  const loadChecklistItems = React.useCallback(async () => {
    if (activeTab !== "Tugas") return;
    const params = new URLSearchParams({
      periodType: activeChecklistPeriodType,
      periodKey: activeChecklistPeriodKey,
    });
    try {
      const response = await fetch(`/api/inventory-management/task-checklist?${params}`);
      if (!response.ok) throw new Error("Failed to load checklist");
      const body = (await response.json()) as { data: TaskChecklistItem[] };
      setChecklistItems(sortTaskChecklistItems(body.data));
      setChecklistError(null);
    } catch {
      setChecklistError("Checklist manual gagal dimuat.");
    }
  }, [activeChecklistPeriodKey, activeChecklistPeriodType, activeTab]);

  React.useEffect(() => {
    void loadChecklistItems();
  }, [loadChecklistItems]);

  const handleSuccess = (message: string) => {
    setStatusMessage(message);
    setErrorMessage(null);
    // Dismiss banner after 5 seconds
    setTimeout(() => {
      setStatusMessage((prev) => (prev === message ? null : prev));
    }, 5000);
  };

  const handleChecklistSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      periodType: activeChecklistPeriodType,
      periodKey: activeChecklistPeriodKey,
      title: String(formData.get("title") || ""),
      dueTime: String(formData.get("dueTime") || "") || null,
      priority: String(formData.get("priority") || "NORMAL") as InventoryTaskPriority,
    };
    const url = editingChecklistId
      ? `/api/inventory-management/task-checklist/${editingChecklistId}`
      : "/api/inventory-management/task-checklist";
    const response = await fetch(url, {
      method: editingChecklistId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setChecklistError("Checklist manual gagal disimpan.");
      return;
    }
    form.reset();
    setEditingChecklistId(null);
    await loadChecklistItems();
  };

  const handleChecklistToggle = async (item: TaskChecklistItem) => {
    const response = await fetch(`/api/inventory-management/task-checklist/${item.id}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: !item.isCompleted }),
    });
    if (!response.ok) {
      setChecklistError("Status checklist gagal diperbarui.");
      return;
    }
    await loadChecklistItems();
  };

  const handleChecklistDelete = async (item: TaskChecklistItem) => {
    const response = await fetch(`/api/inventory-management/task-checklist/${item.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setChecklistError("Checklist manual gagal dihapus.");
      return;
    }
    await loadChecklistItems();
  };

  const startChecklistEdit = (item: TaskChecklistItem) => {
    setEditingChecklistId(item.id);
    setChecklistItems((current) => [
      item,
      ...current.filter((candidate) => candidate.id !== item.id),
    ]);
  };

  const editingChecklistItem =
    checklistItems.find((item) => item.id === editingChecklistId) ?? null;
  const stockRiskCounts = {
    negative: initialSummary.counts.negativeStockProducts ?? 0,
    out: initialSummary.counts.outOfStockProducts ?? 0,
    low: initialSummary.counts.lowStockProducts ?? 0,
    pendingRequests: initialSummary.counts.pendingStockRequests,
  };
  const dailyChecklistRemaining = initialSummary.counts.dailyChecklistRemaining ?? 0;
  const sevenDayMovement = React.useMemo(() => {
    const movements = initialSummary.chartData?.inboundOutbound ?? [];
    const totals = movements.reduce(
      (result, movement) => ({
        inbound: result.inbound + movement.inbound,
        outbound: result.outbound + movement.outbound,
      }),
      { inbound: 0, outbound: 0 },
    );
    const busiestDay = movements.reduce<{
      day: string;
      volume: number;
    } | null>((current, movement) => {
      const volume = movement.inbound + movement.outbound;
      return !current || volume > current.volume
        ? { day: movement.day, volume }
        : current;
    }, null);

    return {
      ...totals,
      net: totals.inbound - totals.outbound,
      busiestDay: busiestDay && busiestDay.volume > 0 ? busiestDay : null,
    };
  }, [initialSummary.chartData?.inboundOutbound]);
  const approvalQueueTotal =
    initialSummary.counts.pendingStockRequests +
    initialSummary.counts.submittedInboundReceipts;
  const correctionQueueTotal =
    initialSummary.counts.needsRevisionReceipts +
    initialSummary.counts.rejectedOwnRequests;

  const openTransactionTab = React.useCallback(
    (tab: (typeof TRANSAKSI_TABS)[number]) => {
      setActiveTransaksiTab(tab);
      setActiveTab("Transaksi");
    },
    [],
  );

  const openHistoryTab = React.useCallback(
    (tab: (typeof RIWAYAT_TABS)[number]) => {
      setActiveRiwayatTab(tab);
      setActiveTab("Riwayat");
    },
    [],
  );

  const dailyFixedTasks = [
    {
      title: "Matching Stok Harian",
      detail: `Periode: ${initialSummary.period.dateKey}`,
      status: initialSummary.counts.dailyMatchingIncomplete ? "Belum selesai" : "Selesai",
      isDone: !initialSummary.counts.dailyMatchingIncomplete,
      action: "Buka matching",
      onClick: () => setActiveModal("matching"),
      icon: Calendar,
    },
    {
      title: "Laporan Barang Rusak",
      detail: `${initialSummary.counts.damagedReportsPending} laporan pending`,
      status: initialSummary.counts.damagedReportsPending > 0 ? "Perlu review" : "Tidak ada pending",
      isDone: initialSummary.counts.damagedReportsPending === 0,
      action: "Laporkan rusak",
      onClick: () => setActiveModal("damaged"),
      icon: AlertTriangle,
    },
    {
      title: "Log OUT Belum Diverifikasi",
      detail: `${initialSummary.counts.unverifiedOutLogs} log perlu verifikasi`,
      status: initialSummary.counts.unverifiedOutLogs > 0 ? "Perlu verifikasi" : "Selesai",
      isDone: initialSummary.counts.unverifiedOutLogs === 0,
      action: "Buka log stok",
      onClick: () => {
        setActiveTab("Riwayat");
        setActiveRiwayatTab("Log Stok");
      },
      icon: LogOut,
    },
  ];

  const weeklyFixedTasks = [
    {
      title: "Proof Kebersihan Gudang",
      detail: `Minggu: ${initialSummary.period.weekKey}`,
      status: initialSummary.counts.weeklyProofMissing ? "Belum submit" : "Selesai",
      isDone: !initialSummary.counts.weeklyProofMissing,
      action: "Upload proof",
      onClick: () => setActiveModal("weeklyProof"),
      icon: Sparkles,
    },
  ];

  const activeFixedTasks =
    activeTugasTab === "Tugas Harian" ? dailyFixedTasks : weeklyFixedTasks;

  const renderFixedTaskQueue = () => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {activeTugasTab}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Tugas operasional otomatis dari status inventaris saat ini.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
          {activeChecklistPeriodKey}
        </span>
      </div>
      <div className="mt-5 grid gap-3">
        {activeFixedTasks.map((task) => {
          const Icon = task.icon;
          return (
            <button
              key={task.title}
              type="button"
              onClick={task.onClick}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-left transition hover:bg-slate-100"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`rounded-lg p-2 ${
                    task.isDone
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900">
                    {task.title}
                  </h3>
                  <p className="text-xs text-slate-500">{task.detail}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    task.isDone
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {task.status}
                </span>
                <span className="hidden text-xs font-bold text-slate-500 sm:inline">
                  {task.action}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderChecklistPanel = () => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Checklist Manual {activeTugasTab === "Tugas Harian" ? "Harian" : "Mingguan"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Checklist bersama toko untuk periode {activeChecklistPeriodKey}.
          </p>
        </div>
      </div>

      {canManageChecklist && (
        <form
          onSubmit={handleChecklistSubmit}
          className="mt-4 grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 md:grid-cols-[1fr_8rem_8rem_auto]"
        >
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={editingChecklistItem?.title ?? ""}
            placeholder="Tulis tugas manual..."
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
          />
          <input
            name="dueTime"
            type="time"
            defaultValue={editingChecklistItem?.dueTime ?? ""}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
          />
          <select
            name="priority"
            defaultValue={editingChecklistItem?.priority ?? "NORMAL"}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-400"
          >
            <option value="HIGH">Tinggi</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Rendah</option>
          </select>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800"
          >
            {editingChecklistId ? "Simpan" : "Tambah tugas"}
          </button>
        </form>
      )}

      {checklistError && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {checklistError}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {checklistItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Belum ada checklist manual untuk periode ini.
          </div>
        ) : (
          sortTaskChecklistItems(checklistItems).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
            >
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  checked={item.isCompleted}
                  onChange={() => void handleChecklistToggle(item)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-900">
                    {item.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {item.dueTime || "Tanpa jam"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-bold ${PRIORITY_CLASSES[item.priority]}`}>
                      {PRIORITY_LABELS[item.priority]}
                    </span>
                    {item.isCompleted && item.completedAt && (
                      <span>Selesai {new Date(item.completedAt).toLocaleString("id-ID")}</span>
                    )}
                  </span>
                </span>
              </label>
              {canManageChecklist && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startChecklistEdit(item)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Edit checklist"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleChecklistDelete(item)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hapus checklist"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderTaskHistory = (periodType: "DAILY" | "WEEKLY") => {
    const rows =
      periodType === "DAILY"
        ? dailyFixedTasks.map((task) => ({
            period: initialSummary.period.dateKey,
            task: task.title,
            status: task.status,
            count: task.detail,
          }))
        : weeklyFixedTasks.map((task) => ({
            period: initialSummary.period.weekKey,
            task: task.title,
            status: task.status,
            count: task.detail,
          }));

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">
          {periodType === "DAILY" ? "Riwayat Tugas Harian" : "Riwayat Tugas Mingguan"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Status tugas operasional tetap dari data inventaris.
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
          {rows.map((row) => (
            <div
              key={`${row.period}-${row.task}`}
              className="grid gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[10rem_1fr_10rem_12rem]"
            >
              <span className="font-bold text-slate-700">{row.period}</span>
              <span className="text-slate-900">{row.task}</span>
              <span className="font-bold text-slate-600">{row.status}</span>
              <span className="text-xs text-slate-500">{row.count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">
              Manajemen Inventaris
            </p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">
              Inventaris
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800">
              {initialSummary.urgentCount} tugas urgent
            </div>

            {/* Consolidate input workflows to a single dropdown button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 shadow-md cursor-pointer select-none"
              >
                <Plus className="h-4 w-4" />
                <span>Input / Transaksi</span>
                <ChevronDown className="h-4 w-4" />
              </button>

              {isDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-40 animate-in fade-in slide-in-from-top-2 duration-150">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal("matching");
                        setIsDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors"
                    >
                      <Check className="h-4 w-4 text-emerald-500" />
                      <span>Cocokkan Stok (Harian)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal("weeklyProof");
                        setIsDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors"
                    >
                      <Sparkles className="h-4 w-4 text-sky-500" />
                      <span>Proof Kebersihan (Mingguan)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal("damaged");
                        setIsDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors"
                    >
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                      <span>Laporkan Barang Rusak</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal("inbound");
                        setIsDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors"
                    >
                      <History className="h-4 w-4 text-indigo-500" />
                      <span>Penerimaan Barang</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal("internalStockOut");
                        setIsDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors"
                    >
                      <PackageOpen className="h-4 w-4 text-orange-500" />
                      <span>Stock Out Internal</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Navigasi Manajemen Inventaris"
          className="mt-4 flex gap-2 overflow-x-auto"
        >
          {MAIN_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black transition-all cursor-pointer ${
                activeTab === tab
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Ringkasan" && (
        <>


      {(statusMessage || errorMessage) && (
        <div
          role="status"
          className={`mx-4 mt-4 mb-4 rounded-lg border px-4 py-3 text-sm font-bold md:mx-6 md:mt-6 ${
            errorMessage
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {errorMessage || statusMessage}
        </div>
      )}

      {/* Main Dashboard Grid */}
      <section className="grid gap-6 px-4 pt-4 pb-6 md:grid-cols-3 md:px-6 md:pt-6">
        {/* Status Checklist / Tasks */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-slate-700" />
            Pusat Kerja Hari Ini
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Fokus pekerjaan inventaris untuk {initialSummary.period.dateKey}.
          </p>

          <div className="mt-6 space-y-4">
            {/* Daily Matching */}
            <button 
              type="button"
              onClick={() => setActiveModal("matching")}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-100 transition-all cursor-pointer text-left active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    initialSummary.counts.dailyMatchingIncomplete
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Pencocokan Stok Harian
                  </h3>
                  <p className="text-xs text-slate-500">
                    Periode: {initialSummary.period.dateKey}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {initialSummary.counts.unverifiedOutLogs > 0 && (
                  <span className="hidden rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 sm:inline">
                    Verifikasi dulu
                  </span>
                )}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    initialSummary.counts.dailyMatchingIncomplete
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {initialSummary.counts.dailyMatchingIncomplete
                    ? "Belum match"
                    : "Selesai"}
                </span>
              </div>
            </button>

            {/* Unverified OUT logs */}
            <button 
              type="button"
              onClick={() => {
                setActiveTab("Riwayat");
                setActiveRiwayatTab("Log Stok");
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-100 transition-all cursor-pointer text-left active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    initialSummary.counts.unverifiedOutLogs > 0
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  <LogOut className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Log OUT Belum Diverifikasi
                  </h3>
                  <p className="text-xs text-slate-500">
                    {initialSummary.counts.unverifiedOutLogs} log perlu dicek sebelum matching
                  </p>
                </div>
              </div>
              <div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    initialSummary.counts.unverifiedOutLogs > 0
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {initialSummary.counts.unverifiedOutLogs > 0 ? "Verifikasi dulu" : "Selesai"}
                </span>
              </div>
            </button>

            {/* Damaged reports */}
            <button 
              type="button"
              onClick={() => setActiveModal("damaged")}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-100 transition-all cursor-pointer text-left active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-100 text-rose-700">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Laporan Barang Rusak
                  </h3>
                  <p className="text-xs text-slate-500">
                    Catat barang rusak dengan pencarian produk
                  </p>
                </div>
              </div>
              <div>
                <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                  {initialSummary.counts.damagedReportsPending} pending
                </span>
              </div>
            </button>

            {/* Manual checklist */}
            <button
              type="button"
              onClick={() => setActiveTab("Tugas")}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-100 transition-all cursor-pointer text-left active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    dailyChecklistRemaining > 0
                      ? "bg-sky-100 text-sky-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Checklist Manual Hari Ini
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tugas tambahan bersama staf inventaris
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  dailyChecklistRemaining > 0
                    ? "bg-sky-100 text-sky-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {dailyChecklistRemaining > 0
                  ? `${dailyChecklistRemaining} belum selesai`
                  : "Selesai"}
              </span>
            </button>
          </div>
        </div>

        {/* Quick info panel / shortcuts */}
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-slate-700" />
            Risiko Stok
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-blue-300 hover:ring-1 hover:ring-blue-100 transition-all duration-300 relative overflow-hidden flex flex-col justify-center cursor-pointer">
              <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-blue-50 group-hover:scale-150 transition-transform duration-500" />
              <div className="relative z-10 flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Request Pending</span>
                <ClipboardList className="h-3.5 w-3.5 text-blue-500 opacity-50 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="relative z-10 text-3xl font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                {stockRiskCounts.pendingRequests}
              </span>
            </div>
            
            <div className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-amber-300 hover:ring-1 hover:ring-amber-100 transition-all duration-300 relative overflow-hidden flex flex-col justify-center cursor-pointer">
              <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-amber-50 group-hover:scale-150 transition-transform duration-500" />
              <div className="relative z-10 flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Stok Negatif</span>
                <LogOut className="h-3.5 w-3.5 text-amber-500 opacity-50 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="relative z-10 text-3xl font-black text-slate-900 group-hover:text-amber-600 transition-colors">
                {stockRiskCounts.negative}
              </span>
            </div>

            <div className="col-span-2 group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-violet-300 hover:ring-1 hover:ring-violet-100 transition-all duration-300 relative overflow-hidden flex flex-col justify-center cursor-pointer">
              <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-violet-50 to-transparent group-hover:w-full transition-all duration-500" />
              <div className="relative z-10 flex items-center justify-between w-full">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Stok Habis / Rendah</span>
                  </div>
                  <span className="text-3xl font-black text-slate-900 group-hover:text-violet-600 transition-colors">
                    {stockRiskCounts.out} / {stockRiskCounts.low}
                  </span>
                </div>
                <div className="h-10 w-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300">
                   <PackageOpen className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Status Mingguan
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Proof Kebersihan Gudang - {initialSummary.period.weekKey}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  initialSummary.counts.weeklyProofMissing
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {initialSummary.counts.weeklyProofMissing ? "Upload proof" : "Selesai"}
              </span>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2 flex flex-col">
          <div className="flex items-center gap-1.5 mb-4">
            <h2 className="text-base font-bold text-slate-900">Volume Inbound vs Outbound (7 Hari)</h2>
            <div className="group relative flex items-center">
              <Info className="h-4 w-4 text-slate-400 cursor-help hover:text-slate-600 transition-colors" />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="rounded-md bg-slate-900 p-2.5 text-xs leading-relaxed text-white shadow-xl text-center">
                  Dihitung dari total kuantitas barang yang diterima (inbound) dan barang yang dikeluarkan (outbound) per harinya.
                  <div className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900" />
                </div>
              </div>
            </div>
          </div>
          <div className="h-64 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={initialSummary.chartData?.inboundOutbound ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="inbound" name="Inbound" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={32} />
                <Bar dataKey="outbound" name="Outbound" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col">
          <h2 className="text-base font-bold text-slate-900 mb-5">Kesehatan Gudang</h2>
          <div className="flex flex-col gap-6 flex-1 justify-center pb-2">
            {HEALTH_METRICS_INFO.map((metric) => {
              let value = 0;
              if (metric.name === "Akurasi Inventaris") value = initialSummary.chartData?.health.accuracy ?? 0;
              else if (metric.name === "Ketersediaan Stok") value = initialSummary.chartData?.health.availability ?? 0;
              else if (metric.name === "Rasio Fulfillment") value = initialSummary.chartData?.health.fulfillment ?? 0;
              
              return (
                <div key={metric.name} className="flex items-center gap-4">
                  <div className="relative shrink-0 flex items-center justify-center">
                    <PieChart width={56} height={56}>
                      <Pie
                        data={[{ value: value }, { value: 100 - value }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={20}
                        outerRadius={26}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill={metric.color} />
                        <Cell fill="#f1f5f9" />
                      </Pie>
                    </PieChart>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[11px] font-black text-slate-800">{value}%</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{metric.name}</h3>
                      <div className="group relative flex items-center shrink-0">
                        <Info className="h-3.5 w-3.5 text-slate-400 cursor-help hover:text-slate-600 transition-colors" />
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-48 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                          <div className="rounded-md bg-slate-900 p-2 text-[10px] leading-relaxed text-white shadow-xl whitespace-normal text-center">
                            {metric.calc}
                            <div className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{metric.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Data-driven operational follow-up */}
        <section
          aria-labelledby="operational-follow-up-title"
          className="space-y-4 md:col-span-3"
        >
          <div>
            <h2
              id="operational-follow-up-title"
              className="flex items-center gap-2 text-base font-bold text-slate-900"
            >
              <Activity className="h-5 w-5 text-slate-700" />
              Tindak Lanjut Operasional
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Angka aktual yang dapat langsung ditelusuri ke workflow terkait.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Pergerakan 7 hari
                  </p>
                  <h3 className="mt-1 text-sm font-bold text-slate-900">
                    Arus Stok Disetujui
                  </h3>
                </div>
                <Activity className="h-5 w-5 text-indigo-600" />
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <dt className="text-[10px] font-black uppercase text-emerald-700">Masuk</dt>
                  <dd className="mt-1 text-xl font-black tabular-nums text-emerald-950">
                    {sevenDayMovement.inbound.toLocaleString("id-ID")}
                  </dd>
                </div>
                <div className="rounded-xl bg-rose-50 p-3">
                  <dt className="text-[10px] font-black uppercase text-rose-700">Keluar</dt>
                  <dd className="mt-1 text-xl font-black tabular-nums text-rose-950">
                    {sevenDayMovement.outbound.toLocaleString("id-ID")}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-100 p-3">
                  <dt className="text-[10px] font-black uppercase text-slate-600">Neto</dt>
                  <dd className="mt-1 text-xl font-black tabular-nums text-slate-950">
                    {sevenDayMovement.net > 0 ? "+" : ""}
                    {sevenDayMovement.net.toLocaleString("id-ID")}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-xs text-slate-500">
                {sevenDayMovement.busiestDay
                  ? `Aktivitas tertinggi: ${sevenDayMovement.busiestDay.day} (${sevenDayMovement.busiestDay.volume.toLocaleString("id-ID")} unit).`
                  : "Belum ada pergerakan stok yang disetujui pada periode ini."}
              </p>
              <button
                type="button"
                onClick={() => openHistoryTab("Rekap Stok")}
                className="mt-auto flex items-center justify-between pt-5 text-left text-xs font-black text-indigo-700 hover:text-indigo-900"
              >
                Lihat rekap stok
                <ArrowRight className="h-4 w-4" />
              </button>
            </article>

            <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Menunggu keputusan
                  </p>
                  <h3 className="mt-1 text-sm font-bold text-slate-900">
                    Antrean Persetujuan
                  </h3>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-black ${
                  approvalQueueTotal > 0
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}>
                  {approvalQueueTotal}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => openHistoryTab("Log Stok")}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-left hover:border-slate-200 hover:bg-slate-100"
                >
                  <span>
                    <span className="block text-xs font-bold text-slate-800">Permintaan stok</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">Buka log untuk review status</span>
                  </span>
                  <span className="text-lg font-black tabular-nums text-slate-950">
                    {initialSummary.counts.pendingStockRequests}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openTransactionTab("Penerimaan Barang")}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-left hover:border-slate-200 hover:bg-slate-100"
                >
                  <span>
                    <span className="block text-xs font-bold text-slate-800">Penerimaan diajukan</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">Periksa barang masuk</span>
                  </span>
                  <span className="text-lg font-black tabular-nums text-slate-950">
                    {initialSummary.counts.submittedInboundReceipts}
                  </span>
                </button>
              </div>
            </article>

            <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Memerlukan perbaikan
                  </p>
                  <h3 className="mt-1 text-sm font-bold text-slate-900">
                    Koreksi Terbuka
                  </h3>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-black ${
                  correctionQueueTotal > 0
                    ? "bg-rose-100 text-rose-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}>
                  {correctionQueueTotal}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => openTransactionTab("Penerimaan Barang")}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-left hover:border-slate-200 hover:bg-slate-100"
                >
                  <span>
                    <span className="block text-xs font-bold text-slate-800">Penerimaan perlu revisi</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">Lengkapi lalu ajukan kembali</span>
                  </span>
                  <span className="text-lg font-black tabular-nums text-slate-950">
                    {initialSummary.counts.needsRevisionReceipts}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openHistoryTab("Log Stok")}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-left hover:border-slate-200 hover:bg-slate-100"
                >
                  <span>
                    <span className="block text-xs font-bold text-slate-800">Permintaan saya ditolak</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">Baca alasan penolakan</span>
                  </span>
                  <span className="text-lg font-black tabular-nums text-slate-950">
                    {initialSummary.counts.rejectedOwnRequests}
                  </span>
                </button>
              </div>
            </article>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Mulai workflow inventaris</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Catat transaksi baru atau lanjutkan ke area pengelolaan yang tepat.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={() => setActiveModal("inbound")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Terima barang
              </button>
              <button
                type="button"
                onClick={() => setActiveModal("internalStockOut")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <PackageOpen className="h-4 w-4" />
                Pemakaian internal
              </button>
              <button
                type="button"
                onClick={() => openTransactionTab("Surat Jalan")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Truck className="h-4 w-4" />
                Surat jalan
              </button>
              <button
                type="button"
                onClick={() => openTransactionTab("Bulk & Grup Stok")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Layers className="h-4 w-4" />
                Bulk & grup
              </button>
            </div>
          </div>
        </section>
      </section>
      </>
      )}

      {activeTab !== "Ringkasan" && (
        <div className="p-4 md:p-6 max-w-[96rem] mx-auto w-full space-y-6">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-20 text-slate-400">
                <span className="text-sm">Memuat tab...</span>
              </div>
            }
          >
            {activeTab === "Tugas" && (
              <div className="space-y-4">
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl overflow-x-auto w-max">
                  {TUGAS_TABS.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTugasTab(tab)}
                      className={`shrink-0 rounded-lg px-4 py-1.5 text-sm font-bold transition-all ${
                        activeTugasTab === tab
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                {activeTugasTab === "Tugas Harian" && (
                  <>
                    {renderFixedTaskQueue()}
                    {renderChecklistPanel()}
                  </>
                )}
                {activeTugasTab === "Tugas Mingguan" && (
                  <>
                    {renderFixedTaskQueue()}
                    {renderChecklistPanel()}
                  </>
                )}
              </div>
            )}
            
            {activeTab === "Transaksi" && (
              <div className="space-y-4">
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl overflow-x-auto w-max">
                  {TRANSAKSI_TABS.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTransaksiTab(tab)}
                      className={`shrink-0 rounded-lg px-4 py-1.5 text-sm font-bold transition-all ${
                        activeTransaksiTab === tab
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                
                {activeTransaksiTab === "Penerimaan Barang" && <InboundReceiptTab />}

                {activeTransaksiTab === "Pemakaian Internal" && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 mb-3">
                      Rekap Pemakaian Internal
                    </h3>
                    <InternalUseRecapPanel />
                  </div>
                )}

                {activeTransaksiTab === "Surat Jalan" && <InventorySuratJalanTab />}

                {activeTransaksiTab === "Bulk & Grup Stok" && (
                  <StockGroupBulkPanel />
                )}
              </div>
            )}

            {activeTab === "Riwayat" && (
              <div className="space-y-4">
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl overflow-x-auto w-max">
                  {RIWAYAT_TABS.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveRiwayatTab(tab)}
                      className={`shrink-0 rounded-lg px-4 py-1.5 text-sm font-bold transition-all ${
                        activeRiwayatTab === tab
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                
                {activeRiwayatTab === "Log Stok" && <StockLogsTab />}

                {activeRiwayatTab === "Rekap Stok" && <StockHistoryTab />}

                {activeRiwayatTab === "Laporan Barang Rusak" && <DamagedReportsHistoryTab />}

                {activeRiwayatTab === "Riwayat Tugas Harian" && renderTaskHistory("DAILY")}

                {activeRiwayatTab === "Riwayat Tugas Mingguan" && renderTaskHistory("WEEKLY")}
              </div>
            )}
          </Suspense>
        </div>
      )}

      {/* Modal Dialogs */}
      <DailyMatchingModal
        open={activeModal === "matching"}
        onClose={() => setActiveModal(null)}
        initialSummary={initialSummary}
        onSuccess={handleSuccess}
      />
      <WeeklyProofModal
        open={activeModal === "weeklyProof"}
        onClose={() => setActiveModal(null)}
        initialSummary={initialSummary}
        onSuccess={handleSuccess}
      />
      <DamagedReportModal
        open={activeModal === "damaged"}
        onClose={() => setActiveModal(null)}
        initialSummary={initialSummary}
        onSuccess={handleSuccess}
      />
      <InboundReceiptModal
        open={activeModal === "inbound"}
        onClose={() => setActiveModal(null)}
        initialSummary={initialSummary}
        onSuccess={handleSuccess}
      />
      <InternalStockOutModal
        open={activeModal === "internalStockOut"}
        onClose={() => setActiveModal(null)}
        onSuccess={handleSuccess}
      />
    </main>
  );
};

function SummaryMetric({ 
  label, 
  value, 
  icon: Icon,
  colorVariant = "blue"
}: { 
  label: string; 
  value: number;
  icon?: React.ElementType;
  colorVariant?: "blue" | "amber" | "violet" | "emerald" | "rose";
}) {
  const colorStyles = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    violet: "bg-violet-50 text-violet-600 border-violet-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
  };

  const bgGradient = {
    blue: "from-blue-500/5 to-transparent",
    amber: "from-amber-500/5 to-transparent",
    violet: "from-violet-500/5 to-transparent",
    emerald: "from-emerald-500/5 to-transparent",
    rose: "from-rose-500/5 to-transparent",
  };

  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300`}>
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${bgGradient[colorVariant]} rounded-bl-full -mr-8 -mt-8 transition-transform duration-500 group-hover:scale-110`} />
      
      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
            {label}
          </p>
          <p className="text-4xl font-black tabular-nums text-slate-900 tracking-tight group-hover:scale-105 origin-left transition-transform duration-300">
            {value}
          </p>
        </div>
        {Icon && (
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${colorStyles[colorVariant]} shadow-sm group-hover:rotate-6 group-hover:scale-110 transition-transform duration-300`}>
            <Icon className="h-6 w-6" strokeWidth={2.5} />
          </div>
        )}
      </div>
    </div>
  );
}

export default InventoryWorkspace;

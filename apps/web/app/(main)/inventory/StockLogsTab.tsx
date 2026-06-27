"use client";

import React, { lazy, Suspense, useMemo, useState } from "react";
import {
  type InventoryLog,
  type InventoryLogStatus,
  useApproveInventoryLog,
  useCancelInventoryLog,
  useInventoryLogs,
  useRejectInventoryLog,
} from "@/hooks/useInventoryLogs";
import { useRole } from "@/components/providers/RoleProvider";
import { useCancelBulkBatch } from "@/features/bulk-stock-approval/hooks/useBulkApproval";
import { InternalUseRecapPanel } from "@/features/internal-use-recap";
import {
  PackagePlus,
  PackageMinus,
  Settings2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar,
  Archive,
  Check,
  X,
  Clock,
  AlertCircle,
} from "lucide-react";
import { getDefaultProductImage } from "@/lib/utils";

const BulkStockApprovalModal = lazy(() =>
  import("@/features/bulk-stock-approval/components/BulkStockApprovalModal").then(
    (mod) => ({ default: mod.BulkStockApprovalModal }),
  ),
);

type TypeStyle = {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
};

const typeConfig: Record<string, TypeStyle> = {
  IN: { label: "Stock In", icon: <PackagePlus className="w-4 h-4" />, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
  OUT: { label: "Stock Out", icon: <PackageMinus className="w-4 h-4" />, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-100" },
  ADJUSTMENT: { label: "Penyesuaian", icon: <Settings2 className="w-4 h-4" />, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-100" },
};

const STATUS_FILTERS: Array<{ id: string; label: string; status?: string }> = [
  { id: "all", label: "Semua" },
  { id: "pending", label: "Pending", status: "PENDING" },
  { id: "approved", label: "Disetujui", status: "APPROVED" },
  { id: "rejected", label: "Ditolak", status: "REJECTED" },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffM = Math.floor((now - then) / 60000);
  if (diffM < 1) return "Baru saja";
  if (diffM < 60) return `${diffM}m lalu`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}j lalu`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}h lalu`;
  return formatDate(dateStr);
}

function statusPillClass(status: InventoryLogStatus): string {
  if (status === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

function statusLabel(status: InventoryLogStatus): string {
  if (status === "PENDING") return "Pending";
  if (status === "APPROVED") return "Disetujui";
  return "Ditolak";
}

export default function StockLogsTab() {
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilterId, setStatusFilterId] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 20;
  const { role, userId } = useRole();
  const isOwner = role === "OWNER";

  const statusParam = useMemo(
    () => STATUS_FILTERS.find((s) => s.id === statusFilterId)?.status,
    [statusFilterId],
  );

  const { data, isLoading, isError } = useInventoryLogs({
    type: typeFilter || undefined,
    status: statusParam,
    page,
    limit,
    days: 60,
  });

  const approveMut = useApproveInventoryLog();
  const rejectMut = useRejectInventoryLog();
  const cancelMut = useCancelInventoryLog();
  const cancelBulkMut = useCancelBulkBatch();

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const logs = useMemo(() => data?.data ?? [], [data?.data]);
  const pagination = data?.pagination;
  const pendingTotal = pagination?.pendingTotal ?? 0;
  const entries = useMemo(() => groupBulkLogs(logs), [logs]);

  const handleApprove = async (id: string) => {
    setActionError(null);
    try {
      await approveMut.mutateAsync(id);
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 409) {
        setActionError("Permintaan sudah diputuskan oleh user lain.");
      } else {
        setActionError(e.message || "Gagal menyetujui permintaan.");
      }
    }
  };

  const handleReject = async (id: string) => {
    setActionError(null);
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      setActionError("Alasan penolakan wajib diisi.");
      return;
    }
    try {
      await rejectMut.mutateAsync({ id, reason: trimmed });
      setRejectingId(null);
      setRejectReason("");
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 409) {
        setActionError("Permintaan sudah diputuskan oleh user lain.");
      } else {
        setActionError(e.message || "Gagal menolak permintaan.");
      }
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Batalkan permintaan ini?")) return;
    setActionError(null);
    try {
      await cancelMut.mutateAsync(id);
    } catch (err) {
      const e = err as Error & { status?: number };
      setActionError(e.message || "Gagal membatalkan permintaan.");
    }
  };

  const handleCancelBulk = async (batchId: string) => {
    if (!confirm("Batalkan bundle permintaan stok ini?")) return;
    setActionError(null);
    try {
      await cancelBulkMut.mutateAsync(batchId);
    } catch (err) {
      const e = err as Error;
      setActionError(e.message || "Gagal membatalkan bundle.");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">60 Hari Terakhir</span>
            {pagination && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                {pagination.total} entri
              </span>
            )}
            {pendingTotal > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-[10px] font-bold text-amber-700">
                <Clock className="w-3 h-3" />
                {pendingTotal} pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            {[
              { id: "", label: "Semua tipe" },
              { id: "IN", label: "Stock In" },
              { id: "OUT", label: "Stock Out" },
              { id: "ADJUSTMENT", label: "Penyesuaian" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => { setTypeFilter(f.id); setPage(1); }}
                className={`min-h-9 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${typeFilter === f.id
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status chip group */}
        <div
          role="tablist"
          aria-label="Filter status"
          className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 self-start"
        >
          {STATUS_FILTERS.map((f) => {
            const active = statusFilterId === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setStatusFilterId(f.id); setPage(1); }}
                className={`min-h-8 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${active
                  ? "bg-white text-brand-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
                  }`}
              >
                {f.label}
                {f.id === "pending" && pendingTotal > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-black ${active ? "bg-amber-100 text-amber-700" : "bg-amber-500 text-white"}`}>
                    {pendingTotal}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <InternalUseRecapPanel />

      {actionError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {/* ── Content ── */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
          <p className="text-sm font-medium">Memuat log stok…</p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-red-400">
          <p className="text-sm font-medium">Gagal memuat log stok</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Archive className="w-8 h-8 text-slate-300" />
          </div>
          <p className="font-bold text-slate-700">Belum ada perubahan stok</p>
          <p className="text-sm mt-1">Tidak ada entri di 60 hari terakhir.</p>
        </div>
      ) : (
        <>
          {/* ── Desktop Table ── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-3 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="py-3 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Tanggal</th>
                  <th className="py-3 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Produk</th>
                  <th className="py-3 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Tipe</th>
                  <th className="py-3 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest text-right">Qty</th>
                  <th className="py-3 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Pemohon</th>
                  <th className="py-3 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Catatan</th>
                  <th className="py-3 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  if (entry.kind === "bundle") {
                    return (
                      <BundleDesktopRow
                        key={entry.batch.id}
                        entry={entry}
                        userId={userId}
                        onOpen={() => setSelectedBatchId(entry.batch.id)}
                        onCancel={() => handleCancelBulk(entry.batch.id)}
                      />
                    );
                  }
                  const log = entry.log;
                  const cfg = typeConfig[log.type];
                  const isPending = log.status === "PENDING";
                  const isRejected = log.status === "REJECTED";
                  const canCancel = isPending && log.createdBy === userId;
                  const rowMuted = isRejected ? "opacity-60" : "";
                  return (
                    <React.Fragment key={log.id}>
                      <tr className={`group border-b border-slate-50 hover:bg-blue-50/30 transition-colors duration-150 ${rowMuted}`}>
                        <td className="py-3 px-3 align-middle relative">
                          {isPending && (
                            <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400" />
                          )}
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusPillClass(log.status)}`}>
                            {statusLabel(log.status)}
                          </span>
                        </td>
                        <td className="py-3 px-3 align-middle">
                          <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatDate(log.createdAt)}</p>
                          <p className="text-[11px] text-slate-400 tabular-nums">{formatTime(log.createdAt)}</p>
                          {log.status === "APPROVED" && log.approverName && (
                            <p className="text-[10px] text-emerald-600 mt-0.5">oleh {log.approverName}</p>
                          )}
                        </td>
                        <td className="py-3 px-3 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                              <img src={log.product.imageUrl || getDefaultProductImage(log.product.category?.name)} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 text-sm truncate max-w-[200px]">{log.product.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold tracking-wider">{log.product.sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 align-middle">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 align-middle text-right">
                          <span className={`text-sm font-black tabular-nums ${isPending ? "text-slate-700" :
                            isRejected ? "text-slate-400 line-through" :
                              log.type === "IN" ? "text-emerald-600" :
                                log.type === "OUT" ? "text-amber-600" : "text-blue-600"
                            }`}>
                            {log.type === "IN" ? "+" : log.type === "OUT" ? "−" : "±"}{log.quantity}
                          </span>
                          <span className="text-xs text-slate-400 ml-1">{log.product.unit}</span>
                        </td>
                        <td className="py-3 px-3 align-middle">
                          <p className="text-xs text-slate-700 font-medium truncate max-w-[120px]">{log.person || "—"}</p>
                        </td>
                        <td className="py-3 px-3 align-middle">
                          <p className="text-sm text-slate-500 max-w-[250px] whitespace-normal break-words">{log.note || "—"}</p>
                          {isRejected && log.rejectionReason && (
                            <p className="text-[11px] text-red-600 mt-0.5 max-w-[250px] whitespace-normal break-words">
                              Ditolak: {log.rejectionReason}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3 align-middle">
                          <RowActions
                            log={log}
                            isOwner={isOwner}
                            canCancel={canCancel}
                            isApproving={approveMut.isPending && approveMut.variables === log.id}
                            isRejecting={rejectMut.isPending}
                            onApprove={() => handleApprove(log.id)}
                            onStartReject={() => { setRejectingId(log.id); setRejectReason(""); setActionError(null); }}
                            onCancel={() => handleCancel(log.id)}
                          />
                        </td>
                      </tr>
                      {rejectingId === log.id && (
                        <tr className="bg-red-50/30 border-b border-red-100">
                          <td colSpan={8} className="py-3 px-3">
                            <RejectComposer
                              reason={rejectReason}
                              onChange={setRejectReason}
                              onSubmit={() => handleReject(log.id)}
                              onCancel={() => { setRejectingId(null); setRejectReason(""); setActionError(null); }}
                              isSubmitting={rejectMut.isPending}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Mobile Cards ── */}
          <div className="flex flex-col gap-3 md:hidden">
            {entries.map((entry) => {
              if (entry.kind === "bundle") {
                return (
                  <BundleMobileCard
                    key={entry.batch.id}
                    entry={entry}
                    userId={userId}
                    onOpen={() => setSelectedBatchId(entry.batch.id)}
                    onCancel={() => handleCancelBulk(entry.batch.id)}
                  />
                );
              }
              const log = entry.log;
              const cfg = typeConfig[log.type];
              const isPending = log.status === "PENDING";
              const isRejected = log.status === "REJECTED";
              const canCancel = isPending && log.createdBy === userId;
              return (
                <div
                  key={log.id}
                  className={`relative bg-white rounded-2xl p-4 border ${isPending ? "border-amber-200" : "border-slate-100"} shadow-[0_2px_12px_rgba(0,0,0,0.03)] ${isRejected ? "opacity-70" : ""}`}
                >
                  {isPending && (
                    <span aria-hidden="true" className="absolute left-0 top-3 bottom-3 w-1 bg-amber-400 rounded-r" />
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                        <img src={log.product.imageUrl || getDefaultProductImage(log.product.category?.name)} alt="" className="w-full h-full object-cover rounded-xl" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 text-sm truncate">{log.product.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{relativeTime(log.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-base font-black tabular-nums ${isPending ? "text-slate-700" :
                        isRejected ? "text-slate-400 line-through" :
                          log.type === "IN" ? "text-emerald-600" :
                            log.type === "OUT" ? "text-amber-600" : "text-blue-600"
                        }`}>
                        {log.type === "IN" ? "+" : log.type === "OUT" ? "−" : "±"}{log.quantity}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${cfg.color} ${cfg.bg} ${cfg.border} border`}>
                      {cfg.icon} {cfg.label}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusPillClass(log.status)}`}>
                      {statusLabel(log.status)}
                    </span>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-50 space-y-1">
                    <p className="text-xs text-slate-600 font-medium">Pemohon: {log.person || "—"}</p>
                    {log.status === "APPROVED" && log.approverName && (
                      <p className="text-[11px] text-emerald-600">Disetujui {log.approverName}</p>
                    )}
                    {log.note && <p className="text-xs text-slate-500 whitespace-normal break-words">{log.note}</p>}
                    {isRejected && log.rejectionReason && (
                      <p className="text-[11px] text-red-600 whitespace-normal break-words">Ditolak: {log.rejectionReason}</p>
                    )}
                  </div>

                  {(isPending && (isOwner || canCancel)) && (
                    <div className="mt-3 pt-3 border-t border-slate-50 flex gap-2 flex-wrap">
                      <RowActions
                        log={log}
                        isOwner={isOwner}
                        canCancel={canCancel}
                        isApproving={approveMut.isPending && approveMut.variables === log.id}
                        isRejecting={rejectMut.isPending}
                        onApprove={() => handleApprove(log.id)}
                        onStartReject={() => { setRejectingId(log.id); setRejectReason(""); setActionError(null); }}
                        onCancel={() => handleCancel(log.id)}
                        compact={false}
                      />
                    </div>
                  )}

                  {rejectingId === log.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <RejectComposer
                        reason={rejectReason}
                        onChange={setRejectReason}
                        onSubmit={() => handleReject(log.id)}
                        onCancel={() => { setRejectingId(null); setRejectReason(""); setActionError(null); }}
                        isSubmitting={rejectMut.isPending}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Pagination ── */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 font-medium">
                Hal. {pagination.page} dari {pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  aria-label="Halaman sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  aria-label="Halaman berikutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <Suspense fallback={null}>
        {selectedBatchId && (
          <BulkStockApprovalModal
            open={Boolean(selectedBatchId)}
            batchId={selectedBatchId}
            onClose={() => setSelectedBatchId(null)}
          />
        )}
      </Suspense>
    </div>
  );
}

type BatchOperationForLog = NonNullable<InventoryLog["batchItem"]>["batchOperation"];

type StockLogEntry =
  | { kind: "log"; log: InventoryLog }
  | { kind: "bundle"; batch: BatchOperationForLog; logs: InventoryLog[]; openable?: boolean };

function groupBulkLogs(logs: InventoryLog[]): StockLogEntry[] {
  const entries: StockLogEntry[] = [];
  const bundled = new Set<string>();

  for (const log of logs) {
    const batch = log.batchItem?.batchOperation;
    const shouldBundle =
      batch?.type === "BULK_STOCK_ADJUSTMENT" ||
      batch?.type === "BULK_STOCK_GROUP_ADJUSTMENT" ||
      batch?.type === "DAILY_STOCK_MATCHING";

    if (!shouldBundle || !batch) {
      if (
        log.type === "IN" &&
        log.reason === "RESTOCK" &&
        log.status === "APPROVED" &&
        log.supplierId
      ) {
        const dateKey = new Date(log.decidedAt || log.createdAt)
          .toISOString()
          .slice(0, 10);
        const bundleId = `supplier:${log.supplierId}:${dateKey}`;
        if (!bundled.has(bundleId)) {
          const supplierLogs = logs.filter((candidate) => {
            const candidateDateKey = new Date(candidate.decidedAt || candidate.createdAt)
              .toISOString()
              .slice(0, 10);
            return (
              candidate.type === "IN" &&
              candidate.reason === "RESTOCK" &&
              candidate.status === "APPROVED" &&
              candidate.supplierId === log.supplierId &&
              candidateDateKey === dateKey
            );
          });
          bundled.add(bundleId);
          entries.push({
            kind: "bundle",
            openable: false,
            batch: {
              id: bundleId,
              status: "COMMITTED",
              type: "SUPPLIER_DAILY_RECEIPT",
              createdBy: log.createdBy ?? "",
              createdAt: log.decidedAt || log.createdAt,
              summary: {
                productName: `Penerimaan ${log.supplier?.name ?? "Supplier"}`,
                supplierName: log.supplier?.name ?? "Supplier",
                note: `${supplierLogs.length} line penerimaan approved`,
                type: "IN",
                totalCount: supplierLogs.length,
                pendingCount: 0,
                approvedCount: supplierLogs.length,
                rejectedCount: 0,
              },
            },
            logs: supplierLogs,
          });
        }
        continue;
      }
      entries.push({ kind: "log", log });
      continue;
    }

    if (bundled.has(batch.id)) continue;
    bundled.add(batch.id);
    entries.push({
      kind: "bundle",
      batch,
      openable: true,
      logs: logs.filter((candidate) => candidate.batchItem?.batchOperation.id === batch.id),
    });
  }

  return entries;
}

function readSummary(batch: BatchOperationForLog) {
  return typeof batch.summary === "object" && batch.summary !== null
    ? batch.summary
    : {};
}

function summarizeBundle(entry: Extract<StockLogEntry, { kind: "bundle" }>) {
  const summary = readSummary(entry.batch);
  const first = entry.logs[0];
  const pending = Number(summary.pendingCount ?? entry.logs.filter((log) => log.status === "PENDING").length);
  const approved = Number(summary.approvedCount ?? entry.logs.filter((log) => log.status === "APPROVED").length);
  const rejected = Number(summary.rejectedCount ?? entry.logs.filter((log) => log.status === "REJECTED").length);
  const total = Number(summary.totalCount ?? summary.productCount ?? summary.inventoryLogCount ?? entry.logs.length);

  return {
    productName: String(summary.productName || summary.supplierName || first?.note || "Bundle stok"),
    note: typeof summary.note === "string" ? summary.note : first?.note || "",
    requester: first?.person || "-",
    createdBy: entry.batch.createdBy,
    createdAt: first?.createdAt || entry.batch.createdAt,
    type: first?.type || "IN",
    total,
    pending,
    approved,
    rejected,
  };
}

function bundleStatusLabel(summary: ReturnType<typeof summarizeBundle>) {
  if (summary.pending > 0 && (summary.approved > 0 || summary.rejected > 0)) return "Sebagian";
  if (summary.pending > 0) return "Pending";
  if (summary.approved > 0 && summary.rejected > 0) return "Sebagian";
  if (summary.approved > 0) return "Disetujui";
  if (summary.rejected > 0) return "Ditolak";
  return "Pending";
}

function bundleCountLabel(summary: ReturnType<typeof summarizeBundle>) {
  if (summary.pending > 0) return { count: summary.pending, label: "pending", color: "text-cyan-700" };
  if (summary.approved > 0 && summary.rejected === 0) return { count: summary.approved, label: "approved", color: "text-emerald-700" };
  if (summary.rejected > 0 && summary.approved === 0) return { count: summary.rejected, label: "rejected", color: "text-red-600" };
  return { count: summary.approved + summary.rejected, label: "decided", color: "text-violet-700" };
}

function BundleDesktopRow({
  entry,
  userId,
  onOpen,
  onCancel,
}: {
  entry: Extract<StockLogEntry, { kind: "bundle" }>;
  userId: string | null;
  onOpen: () => void;
  onCancel: () => void;
}) {
  const summary = summarizeBundle(entry);
  const cfg = typeConfig[summary.type];
  const canCancel = summary.createdBy === userId && summary.pending > 0;
  const countLabel = bundleCountLabel(summary);
  const openable = entry.openable !== false;

  return (
    <tr
      onClick={openable ? onOpen : undefined}
      className={`group border-b border-cyan-100/70 bg-gradient-to-r from-cyan-50/90 via-white to-violet-50/70 shadow-[inset_0_0_0_1px_rgba(6,182,212,0.14),0_10px_28px_rgba(6,182,212,0.14)] transition-all duration-200 hover:from-cyan-100/80 hover:to-violet-100/70 hover:shadow-[inset_0_0_0_1px_rgba(124,58,237,0.18),0_14px_36px_rgba(124,58,237,0.18)] ${openable ? "cursor-pointer" : ""}`}
    >
      <td className="py-3 px-3 align-middle relative">
        <span aria-hidden="true" className="absolute left-0 top-1 bottom-1 w-1 rounded-r-full bg-gradient-to-b from-cyan-400 via-blue-500 to-violet-500 shadow-[0_0_16px_rgba(6,182,212,0.75)]" />
        <div className="flex flex-col gap-1">
          <span className="inline-flex w-fit max-w-[65px] gap-1.5 rounded-md border border-cyan-200 bg-white/85 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-700 shadow-[0_0_16px_rgba(6,182,212,0.18)]">
            Bundle Request
          </span>
          <span className="inline-flex w-fit items-center rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
            {bundleStatusLabel(summary)}
          </span>
        </div>
      </td>
      <td className="py-3 px-3 align-middle">
        <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatDate(summary.createdAt)}</p>
        <p className="text-[11px] text-slate-400 tabular-nums">{formatTime(summary.createdAt)}</p>
      </td>
      <td className="py-3 px-3 align-middle">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-100 text-cyan-700 shadow-[0_0_18px_rgba(6,182,212,0.28)]">
            <PackagePlus className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="max-w-[220px] truncate text-sm font-bold text-slate-950">{summary.productName}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">{summary.total} produk dalam bundle</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-3 align-middle">
        <span className={`inline-flex items-center gap-1.5 rounded-lg border bg-white/80 px-2.5 py-1 text-xs font-bold shadow-sm ${cfg.color} ${cfg.border}`}>
          {cfg.icon} {cfg.label}
        </span>
      </td>
      <td className="py-3 px-3 align-middle text-right">
        <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-100 bg-white/75 px-2.5 py-1.5 shadow-sm">
          <span className={`text-sm font-black tabular-nums ${countLabel.color}`}>{countLabel.count}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{countLabel.label}</span>
        </div>
      </td>
      <td className="py-3 px-3 align-middle">
        <p className="max-w-[120px] truncate text-xs font-medium text-slate-700">{summary.requester}</p>
      </td>
      <td className="py-3 px-3 align-middle">
        <p className="max-w-[250px] whitespace-normal break-words text-sm text-slate-500">{summary.note || "-"}</p>
      </td>
      <td className="py-3 px-3 align-middle">
        {canCancel ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCancel();
            }}
            className="inline-flex min-h-8 items-center justify-center rounded-lg border border-slate-200 bg-white/75 px-2.5 text-xs font-semibold text-slate-500 shadow-sm transition-colors hover:bg-slate-50"
          >
            Batalkan
          </button>
        ) : openable ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-cyan-700">
            Detail
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        ) : (
          <span className="text-xs font-bold text-slate-400">Grouped</span>
        )}
      </td>
    </tr>
  );
}

function BundleMobileCard({
  entry,
  userId,
  onOpen,
  onCancel,
}: {
  entry: Extract<StockLogEntry, { kind: "bundle" }>;
  userId: string | null;
  onOpen: () => void;
  onCancel: () => void;
}) {
  const summary = summarizeBundle(entry);
  const cfg = typeConfig[summary.type];
  const canCancel = summary.createdBy === userId && summary.pending > 0;
  const countLabel = bundleCountLabel(summary);
  const openable = entry.openable !== false;

  return (
    <div
      onClick={openable ? onOpen : undefined}
      className={`relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-violet-50 p-4 shadow-[0_14px_38px_rgba(6,182,212,0.18),inset_0_0_0_1px_rgba(124,58,237,0.08)] transition-all duration-200 hover:shadow-[0_18px_46px_rgba(124,58,237,0.22),inset_0_0_0_1px_rgba(6,182,212,0.18)] ${openable ? "cursor-pointer" : ""}`}
    >
      <span aria-hidden="true" className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-cyan-400 via-blue-500 to-violet-500 shadow-[0_0_16px_rgba(6,182,212,0.8)]" />
      <span aria-hidden="true" className="absolute right-4 top-4 h-12 w-12 rounded-full bg-cyan-300/30 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-100 text-cyan-700 shadow-[0_0_18px_rgba(6,182,212,0.28)]">
            <PackagePlus className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="mb-1 inline-flex rounded-full border border-cyan-200 bg-white/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-700">
              Bundle Request
            </span>
            <p className="truncate text-sm font-bold text-slate-950">{summary.productName}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold text-slate-400">{relativeTime(summary.createdAt)}</p>
          <span className="mt-1 inline-flex rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
            {bundleStatusLabel(summary)}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-md border bg-white/80 px-2 py-0.5 text-[10px] font-bold ${cfg.color} ${cfg.border}`}>
          {cfg.icon} {cfg.label}
        </span>
        <span className={`inline-flex rounded-md border border-cyan-100 bg-white/80 px-2 py-0.5 text-[10px] font-bold ${countLabel.color}`}>
          {countLabel.count} {countLabel.label}
        </span>
        <span className="text-xs font-semibold text-slate-500">{summary.total} produk</span>
      </div>
      <div className="mt-3 border-t border-cyan-100/70 pt-3">
        <p className="text-xs font-medium text-slate-600">Pemohon: {summary.requester}</p>
        {summary.note && <p className="mt-1 text-xs text-slate-500">{summary.note}</p>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {canCancel ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCancel();
            }}
            className="min-h-9 rounded-lg border border-slate-200 bg-white/80 px-2.5 text-xs font-semibold text-slate-500 shadow-sm hover:bg-slate-50"
          >
            Batalkan
          </button>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-1 text-xs font-bold text-cyan-700">
          {openable ? "Detail" : "Grouped"}
          {openable && <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </div>
    </div>
  );
}

function RowActions({
  log,
  isOwner,
  canCancel,
  isApproving,
  isRejecting,
  onApprove,
  onStartReject,
  onCancel,
  compact = true,
}: {
  log: InventoryLog;
  isOwner: boolean;
  canCancel: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  onApprove: () => void;
  onStartReject: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  if (log.status !== "PENDING") {
    return <span className="text-xs text-slate-300">—</span>;
  }
  if (isOwner) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={onApprove}
          disabled={isApproving || isRejecting}
          className={`inline-flex items-center justify-center gap-1 ${compact ? "min-h-8" : "min-h-9 flex-1"} px-2.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40`}
        >
          <Check className="w-3.5 h-3.5" />
          Setuju
        </button>
        <button
          type="button"
          onClick={onStartReject}
          disabled={isApproving || isRejecting}
          className={`inline-flex items-center justify-center gap-1 ${compact ? "min-h-8" : "min-h-9 flex-1"} px-2.5 rounded-lg text-xs font-bold bg-white text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40`}
        >
          <X className="w-3.5 h-3.5" />
          Tolak
        </button>
      </div>
    );
  }
  if (canCancel) {
    return (
      <button
        type="button"
        onClick={onCancel}
        className={`inline-flex items-center justify-center ${compact ? "min-h-8" : "min-h-9"} px-2.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40`}
      >
        Batalkan
      </button>
    );
  }
  return <span className="text-xs text-slate-300">—</span>;
}

function RejectComposer({
  reason,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  reason: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-bold uppercase tracking-wider text-red-700">
        Alasan penolakan
      </label>
      <textarea
        value={reason}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Misal: stok tidak mencukupi, dokumen tidak valid, …"
        rows={2}
        maxLength={500}
        className="w-full px-3 py-2 rounded-xl border border-red-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 resize-none"
      />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-slate-400">{reason.length}/500</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="min-h-9 px-3 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="min-h-9 px-3 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Menolak…" : "Tolak Permintaan"}
          </button>
        </div>
      </div>
    </div>
  );
}

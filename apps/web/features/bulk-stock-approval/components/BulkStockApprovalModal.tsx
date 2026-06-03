"use client";

import React, { useMemo, useState } from "react";
import { Button, Modal } from "@pos/ui";
import { AlertCircle, Check, PackagePlus, Pencil, RefreshCw, Save, X } from "lucide-react";
import { useBulkBatchDetail } from "@/hooks/useInventoryLogs";
import { useRole } from "@/components/providers/RoleProvider";
import {
  useApproveBulkAll,
  useApproveBulkItem,
  useEditBulkItem,
  useRejectBulkAll,
  useRejectBulkItem,
} from "../hooks/useBulkApproval";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function snapshotStock(value: unknown) {
  const snapshot = asRecord(value);
  const stock = Number(snapshot.stock);
  return Number.isFinite(stock) ? stock : null;
}

function statusClass(status: string) {
  if (status === "PENDING") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

export function BulkStockApprovalModal({
  batchId,
  open,
  onClose,
}: {
  batchId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { role } = useRole();
  const detail = useBulkBatchDetail(batchId);
  const approveItem = useApproveBulkItem(batchId || "");
  const rejectItem = useRejectBulkItem(batchId || "");
  const editItem = useEditBulkItem(batchId || "");
  const approveAll = useApproveBulkAll(batchId || "");
  const rejectAll = useRejectBulkAll(batchId || "");
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [rejectingLogId, setRejectingLogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectAllReason, setRejectAllReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const batch = detail.data;
  const summary = asRecord(batch?.summary);
  const title = String(summary.productName || summary.supplierName || "Permintaan Stok Massal");
  const pendingCount = useMemo(
    () => batch?.items.filter((item) => item.inventoryLog?.status === "PENDING").length ?? 0,
    [batch],
  );

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      setEditingLogId(null);
      setRejectingLogId(null);
      setRejectReason("");
      setRejectAllReason("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="5xl" className="max-h-[92dvh] translate-y-0 sm:max-h-[88vh]">
      {detail.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Memuat detail bundle...
        </div>
      ) : detail.isError || !batch ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Gagal memuat detail bundle.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-violet-50 p-3 text-sm shadow-[0_16px_42px_rgba(6,182,212,0.16),inset_0_0_0_1px_rgba(124,58,237,0.08)] sm:p-4">
            <span aria-hidden="true" className="absolute right-3 top-3 h-16 w-16 rounded-full bg-cyan-300/30 blur-2xl" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-100 text-cyan-700 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                  <PackagePlus className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <span className="inline-flex rounded-full border border-cyan-200 bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-700">
                    Bundle Request
                  </span>
                  <p className="mt-1 truncate text-base font-black text-slate-950 sm:text-lg">{title}</p>
                  {batch.creator?.name && <p className="text-xs font-semibold text-slate-500">Pemohon: {batch.creator.name}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center">
                <span className={`inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-[10px] font-black uppercase tracking-wider ${statusClass(batch.status)}`}>
                  {batch.status}
                </span>
                <span className="inline-flex items-center justify-center rounded-xl border border-cyan-100 bg-white/80 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-700 shadow-sm">
                  {pendingCount}/{batch.items.length} pending
                </span>
              </div>
            </div>
            {typeof summary.note === "string" && summary.note.trim() && (
              <p className="relative mt-3 rounded-xl border border-cyan-100 bg-white/70 px-3 py-2 text-xs text-slate-600 sm:text-sm">{summary.note}</p>
            )}
          </div>

          {error && (
            <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {pendingCount > 0 && role !== "ADMIN" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <Button
                type="button"
                onClick={() => run(() => approveAll.mutateAsync())}
                loading={approveAll.isPending}
                icon={<Check className="h-4 w-4" />}
                className="w-full bg-emerald-600 hover:bg-emerald-700 lg:w-auto"
              >
                Setujui Semua
              </Button>
              <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-xl">
                <input
                  value={rejectAllReason}
                  onChange={(event) => setRejectAllReason(event.target.value)}
                  placeholder="Alasan tolak semua"
                  className="min-h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => run(() => rejectAll.mutateAsync(rejectAllReason.trim()))}
                  disabled={!rejectAllReason.trim()}
                  loading={rejectAll.isPending}
                  icon={<X className="h-4 w-4" />}
                  className="w-full sm:w-auto"
                >
                  Tolak Semua
                </Button>
              </div>
              </div>
            </div>
          )}

          <div className="space-y-3 md:hidden">
            {batch.items.map((item) => {
              const log = item.inventoryLog;
              if (!log) return null;
              const productName = item.product?.name || log.product?.name || "Produk";
              const unit = log.product?.unit || "unit";
              const isPending = log.status === "PENDING";
              const afterStock = snapshotStock(item.afterSnapshot);
              const isEditing = editingLogId === log.id;
              const isRejecting = rejectingLogId === log.id;
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-cyan-100 bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">{productName}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.sku}</p>
                    </div>
                    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-black ${statusClass(log.status)}`}>
                      {log.status}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Qty</p>
                      {isEditing ? (
                        <input
                          type="number"
                          min="1"
                          value={editQuantity}
                          onChange={(event) => setEditQuantity(event.target.value)}
                          className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold"
                        />
                      ) : (
                        <p className="mt-1 text-sm font-black text-slate-900 tabular-nums">{log.quantity} {unit}</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-cyan-700">Stok Setelah</p>
                      <p className="mt-1 text-sm font-black text-slate-900 tabular-nums">
                        {afterStock === null ? "-" : `${afterStock} ${unit}`}
                      </p>
                    </div>
                  </div>

                  {log.rejectionReason && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{log.rejectionReason}</p>}

                  {isPending ? (
                    role !== "ADMIN" ? (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          aria-label={`Setujui ${productName}`}
                          onClick={() => run(() => approveItem.mutateAsync(log.id))}
                          className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Setuju
                        </button>
                        {isEditing ? (
                          <button
                            type="button"
                            aria-label={`Simpan jumlah ${productName}`}
                            onClick={() => run(() => editItem.mutateAsync({ inventoryLogId: log.id, quantity: Number(editQuantity) }))}
                            className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            <Save className="h-3.5 w-3.5" />
                            Simpan
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Edit jumlah ${productName}`}
                            onClick={() => {
                              setEditingLogId(log.id);
                              setEditQuantity(String(log.quantity));
                            }}
                            className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Tolak ${productName}`}
                          onClick={() => {
                            setRejectingLogId(log.id);
                            setRejectReason("");
                          }}
                          className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-red-200 bg-white px-2 text-xs font-bold text-red-600 hover:bg-red-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          Tolak
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs font-semibold text-slate-400">Menunggu keputusan</p>
                    )
                  ) : (
                    <p className="mt-3 text-xs font-semibold text-slate-400">Sudah diputuskan</p>
                  )}

                  {isRejecting && (
                    <div className="mt-3 rounded-xl border border-red-100 bg-red-50/60 p-2">
                      <input
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        placeholder="Alasan penolakan"
                        className="min-h-10 w-full rounded-xl border border-red-200 px-3 text-sm"
                      />
                      <Button
                        type="button"
                        variant="danger"
                        disabled={!rejectReason.trim()}
                        loading={rejectItem.isPending}
                        onClick={() => run(() => rejectItem.mutateAsync({ inventoryLogId: log.id, reason: rejectReason.trim() }))}
                        className="mt-2 w-full"
                      >
                        Tolak Item
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-3 py-2">Produk</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Stok Setelah</th>
                  <th className="px-3 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {batch.items.map((item) => {
                  const log = item.inventoryLog;
                  if (!log) return null;
                  const productName = item.product?.name || log.product?.name || "Produk";
                  const unit = log.product?.unit || "unit";
                  const isPending = log.status === "PENDING";
                  const afterStock = snapshotStock(item.afterSnapshot);
                  const isEditing = editingLogId === log.id;
                  const isRejecting = rejectingLogId === log.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <p className="font-semibold text-slate-900">{productName}</p>
                          <p className="text-[10px] font-bold text-slate-400">{item.sku}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${statusClass(log.status)}`}>
                            {log.status}
                          </span>
                          {log.rejectionReason && <p className="mt-1 text-xs text-red-600">{log.rejectionReason}</p>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {isEditing ? (
                            <input
                              type="number"
                              min="1"
                              value={editQuantity}
                              onChange={(event) => setEditQuantity(event.target.value)}
                              className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right"
                            />
                          ) : (
                            `${log.quantity} ${unit}`
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {afterStock === null ? "-" : `${afterStock} ${unit}`}
                        </td>
                        <td className="px-3 py-2">
                          {isPending ? (
                            role !== "ADMIN" ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  aria-label={`Setujui ${productName}`}
                                  onClick={() => run(() => approveItem.mutateAsync(log.id))}
                                  className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Setuju
                                </button>
                                {isEditing ? (
                                  <button
                                    type="button"
                                    aria-label={`Simpan jumlah ${productName}`}
                                    onClick={() => run(() => editItem.mutateAsync({ inventoryLogId: log.id, quantity: Number(editQuantity) }))}
                                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                  >
                                    <Save className="h-3.5 w-3.5" />
                                    Simpan
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    aria-label={`Edit jumlah ${productName}`}
                                    onClick={() => {
                                      setEditingLogId(log.id);
                                      setEditQuantity(String(log.quantity));
                                    }}
                                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                  </button>
                                )}
                                <button
                                  type="button"
                                  aria-label={`Tolak ${productName}`}
                                  onClick={() => {
                                    setRejectingLogId(log.id);
                                    setRejectReason("");
                                  }}
                                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-xs font-bold text-red-600 hover:bg-red-50"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Tolak
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Menunggu keputusan</span>
                            )
                          ) : (
                            <span className="text-xs text-slate-400">Sudah diputuskan</span>
                          )}
                        </td>
                      </tr>
                      {isRejecting && (
                        <tr className="border-t border-red-100 bg-red-50/40">
                          <td colSpan={5} className="px-3 py-2">
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <input
                                value={rejectReason}
                                onChange={(event) => setRejectReason(event.target.value)}
                                placeholder="Alasan penolakan"
                                className="min-h-10 flex-1 rounded-xl border border-red-200 px-3 text-sm"
                              />
                              <Button
                                type="button"
                                variant="danger"
                                disabled={!rejectReason.trim()}
                                loading={rejectItem.isPending}
                                onClick={() => run(() => rejectItem.mutateAsync({ inventoryLogId: log.id, reason: rejectReason.trim() }))}
                              >
                                Tolak Item
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

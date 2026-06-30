"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Modal, Button } from "@pos/ui";
import { Loader2, PackageOpen, CheckCircle, Clock, XCircle, AlertTriangle } from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import {
  approveInboundReceipt,
  fetchInboundReceipts,
  needsRevisionInboundReceipt,
  rejectInboundReceipt,
  updateAndSubmitInboundReceipt,
  type InboundReceiptListItem,
  type InboundReceiptListLine,
} from "../api/inventory-management-api";
import type { InboundReceiptStatus } from "../types/inventory-management";

export interface InboundReceiptRowActionInput {
  status: InboundReceiptStatus;
  isCreator: boolean;
  canUpdateInventory: boolean;
  canApproveInboundReceipt: boolean;
  canRejectInboundReceipt: boolean;
  canReviseInboundReceipt: boolean;
}

export interface InboundReceiptRowAction {
  key: "edit-submit" | "approve" | "reject" | "revise";
  label: string;
}

export function getInboundReceiptRowActions(
  input: InboundReceiptRowActionInput,
): InboundReceiptRowAction[] {
  if (
    input.isCreator &&
    input.canUpdateInventory &&
    (input.status === "DRAFT" || input.status === "NEEDS_REVISION")
  ) {
    return [{ key: "edit-submit", label: "Edit & Ajukan" }];
  }

  if (input.status !== "SUBMITTED") return [];

  const actions: InboundReceiptRowAction[] = [];
  if (input.canApproveInboundReceipt) {
    actions.push({ key: "approve", label: "Setujui" });
  }
  if (input.canRejectInboundReceipt) {
    actions.push({ key: "reject", label: "Tolak" });
  }
  if (input.canReviseInboundReceipt) {
    actions.push({ key: "revise", label: "Minta Revisi" });
  }
  return actions;
}

export const InboundReceiptTab: React.FC = () => {
  const { userId, canPerform } = useRole();
  const [receipts, setReceipts] = useState<InboundReceiptListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InboundReceiptStatus | "ALL">("ALL");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [editingReceipt, setEditingReceipt] = useState<InboundReceiptListItem | null>(null);

  const canUpdateInventory = canPerform("inventory", "update");
  const canApproveInboundReceipt = canPerform("inventory.inbound_receipt.approve", "update");
  const canRejectInboundReceipt = canPerform("inventory.inbound_receipt.reject", "update");
  const canReviseInboundReceipt = canPerform("inventory.inbound_receipt.revise", "update");

  const loadReceipts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchInboundReceipts(
        statusFilter === "ALL" ? {} : { status: statusFilter },
      );
      setReceipts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar penerimaan barang");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  const refreshAfterAction = async (message: string) => {
    setActionMessage(message);
    await loadReceipts();
  };

  const runReceiptAction = async (
    actionKey: string,
    task: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setPendingAction(actionKey);
    setError(null);
    try {
      await task();
      await refreshAfterAction(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi penerimaan barang gagal diproses");
    } finally {
      setPendingAction(null);
    }
  };

  const handleApprove = (receipt: InboundReceiptListItem) =>
    runReceiptAction(
      `${receipt.id}:approve`,
      () => approveInboundReceipt(receipt.id),
      "Penerimaan barang berhasil disetujui.",
    );

  const handleReject = (receipt: InboundReceiptListItem) => {
    const reason = window.prompt("Tulis alasan penolakan. Gunakan ini jika supplier atau invoice salah.");
    if (!reason?.trim()) return;
    return runReceiptAction(
      `${receipt.id}:reject`,
      () => rejectInboundReceipt(receipt.id, reason),
      "Penerimaan barang berhasil ditolak.",
    );
  };

  const handleNeedsRevision = (receipt: InboundReceiptListItem) => {
    const reason = window.prompt("Tulis alasan revisi qty, status line, atau catatan.");
    if (!reason?.trim()) return;
    return runReceiptAction(
      `${receipt.id}:revise`,
      () => needsRevisionInboundReceipt(receipt.id, reason),
      "Penerimaan barang dikirim kembali untuk revisi.",
    );
  };

  const handleEditSubmitSuccess = async () => {
    setEditingReceipt(null);
    await refreshAfterAction("Penerimaan barang berhasil diajukan ulang ke owner.");
  };

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-500 shadow-sm">
        <p className="text-sm font-semibold">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Riwayat Penerimaan Barang</h2>
            <p className="mt-1 text-sm text-slate-500">Daftar transaksi barang masuk yang telah tercatat di sistem.</p>
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {[
              ["ALL", "Semua"],
              ["DRAFT", "Draft"],
              ["SUBMITTED", "Diajukan"],
              ["NEEDS_REVISION", "Perlu Revisi"],
              ["APPROVED", "Disetujui"],
              ["REJECTED", "Ditolak"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value as InboundReceiptStatus | "ALL")}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-black transition ${
                  statusFilter === value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {actionMessage && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            {actionMessage}
          </div>
        )}
        
        {receipts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <PackageOpen className="h-6 w-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Belum ada Penerimaan Barang</h3>
            <p className="text-xs text-slate-500 max-w-[250px]">
              Belum ada riwayat penerimaan barang masuk dari supplier.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Tanggal</th>
                  <th className="px-4 py-3">Supplier / Referensi</th>
                  <th className="px-4 py-3">Total Item</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 rounded-tr-lg text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.map((receipt) => {
                  let StatusIcon = Clock;
                  let statusColor = "bg-slate-100 text-slate-700";

                  if (receipt.status === "APPROVED") {
                    StatusIcon = CheckCircle;
                    statusColor = "bg-emerald-100 text-emerald-700";
                  } else if (receipt.status === "DRAFT") {
                    StatusIcon = Clock;
                    statusColor = "bg-slate-100 text-slate-600";
                  } else if (receipt.status === "SUBMITTED") {
                    StatusIcon = Clock;
                    statusColor = "bg-amber-100 text-amber-700";
                  } else if (receipt.status === "REJECTED" || receipt.status === "CANCELLED") {
                    StatusIcon = XCircle;
                    statusColor = "bg-rose-100 text-rose-700";
                  } else if (receipt.status === "NEEDS_REVISION") {
                    StatusIcon = AlertTriangle;
                    statusColor = "bg-orange-100 text-orange-700";
                  }

                  const STATUS_LABELS: Record<string, string> = {
                    DRAFT: "Draft",
                    SUBMITTED: "Diajukan",
                    APPROVED: "Disetujui",
                    REJECTED: "Ditolak",
                    CANCELLED: "Dibatalkan",
                    NEEDS_REVISION: "Perlu Revisi",
                  };
                  const statusText = STATUS_LABELS[receipt.status] ?? receipt.status;
                  const totalItems = receipt.lines?.length || 0;
                  const actions = getInboundReceiptRowActions({
                    status: receipt.status,
                    isCreator: Boolean(userId && receipt.submittedBy === userId),
                    canUpdateInventory,
                    canApproveInboundReceipt,
                    canRejectInboundReceipt,
                    canReviseInboundReceipt,
                  });

                  return (
                    <React.Fragment key={receipt.id}>
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {new Date(receipt.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">
                            {receipt.supplier?.name || "Tanpa Supplier"}
                          </div>
                          {receipt.note && (
                            <div className="text-xs text-slate-500 truncate max-w-[200px]">
                              {receipt.note}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {totalItems} produk
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${statusColor}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusText}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedId(expandedId === receipt.id ? null : receipt.id)}
                              className="cursor-pointer text-xs font-bold text-indigo-600 transition-colors hover:text-indigo-800"
                            >
                              {expandedId === receipt.id ? "Tutup Detail" : "Lihat Detail"}
                            </button>
                            {actions.map((action) => {
                              const actionId = `${receipt.id}:${action.key}`;
                              const isPending = pendingAction === actionId;
                              const commonClass =
                                "rounded-lg px-2.5 py-1 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60";
                              if (action.key === "edit-submit") {
                                return (
                                  <button
                                    key={action.key}
                                    type="button"
                                    onClick={() => setEditingReceipt(receipt)}
                                    className={`${commonClass} bg-slate-900 text-white hover:bg-slate-800`}
                                  >
                                    {action.label}
                                  </button>
                                );
                              }
                              if (action.key === "approve") {
                                return (
                                  <button
                                    key={action.key}
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => void handleApprove(receipt)}
                                    className={`${commonClass} bg-emerald-100 text-emerald-800 hover:bg-emerald-200`}
                                  >
                                    {isPending ? "Memproses..." : action.label}
                                  </button>
                                );
                              }
                              if (action.key === "reject") {
                                return (
                                  <button
                                    key={action.key}
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => void handleReject(receipt)}
                                    className={`${commonClass} bg-rose-100 text-rose-800 hover:bg-rose-200`}
                                  >
                                    {isPending ? "Memproses..." : action.label}
                                  </button>
                                );
                              }
                              return (
                                <button
                                  key={action.key}
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => void handleNeedsRevision(receipt)}
                                  className={`${commonClass} bg-amber-100 text-amber-800 hover:bg-amber-200`}
                                >
                                  {isPending ? "Memproses..." : action.label}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                      {expandedId === receipt.id && (
                        <tr>
                          <td colSpan={5} className="px-4 py-3 bg-slate-50/50 border-t border-b border-slate-100">
                            <div className="space-y-3">
                              {(receipt.revisionReason || receipt.rejectionReason) && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                                  {receipt.revisionReason
                                    ? `Alasan revisi: ${receipt.revisionReason}`
                                    : `Alasan penolakan: ${receipt.rejectionReason}`}
                                </div>
                              )}
                              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-100/50 text-slate-500 uppercase font-black">
                                  <tr>
                                    <th className="px-3 py-2">Produk</th>
                                    <th className="px-3 py-2">Ekspektasi</th>
                                    <th className="px-3 py-2">Diterima</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2">Catatan</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-600">
                                  {receipt.lines?.map((line) => (
                                    <tr key={line.id}>
                                      <td className="px-3 py-2">
                                        <div className="font-bold text-slate-800">{line.productNameSnapshot || 'Produk'}</div>
                                        <div className="text-slate-400">{line.skuSnapshot || '-'}</div>
                                      </td>
                                      <td className="px-3 py-2">{line.expectedQuantity} {line.unitSnapshot || ''}</td>
                                      <td className="px-3 py-2 font-bold">{line.receivedQuantity} {line.unitSnapshot || ''}</td>
                                      <td className="px-3 py-2">
                                        <span className={`inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600`}>
                                          {line.status}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 max-w-[150px] truncate">{line.note || '-'}</td>
                                    </tr>
                                  ))}
                                  {totalItems === 0 && (
                                    <tr>
                                      <td colSpan={5} className="px-3 py-4 text-center text-slate-400">Tidak ada item</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                              </div>
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
        )}
      </div>
      {editingReceipt && (
        <InboundReceiptEditModal
          receipt={editingReceipt}
          onClose={() => setEditingReceipt(null)}
          onSuccess={() => void handleEditSubmitSuccess()}
        />
      )}
    </div>
  );
};

function InboundReceiptEditModal({
  receipt,
  onClose,
  onSuccess,
}: {
  receipt: InboundReceiptListItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [lineInputs, setLineInputs] = useState<Record<string, InboundReceiptListLine>>(
    () =>
      Object.fromEntries(
        receipt.lines.map((line) => [
          line.id,
          {
            ...line,
          },
        ]),
      ),
  );
  const [note, setNote] = useState(receipt.note ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLine = (
    lineId: string,
    patch: Partial<Pick<InboundReceiptListLine, "expectedQuantity" | "receivedQuantity" | "status" | "note">>,
  ) => {
    setLineInputs((current) => ({
      ...current,
      [lineId]: {
        ...current[lineId],
        ...patch,
      },
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const lines = Object.values(lineInputs).map((line) => ({
      id: line.id,
      productId: line.productId,
      expectedQuantity: Number(line.expectedQuantity),
      receivedQuantity: Number(line.receivedQuantity),
      status: line.status as any,
      note: line.note || null,
    }));
    if (lines.some((line) => line.expectedQuantity <= 0 || line.receivedQuantity < 0)) {
      setError("Qty ekspektasi dan qty diterima wajib valid.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await updateAndSubmitInboundReceipt(receipt.id, {
        note: note || null,
        lines,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Penerimaan barang gagal diajukan ulang");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit Penerimaan Barang" size="3xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {error}
          </div>
        )}
        {receipt.revisionReason && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="font-black">Alasan revisi owner:</span> {receipt.revisionReason}
          </div>
        )}

        <div className="space-y-3">
          {Object.values(lineInputs).map((line) => (
            <div key={line.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3">
                <p className="text-sm font-black text-slate-900">{line.productNameSnapshot || "Produk"}</p>
                <p className="text-xs text-slate-500">{line.skuSnapshot || "-"}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="text-xs font-bold text-slate-600">
                  Qty Ekspektasi
                  <input
                    type="number"
                    min={1}
                    value={line.expectedQuantity}
                    onChange={(event) =>
                      updateLine(line.id, { expectedQuantity: Number(event.target.value) })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Qty Diterima
                  <input
                    type="number"
                    min={0}
                    value={line.receivedQuantity}
                    onChange={(event) =>
                      updateLine(line.id, { receivedQuantity: Number(event.target.value) })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Status Line
                  <select
                    value={line.status}
                    onChange={(event) => updateLine(line.id, { status: event.target.value })}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  >
                    {["RECEIVED", "PARTIAL", "MISSING", "DAMAGED", "MISMATCH", "OVER_RECEIVED"].map(
                      (status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Catatan
                  <input
                    value={line.note ?? ""}
                    onChange={(event) => updateLine(line.id, { note: event.target.value })}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                    placeholder="Wajib untuk issue"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <label className="block text-xs font-bold text-slate-600">
          Catatan Receipt
          <textarea
            value={note}
            rows={2}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
        </label>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-slate-900 text-white">
            {isSubmitting ? "Memproses..." : "Ajukan Ulang"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

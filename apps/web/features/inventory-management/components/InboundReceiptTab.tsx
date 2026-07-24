"use client";

import React from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  PackageOpen,
  XCircle,
} from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import {
  fetchInboundReceipts,
  type InboundReceiptListItem,
} from "../api/inventory-management-api";
import type { InboundReceiptStatus } from "../types/inventory-management";
import { InboundReceiptReviewModal } from "./InboundReceiptReviewModal";

export interface InboundReceiptRowActionInput {
  status: InboundReceiptStatus;
  canApproveInboundReceipt: boolean;
  canRejectInboundReceipt: boolean;
}

export interface InboundReceiptRowAction {
  key: "process" | "reject";
  label: string;
}

export function getInboundReceiptRowActions(
  input: InboundReceiptRowActionInput,
): InboundReceiptRowAction[] {
  if (input.status !== "SUBMITTED") return [];
  const actions: InboundReceiptRowAction[] = [];
  if (input.canApproveInboundReceipt) {
    actions.push({ key: "process", label: "Proses" });
  }
  if (input.canRejectInboundReceipt) {
    actions.push({ key: "reject", label: "Tolak" });
  }
  return actions;
}

export interface InboundReceiptTabProps {
  goodsPurchaseId?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  NEEDS_REVISION: "Perlu Revisi (Legacy)",
};

export const InboundReceiptTab: React.FC<InboundReceiptTabProps> = ({
  goodsPurchaseId,
}) => {
  const { canPerform } = useRole();
  const [receipts, setReceipts] = React.useState<InboundReceiptListItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [reviewingReceipt, setReviewingReceipt] =
    React.useState<InboundReceiptListItem | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<
    InboundReceiptStatus | "ALL"
  >("ALL");

  const canApprove = canPerform(
    "inventory.inbound_receipt.approve",
    "update",
  );
  const canReject = canPerform(
    "inventory.inbound_receipt.reject",
    "update",
  );
  const canEdit = canPerform("inventory.inbound_receipt.edit", "update");

  const loadReceipts = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setReceipts(
        await fetchInboundReceipts({
          ...(statusFilter === "ALL" ? {} : { status: statusFilter }),
          ...(goodsPurchaseId ? { goodsPurchaseId } : {}),
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Gagal memuat daftar penerimaan barang.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [goodsPurchaseId, statusFilter]);

  React.useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  const handleSuccess = (nextMessage: string) => {
    setMessage(nextMessage);
    void loadReceipts();
  };

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error && !reviewingReceipt) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Riwayat Penerimaan Barang
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Proses persetujuan dilakukan per produk.
            </p>
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {[
              ["ALL", "Semua"],
              ["SUBMITTED", "Diajukan"],
              ["APPROVED", "Disetujui"],
              ["REJECTED", "Ditolak"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setStatusFilter(value as InboundReceiptStatus | "ALL")
                }
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-black ${
                  statusFilter === value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {message && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            {message}
          </div>
        )}

        {receipts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <PackageOpen className="h-8 w-8 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-900">
              {goodsPurchaseId
                ? "Belum ada riwayat penerimaan untuk Pembelian Barang ini"
                : "Belum ada Penerimaan Barang"}
            </h3>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Total Item</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.map((receipt) => {
                  const actions = getInboundReceiptRowActions({
                    status: receipt.status,
                    canApproveInboundReceipt: canApprove,
                    canRejectInboundReceipt: canReject,
                  });
                  const StatusIcon =
                    receipt.status === "APPROVED"
                      ? CheckCircle
                      : receipt.status === "REJECTED" ||
                          receipt.status === "CANCELLED"
                        ? XCircle
                        : receipt.status === "NEEDS_REVISION"
                          ? AlertTriangle
                          : Clock;
                  return (
                    <React.Fragment key={receipt.id}>
                      <tr>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {new Date(receipt.createdAt).toLocaleDateString(
                            "id-ID",
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {receipt.supplier?.name ?? "Tanpa Supplier"}
                        </td>
                        <td className="px-4 py-3">
                          {receipt.lines.length} produk
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                            <StatusIcon className="h-3 w-3" />
                            {STATUS_LABELS[receipt.status] ?? receipt.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="text-xs font-bold text-indigo-700"
                              onClick={() =>
                                setExpandedId(
                                  expandedId === receipt.id
                                    ? null
                                    : receipt.id,
                                )
                              }
                            >
                              {expandedId === receipt.id
                                ? "Tutup Detail"
                                : "Lihat Detail"}
                            </button>
                            {actions.map((action) => (
                              <button
                                key={action.key}
                                type="button"
                                onClick={() => setReviewingReceipt(receipt)}
                                className={`rounded-lg px-2.5 py-1 text-xs font-black ${
                                  action.key === "reject"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                      {expandedId === receipt.id && (
                        <tr>
                          <td colSpan={5} className="bg-slate-50 px-4 py-3">
                            {receipt.goodsPurchaseNumber && (
                              <p className="mb-2 text-xs font-black text-slate-600">
                                {receipt.goodsPurchaseNumber}
                              </p>
                            )}
                            <div className="space-y-2">
                              {receipt.lines.map((line) => (
                                <div
                                  key={line.id}
                                  className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs"
                                >
                                  <span className="font-bold text-slate-800">
                                    {line.productNameSnapshot ?? "Produk"}
                                  </span>
                                  <span>
                                    {line.receivedQuantity} /{" "}
                                    {line.expectedQuantity}{" "}
                                    {line.unitSnapshot ?? ""}
                                  </span>
                                  <span>
                                    {line.matchStatus === "MATCHED"
                                      ? "Sesuai"
                                      : "Tidak Sesuai"}
                                  </span>
                                  <span>
                                    {line.reviewStatus === "APPROVED"
                                      ? "Disetujui"
                                      : "Belum Ada Aksi"}
                                  </span>
                                </div>
                              ))}
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
      </section>

      {reviewingReceipt && (
        <InboundReceiptReviewModal
          open
          receipt={reviewingReceipt}
          canApprove={canApprove}
          canEdit={canEdit}
          canReject={canReject}
          onClose={() => setReviewingReceipt(null)}
          onSuccess={handleSuccess}
          onChanged={loadReceipts}
        />
      )}
    </div>
  );
};

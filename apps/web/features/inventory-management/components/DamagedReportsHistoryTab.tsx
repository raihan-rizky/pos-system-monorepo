"use client";

import React from "react";
import { AlertTriangle, Archive, Check, ExternalLink, ImageIcon, RefreshCw, Trash2, X } from "lucide-react";
import {
  type InventoryLog,
  useApproveInventoryLog,
  useInventoryLogs,
  useRejectInventoryLog,
} from "@/hooks/useInventoryLogs";
import { useRole } from "@/components/providers/RoleProvider";
import { getDefaultProductImage } from "@/lib/utils";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(status: InventoryLog["status"]) {
  if (status === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

function statusLabel(status: InventoryLog["status"]) {
  if (status === "PENDING") return "Pending";
  if (status === "APPROVED") return "Disetujui";
  return "Ditolak";
}

export function extractResolvedProofImageUrl(note: string | null) {
  if (!note) return null;
  const line = note
    .split(/\r?\n/)
    .find((item) => item.trim().toLowerCase().startsWith("resolved proof:"));
  return line?.replace(/^resolved proof:\s*/i, "").trim() || null;
}

function cleanDamageNote(note: string | null) {
  if (!note) return "-";
  const lines = note
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return (
        normalized &&
        !normalized.startsWith("proof url:") &&
        !normalized.startsWith("resolved proof:")
      );
    });
  return lines.join("\n") || "-";
}

export function DamagedReportsHistoryTab() {
  const { canPerform } = useRole();
  const canApprove = canPerform("inventory.approve", "update");
  const canDeleteProof = canPerform("proof_upload", "delete");
  const approveMutation = useApproveInventoryLog();
  const rejectMutation = useRejectInventoryLog();
  const [rejectingId, setRejectingId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [deletingProofId, setDeletingProofId] = React.useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useInventoryLogs({
    type: "OUT",
    reason: "WASTE",
    status: "PENDING,APPROVED,REJECTED",
    page: 1,
    limit: 30,
    days: 90,
  });

  const runDeleteProof = async (id: string) => {
    if (!window.confirm("Hapus foto bukti kerusakan ini? Tautannya juga akan dikosongkan dari laporan terkait.")) return;
    setDeletingProofId(id); setActionError(null);
    try {
      const response = await fetch(`/api/inventory-management/damaged-products/${id}/proof`, { method: "DELETE" });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Gagal menghapus foto bukti.");
      await refetch?.();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Gagal menghapus foto bukti.");
    } finally { setDeletingProofId(null); }
  };

  const logs = data?.data ?? [];
  const runApprove = async (id: string) => {
    setActionError(null);
    try {
      await approveMutation.mutateAsync(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal approve laporan");
    }
  };
  const runReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    setActionError(null);
    try {
      await rejectMutation.mutateAsync({ id, reason: rejectReason.trim() });
      setRejectingId(null);
      setRejectReason("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal reject laporan");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            Riwayat Laporan Barang Rusak
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Laporan rusak dari log stok WASTE dengan bukti foto yang diupload.
          </p>
        </div>
        {data?.pagination && (
          <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {data.pagination.total} laporan
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin text-rose-400" />
          <p className="text-sm font-medium">Memuat laporan barang rusak...</p>
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5 text-sm font-medium text-rose-700">
          Gagal memuat riwayat laporan barang rusak.
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Archive className="mb-3 h-10 w-10 opacity-40" />
          <p className="text-sm font-bold text-slate-700">Belum ada laporan barang rusak</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {actionError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {actionError}
            </div>
          )}
          {logs.map((log) => {
            const proofImageUrl = extractResolvedProofImageUrl(log.note);
            return (
              <article
                key={log.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                      <img
                        src={log.product.imageUrl || getDefaultProductImage(log.product.category?.name)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-bold text-slate-900">
                          {log.product.name}
                        </h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass(log.status)}`}>
                          {statusLabel(log.status)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {log.product.sku}
                      </p>
                      <p className="mt-2 text-xs text-slate-600">
                        Qty: <span className="font-bold">{log.quantity} {log.product.unit}</span>
                        {" "}oleh {log.person || "-"} pada {formatDateTime(log.createdAt)}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">
                        {cleanDamageNote(log.note)}
                      </p>
                    </div>
                  </div>

                  <div className="w-full shrink-0 sm:w-32">
                    {proofImageUrl ? (
                      <div className="space-y-1.5"><a
                        href={proofImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="group block overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                      >
                        <img
                          src={proofImageUrl}
                          alt="Bukti foto barang rusak"
                          className="h-24 w-full object-cover transition-transform group-hover:scale-105"
                        />
                        <span className="flex items-center justify-center gap-1.5 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-600">
                          Bukti foto barang rusak
                          <ExternalLink className="h-3 w-3" />
                        </span>
                      </a>
                      {canDeleteProof && (
                        <button type="button" onClick={() => void runDeleteProof(log.id)} disabled={deletingProofId === log.id} className="flex w-full items-center justify-center gap-1 rounded-lg bg-rose-600 px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-60">
                          <Trash2 className="h-3 w-3" />{deletingProofId === log.id ? "Menghapus..." : "Hapus foto"}
                        </button>
                      )}</div>
                    ) : (
                      <div className="flex h-24 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
                        <ImageIcon className="mb-1 h-5 w-5" />
                        <span className="text-[11px] font-bold">Tanpa thumbnail</span>
                      </div>
                    )}
                  </div>
                </div>
                {canApprove && log.status === "PENDING" && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    {rejectingId === log.id ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          placeholder="Alasan penolakan"
                          className="min-h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:border-rose-400 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => runReject(log.id)}
                          disabled={!rejectReason.trim() || rejectMutation.isPending}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 text-sm font-bold text-white disabled:bg-slate-300"
                        >
                          <X className="h-4 w-4" />
                          Tolak
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectReason("");
                          }}
                          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-600"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => runApprove(log.id)}
                          disabled={approveMutation.isPending}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                        >
                          <Check className="h-4 w-4" />
                          Setujui
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectingId(log.id)}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-sm font-bold text-rose-700 hover:bg-rose-50"
                        >
                          <X className="h-4 w-4" />
                          Tolak
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

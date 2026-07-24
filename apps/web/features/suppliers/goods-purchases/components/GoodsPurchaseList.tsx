"use client";

import { useState } from "react";
import { Button } from "@pos/ui";
import {
  CheckCircle2,
  Eye,
  Loader2,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { useGoodsPurchases } from "../hooks/useGoodsPurchases";
import type { GoodsPurchaseStatus } from "../types/goods-purchase";
import { GoodsPurchaseApprovalModal } from "./GoodsPurchaseApprovalModal";
import { GoodsPurchaseApprovedDialog } from "./GoodsPurchaseApprovedDialog";
import { GoodsPurchaseDetailModal } from "./GoodsPurchaseDetailModal";
import { GoodsPurchaseRejectModal } from "./GoodsPurchaseRejectModal";

const STATUS_LABELS = {
  PENDING: {
    label: "Menunggu Persetujuan",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  APPROVED: {
    label: "Disetujui",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  REJECTED: {
    label: "Ditolak",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
} as const;

export function GoodsPurchaseList({
  onCreateClick,
}: {
  onCreateClick: () => void;
}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<GoodsPurchaseStatus | "">("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [approvedDialogOpen, setApprovedDialogOpen] = useState(false);
  const { canPerform } = useRole();
  const canCreate = canPerform("supplier", "create");
  const canApprove = canPerform(
    "supplier.goods_purchase.approve",
    "update",
  );
  const canReject = canPerform(
    "supplier.goods_purchase.reject",
    "update",
  );
  const list = useGoodsPurchases({
    page,
    limit: 10,
    q: q.trim() || undefined,
    status: status || undefined,
  });
  const rows = list.data?.data ?? [];
  const pagination = list.data?.pagination;

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[1fr_220px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Cari nomor pembelian atau supplier..."
            className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm"
          />
        </label>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as GoodsPurchaseStatus | "");
            setPage(1);
          }}
          className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm"
        >
          <option value="">Semua status</option>
          <option value="PENDING">Menunggu Persetujuan</option>
          <option value="APPROVED">Disetujui</option>
          <option value="REJECTED">Ditolak</option>
        </select>
        {canCreate && (
          <Button
            type="button"
            onClick={onCreateClick}
            icon={<Plus className="h-4 w-4" />}
            className="w-full md:w-auto"
          >
            Buat Pembelian Barang
          </Button>
        )}
      </div>

      {list.isPending ? (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Memuat riwayat Pembelian Barang...
        </div>
      ) : list.isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          Gagal memuat riwayat Pembelian Barang.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
          Belum ada riwayat Pembelian Barang.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const statusInfo = STATUS_LABELS[row.status];
            return (
              <article
                key={row.id}
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-slate-950">
                        {row.number}
                      </p>
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusInfo.className}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Daftar Belanja {row.shoppingRequestNumber} ·{" "}
                      {row.supplierName}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Dibuat oleh {row.createdByName ?? "-"} ·{" "}
                      {formatDate(row.createdAt)}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Metric label="Produk" value={row.itemCount} />
                    <Metric
                      label="Belum Aksi"
                      value={row.pendingItemCount}
                    />
                    <Metric
                      label="Total"
                      value={formatCurrency(row.totalAmount)}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setDetailId(row.id)}
                      icon={<Eye className="h-4 w-4" />}
                    >
                      Detail
                    </Button>
                    {row.status === "PENDING" && canApprove && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setApprovalId(row.id)}
                        icon={<CheckCircle2 className="h-4 w-4" />}
                      >
                        Proses
                      </Button>
                    )}
                    {row.status === "PENDING" && canReject && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setRejectId(row.id)}
                        icon={<XCircle className="h-4 w-4" />}
                      >
                        Tolak
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!pagination.hasPreviousPage}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Sebelumnya
          </Button>
          <span className="text-sm font-bold text-slate-600">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!pagination.hasNextPage}
            onClick={() => setPage((current) => current + 1)}
          >
            Berikutnya
          </Button>
        </div>
      )}

      <GoodsPurchaseDetailModal
        purchaseId={detailId}
        onClose={() => setDetailId(null)}
      />
      <GoodsPurchaseApprovalModal
        purchaseId={approvalId}
        onClose={() => setApprovalId(null)}
        onFinalized={() => setApprovedDialogOpen(true)}
      />
      <GoodsPurchaseRejectModal
        purchaseId={rejectId}
        onClose={() => setRejectId(null)}
      />
      <GoodsPurchaseApprovedDialog
        open={approvedDialogOpen}
        onClose={() => setApprovedDialogOpen(false)}
      />
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-20 rounded-xl bg-slate-50 px-2 py-2">
      <p className="text-[10px] font-bold uppercase text-slate-400">
        {label}
      </p>
      <p className="truncate text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

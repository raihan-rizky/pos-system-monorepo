"use client";

import React, { useState } from "react";
import {
  ShoppingBag,
  Trash2,
  Printer,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Clock3,
  Boxes,
  Percent,
  PencilLine,
  ListChecks,
} from "lucide-react";
import { Button, Modal } from "@pos/ui";

import {
  useCancelShoppingRequest,
  useShoppingRequestSummary,
  useShoppingRequests,
} from "../hooks/useShoppingRequests";
import { ShoppingRequestPrintModal } from "./ShoppingRequestPrintModal";
import { ShoppingRequestApproveModal } from "./ShoppingRequestApproveModal";
import { ShoppingRequestEditModal } from "./ShoppingRequestEditModal";
import { ShoppingRequestApprovedQtyModal } from "./ShoppingRequestApprovedQtyModal";
import type {
  ShoppingRequestDetail,
  ShoppingRequestKpiSummary,
} from "../types/shopping-request";
import { useRole } from "@/components/providers/RoleProvider";

const STATUS_LABELS = {
  REQUESTED: { label: "Diajukan", className: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: {
    label: "Disetujui",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  CANCELLED: {
    label: "Dibatalkan",
    className: "bg-slate-100 text-slate-500 border-slate-200",
  },
} as const;

const NUMBER_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});
const PERCENT_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
});

export function ShoppingRequestList({
  onCreateClick,
}: {
  onCreateClick: () => void;
}) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [printTarget, setPrintTarget] = useState<ShoppingRequestDetail | null>(null);
  const [approveTarget, setApproveTarget] = useState<ShoppingRequestDetail | null>(null);
  const [editTarget, setEditTarget] = useState<ShoppingRequestDetail | null>(null);
  const [approvedQtyTarget, setApprovedQtyTarget] = useState<ShoppingRequestDetail | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ShoppingRequestDetail | null>(null);
  const { canPerform } = useRole();
  const canApproveStock = canPerform(
    "supplier.shopping_request.approve_stock",
    "update",
  );
  const canEditRequest = canPerform(
    "supplier.shopping_request.edit",
    "update",
  );
  const canSetApprovedQty = canPerform(
    "supplier.shopping_request.set_approved_qty",
    "update",
  );

  const list = useShoppingRequests({
    page,
    limit: 10,
    ...(statusFilter ? { status: statusFilter as "REQUESTED" | "APPROVED" | "CANCELLED" } : {}),
  });
  const summary = useShoppingRequestSummary();

  const rows = list.data?.data ?? [];
  const pagination = list.data?.pagination;

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <ShoppingRequestKpiGrid
        summary={summary.data}
        isPending={summary.isPending}
        isError={summary.isError}
      />

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm sm:w-auto"
        >
          <option value="">Semua status</option>
          <option value="REQUESTED">Diajukan</option>
          <option value="APPROVED">Disetujui</option>
          <option value="CANCELLED">Dibatalkan</option>
        </select>
        <Button
          type="button"
          onClick={onCreateClick}
          icon={<ShoppingBag className="h-4 w-4" />}
          className="w-full sm:ml-auto sm:w-auto"
        >
          Buat Daftar Belanja
        </Button>
      </div>

      {list.isPending ? (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-slate-400" />
          Memuat daftar belanja...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
          Belum ada daftar belanja
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const status = STATUS_LABELS[row.status];
            return (
              <article
                key={row.id}
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-all text-base font-black text-slate-950">{row.number}</p>
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                     <p className="mt-1 break-words text-xs leading-relaxed text-slate-500">
                      {row.supplierName ? `Supplier: ${row.supplierName} · ` : ""}
                      Pemohon: {row.requestedByName ?? "-"}
                      {row.approvedByName ? ` · Disetujui: ${row.approvedByName}` : ""}
                     </p>
                     {row.status === "REQUESTED" && (
                       <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                         <div className="h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-slate-100">
                           <div
                             className="h-full rounded-full bg-cyan-500 transition-all"
                             style={{
                               width: `${row.itemCount > 0 ? (row.decidedItemCount / row.itemCount) * 100 : 0}%`,
                             }}
                           />
                         </div>
                         <span className="text-[11px] font-bold text-slate-500">
                           {row.decidedItemCount} dari {row.itemCount} item diproses
                         </span>
                       </div>
                     )}
                  </div>
                  <div className="grid w-full grid-cols-3 gap-2 text-xs sm:w-auto sm:text-sm">
                    <MetricPill label="Item" value={row.itemCount} />
                    <MetricPill label="Kebutuhan" value={row.totalRequestedQty} />
                    <MetricPill
                      label="Di Acc"
                      value={row.totalApprovedQty ?? "-"}
                    />
                  </div>
                   <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
                     {row.status === "REQUESTED" &&
                       row.decidedItemCount === 0 &&
                       canEditRequest && (
                         <Button
                           type="button"
                           size="sm"
                           variant="secondary"
                           onClick={() => setEditTarget({ ...row, items: [] })}
                           icon={<PencilLine className="h-4 w-4" />}
                         >
                           Edit
                         </Button>
                       )}
                     {row.status === "REQUESTED" &&
                       row.pendingItemCount > 0 &&
                       canSetApprovedQty && (
                         <Button
                           type="button"
                           size="sm"
                           variant="secondary"
                           onClick={() =>
                             setApprovedQtyTarget({ ...row, items: [] })
                           }
                           icon={<ListChecks className="h-4 w-4" />}
                         >
                           Isi Jumlah yang Di-ACC
                         </Button>
                       )}
                     {row.status === "REQUESTED" && canApproveStock && (
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={() => setApproveTarget({ ...row, items: [] })}
                        icon={<CheckCircle2 className="h-4 w-4" />}
                      >
                        Setujui
                      </Button>
                    )}
                    {row.status !== "CANCELLED" && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setPrintTarget({ ...row, items: [] } as any);
                        }}
                        className="!py-1.5 !px-3 text-sm h-auto"
                      >
                        Lihat Struk
                      </Button>
                    )}
                     {row.status === "REQUESTED" && row.decidedItemCount === 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setCancelTarget({ ...row, items: [] })}
                        icon={<Trash2 className="h-4 w-4" />}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
                  <ChevronRight className="h-3 w-3" />
                  {new Date(row.createdAt).toLocaleString("id-ID")}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!pagination.hasPreviousPage}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span className="text-xs text-slate-500">
            Halaman {pagination.page} dari {pagination.totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!pagination.hasNextPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <ShoppingRequestPrintModal
        detail={printTarget}
        open={printTarget !== null}
        onClose={() => setPrintTarget(null)}
      />
      <ShoppingRequestApproveModal
        detail={approveTarget}
        open={approveTarget !== null}
        onClose={() => setApproveTarget(null)}
      />
      <ShoppingRequestEditModal
        detail={editTarget}
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
      />
      <ShoppingRequestApprovedQtyModal
        detail={approvedQtyTarget}
        open={approvedQtyTarget !== null}
        onClose={() => setApprovedQtyTarget(null)}
      />
      <ShoppingRequestCancelDialog
        detail={cancelTarget}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  );
}

const KPI_TONE_CLASSES = {
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
} as const;

function ShoppingRequestKpiGrid({
  summary,
  isPending,
  isError,
}: {
  summary: ShoppingRequestKpiSummary | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  if (isPending) {
    return (
      <section
        aria-label="Memuat ringkasan daftar belanja"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-[126px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
          />
        ))}
      </section>
    );
  }

  const unavailable = isError || !summary;

  return (
    <section
      aria-label="Ringkasan daftar belanja"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <ShoppingRequestKpiCard
        label="Perlu Diproses"
        value={unavailable ? "—" : NUMBER_FORMATTER.format(summary.pendingRequestCount)}
        description="Permohonan aktif menunggu keputusan"
        icon={<Clock3 className="h-5 w-5" />}
        tone="amber"
      />
      <ShoppingRequestKpiCard
        label="Qty Menunggu"
        value={unavailable ? "—" : NUMBER_FORMATTER.format(summary.pendingRequestedQty)}
        description="Akumulasi kebutuhan aktif"
        icon={<Boxes className="h-5 w-5" />}
        tone="cyan"
      />
      <ShoppingRequestKpiCard
        label="Sudah Disetujui"
        value={unavailable ? "—" : NUMBER_FORMATTER.format(summary.approvedRequestCount)}
        description="Total sepanjang riwayat"
        icon={<CheckCircle2 className="h-5 w-5" />}
        tone="emerald"
      />
      <ShoppingRequestKpiCard
        label="Rasio Qty Di-ACC"
        value={
          unavailable
            ? "—"
            : `${PERCENT_FORMATTER.format(summary.fulfillmentRate)}%`
        }
        description="Qty di-ACC dari kebutuhan yang diputuskan"
        icon={<Percent className="h-5 w-5" />}
        tone="violet"
      />
    </section>
  );
}

function ShoppingRequestKpiCard({
  label,
  value,
  description,
  icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  tone: keyof typeof KPI_TONE_CLASSES;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="mt-1 truncate text-2xl font-black text-slate-950">
            {value}
          </p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${KPI_TONE_CLASSES[tone]}`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-slate-500">{description}</p>
    </article>
  );
}

function MetricPill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
      <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="block text-sm font-bold text-slate-900">{value}</span>
    </span>
  );
}

function ShoppingRequestCancelDialog({
  detail,
  onClose,
}: {
  detail: ShoppingRequestDetail | null;
  onClose: () => void;
}) {
  const cancel = useCancelShoppingRequest();

  return (
    <Modal
      open={detail !== null}
      onClose={onClose}
      title="Batalkan daftar belanja?"
      size="md"
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Permohonan belanja <strong>{detail?.number}</strong> akan dibatalkan dan tidak bisa disetujui lagi.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button
            type="button"
            loading={cancel.isPending}
            onClick={() => {
              if (!detail) return;
              cancel.mutate(detail.id);
              onClose();
            }}
          >
            Batalkan
          </Button>
        </div>
      </div>
    </Modal>
  );
}

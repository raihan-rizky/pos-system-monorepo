"use client";

import React, { useState } from "react";
import {
  ShoppingBag,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Clock3,
  Boxes,
  Percent,
  PackageCheck, Printer, Pencil, XCircle, FileText, History, GitCompareArrows, ChevronDown, Ellipsis,
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
import { ShoppingRequestFinalApprovalModal } from "./ShoppingRequestFinalApprovalModal";
import { GoodsPurchaseCreateModal } from "@/features/suppliers/goods-purchases/components/GoodsPurchaseCreateModal";
import { GoodsPurchaseApprovalModal } from "@/features/suppliers/goods-purchases/components/GoodsPurchaseApprovalModal";
import { GoodsPurchaseDetailModal } from "@/features/suppliers/goods-purchases/components/GoodsPurchaseDetailModal";
import { GoodsPurchaseRejectModal } from "@/features/suppliers/goods-purchases/components/GoodsPurchaseRejectModal";
import type { GoodsPurchaseFulfillmentStatus } from "../../goods-purchases/types/goods-purchase";
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
  REJECTED: {
    label: "Ditolak",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
} as const;

const FULFILLMENT_STATUS_LABELS = {
  NOT_RECEIVED: {
    label: "BARANG BELUM DITERIMA",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  PARTIALLY_RECEIVED: {
    label: "BARANG DITERIMA SEBAGIAN",
    className: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  RECEIVED: {
    label: "BARANG SUDAH DITERIMA",
    className: "bg-purple-50 text-purple-700 border-purple-200",
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
  onReceive,
  onCompare,
  onViewReceiptHistory,
}: {
  onCreateClick: () => void;
  onReceive: (purchaseId: string) => void;
  onCompare: (purchaseId: string) => void;
  onViewReceiptHistory: (purchaseId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<GoodsPurchaseFulfillmentStatus | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [printTarget, setPrintTarget] = useState<ShoppingRequestDetail | null>(null);
  const [approveTarget, setApproveTarget] = useState<ShoppingRequestDetail | null>(null);
  const [editTarget, setEditTarget] = useState<ShoppingRequestDetail | null>(null);
  const [approvedQtyTarget, setApprovedQtyTarget] = useState<ShoppingRequestDetail | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ShoppingRequestDetail | null>(null);
  const [finalApprovalId, setFinalApprovalId] = useState<string | null>(null);
  const [purchaseDetailId, setPurchaseDetailId] = useState<string | null>(null);
  const [purchaseApprovalId, setPurchaseApprovalId] = useState<string | null>(null);
  const [purchaseRejectId, setPurchaseRejectId] = useState<string | null>(null);
  const [legacyCreateOpen, setLegacyCreateOpen] = useState(false);
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
  const canApprovePurchase = canPerform("supplier.goods_purchase.approve", "update");
  const canRejectPurchase = canPerform("supplier.goods_purchase.reject", "update");
  const canCreatePurchase = canPerform("supplier", "create");
  const canReceive = canPerform("inventory.inbound_receipt.create", "create");

  const list = useShoppingRequests({
    page,
    limit: 10,
    q: searchQuery.trim() || undefined,
    fulfillmentStatus: fulfillmentFilter || undefined,
    ...(statusFilter ? { status: statusFilter as "REQUESTED" | "APPROVED" | "CANCELLED" | "REJECTED" } : {}),
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

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          aria-label="Cari nama atau nomor Daftar Belanja"
          placeholder="Cari nama atau nomor Daftar Belanja"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setPage(1);
          }}
          className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm sm:min-w-56 sm:flex-1"
        />
        <select
          aria-label="Status persetujuan"
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
          <option value="REJECTED">Ditolak</option>
        </select>
        <select
          aria-label="Status penerimaan barang"
          value={fulfillmentFilter}
          onChange={(event) => {
            setFulfillmentFilter(event.target.value as GoodsPurchaseFulfillmentStatus | "");
            setPage(1);
          }}
          className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm sm:w-auto"
        >
          <option value="">Semua penerimaan</option>
          <option value="NOT_RECEIVED">Belum diterima</option>
          <option value="PARTIALLY_RECEIVED">Diterima sebagian</option>
          <option value="RECEIVED">Sudah diterima</option>
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
            const fulfillment = row.purchase?.status === "APPROVED"
              ? FULFILLMENT_STATUS_LABELS[row.purchase.fulfillmentStatus]
              : null;
            return (
              <article
                key={row.id}
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words text-base font-black text-slate-950">{row.name}</p>
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${status.className}`}
                      >
                        {status.label}
                      </span>
                      {fulfillment && (
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${fulfillment.className}`}
                        >
                          {fulfillment.label}
                        </span>
                      )}
                    </div>
                     <p className="mt-1 break-words text-xs leading-relaxed text-slate-500">
                      {row.supplierName ?? "Supplier belum dipilih"} · {row.number} · {new Date(row.createdAt).toLocaleDateString("id-ID")}
                     </p>
                     {row.purchase && <p className="mt-1 text-xs font-semibold text-cyan-700">Pembelian {row.purchase.number} · {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(row.purchase.totalAmount)}</p>}
                     {row.rejectionReason && <p className="mt-1 text-xs text-rose-700">Alasan: {row.rejectionReason}</p>}
                     {row.status === "REQUESTED" && row.approvalFlowVersion !== 2 && (
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
                  <div className="flex flex-col gap-2 sm:min-w-44">
                    {row.status === "REQUESTED" && row.approvalFlowVersion === 2 && (canApprovePurchase || canRejectPurchase) && (
                      <Button type="button" size="sm" onClick={() => setFinalApprovalId(row.id)}>{canApprovePurchase ? "Tinjau & Setujui" : "Tinjau Daftar"}</Button>
                    )}
                    {row.status === "REQUESTED" && row.approvalFlowVersion !== 2 && canApproveStock && (
                      <Button type="button" size="sm" onClick={() => setApproveTarget({ ...row, items: [] })}>Proses Daftar Lama</Button>
                    )}
                    {row.purchase?.status === "PENDING" && canApprovePurchase && (
                      <Button type="button" size="sm" onClick={() => setPurchaseApprovalId(row.purchase!.id)}>Proses Pembelian Lama</Button>
                    )}
                    {row.status === "APPROVED" && (!row.purchase || row.purchase.status === "REJECTED") && row.approvalFlowVersion !== 2 && canCreatePurchase && (
                      <Button type="button" size="sm" onClick={() => setLegacyCreateOpen(true)}>Lengkapi Pembelian Lama</Button>
                    )}
                    {row.purchase?.status === "APPROVED" && row.purchase.fulfillmentStatus !== "RECEIVED" && canReceive && (
                      <Button type="button" size="sm" icon={<PackageCheck aria-hidden="true" className="h-4 w-4" />} className="min-h-11 !bg-emerald-700 hover:!bg-emerald-800 focus-visible:ring-emerald-500" onClick={() => onReceive(row.purchase!.id)}>Catat Penerimaan</Button>
                    )}
                    <details className="group rounded-xl border border-slate-200 bg-slate-50/60 text-sm open:border-cyan-200 open:bg-white">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 font-semibold text-slate-700 transition-colors hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 [&::-webkit-details-marker]:hidden"><Ellipsis aria-hidden="true" className="h-4 w-4 text-cyan-700" />Tindakan lainnya<ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" /></summary>
                      <div className="flex flex-col gap-1 border-t border-slate-100 p-2">
                        <button type="button" onClick={() => setPrintTarget({ ...row, items: [] })} className="flex min-h-11 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 bg-sky-50 text-sky-800 hover:border-sky-200 hover:bg-sky-100"><Printer aria-hidden="true" className="h-4 w-4 shrink-0" />Lihat / cetak daftar</button>
                        {row.status === "REQUESTED" && row.decidedItemCount === 0 && canEditRequest && <button type="button" onClick={() => setEditTarget({ ...row, items: [] })} className="flex min-h-11 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 bg-amber-50 text-amber-800 hover:border-amber-200 hover:bg-amber-100"><Pencil aria-hidden="true" className="h-4 w-4 shrink-0" />Edit daftar</button>}
                        {row.status === "REQUESTED" && row.approvalFlowVersion !== 2 && row.pendingItemCount > 0 && canSetApprovedQty && <button type="button" onClick={() => setApprovedQtyTarget({ ...row, items: [] })} className="flex min-h-11 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 bg-emerald-50 text-emerald-800 hover:border-emerald-200 hover:bg-emerald-100"><CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />Isi Jumlah yang Di-ACC</button>}
                        {row.status === "REQUESTED" && row.decidedItemCount === 0 && <button type="button" onClick={() => setCancelTarget({ ...row, items: [] })} className="flex min-h-11 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 bg-rose-50 text-rose-800 hover:border-rose-200 hover:bg-rose-100"><XCircle aria-hidden="true" className="h-4 w-4 shrink-0" />Batalkan daftar</button>}
                        {row.purchaseHistory?.map((purchase) => <button key={purchase.id} type="button" onClick={() => setPurchaseDetailId(purchase.id)} className="flex min-h-11 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-slate-100"><FileText aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">Detail {purchase.number} · {purchase.status === "REJECTED" ? "Ditolak" : purchase.status === "PENDING" ? "Menunggu" : "Disetujui"}</span></button>)}
                        {row.purchase?.status === "PENDING" && canRejectPurchase && <button type="button" onClick={() => setPurchaseRejectId(row.purchase!.id)} className="flex min-h-11 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 bg-rose-50 text-rose-800 hover:border-rose-200 hover:bg-rose-100"><XCircle aria-hidden="true" className="h-4 w-4 shrink-0" />Tolak pembelian lama</button>}
                        {row.purchase?.status === "APPROVED" && <button type="button" onClick={() => onViewReceiptHistory(row.purchase!.id)} className="flex min-h-11 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 bg-violet-50 text-violet-800 hover:border-violet-200 hover:bg-violet-100"><History aria-hidden="true" className="h-4 w-4 shrink-0" />Riwayat penerimaan</button>}
                        {row.purchase && row.purchase.fulfillmentStatus !== "NOT_RECEIVED" && <button type="button" onClick={() => onCompare(row.purchase!.id)} className="flex min-h-11 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 bg-cyan-50 text-cyan-800 hover:border-cyan-200 hover:bg-cyan-100"><GitCompareArrows aria-hidden="true" className="h-4 w-4 shrink-0" />Bandingkan penerimaan</button>}
                      </div>
                    </details>
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
      <ShoppingRequestFinalApprovalModal requestId={finalApprovalId} onClose={() => setFinalApprovalId(null)} />
      <GoodsPurchaseCreateModal open={legacyCreateOpen} onClose={() => setLegacyCreateOpen(false)} />
      <GoodsPurchaseApprovalModal purchaseId={purchaseApprovalId} onClose={() => setPurchaseApprovalId(null)} onFinalized={() => setPurchaseApprovalId(null)} />
      <GoodsPurchaseDetailModal purchaseId={purchaseDetailId} onClose={() => setPurchaseDetailId(null)} />
      <GoodsPurchaseRejectModal purchaseId={purchaseRejectId} onClose={() => setPurchaseRejectId(null)} />
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

"use client";

import React from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Clock,
  Loader2,
  PackageOpen,
  PackagePlus,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import {
  fetchInboundReceipts,
  type InboundReceiptListItem,
} from "../api/inventory-management-api";
import type { InboundReceiptStatus } from "../types/inventory-management";
import { InboundReceiptReviewModal } from "./InboundReceiptReviewModal";
import { InboundReceiptProductThumbnail } from "./InboundReceiptProductThumbnail";
import "./inbound-receipt-tab.css";

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
  supplierId?: string | null;
  onCreateReceipt?: () => void;
  refreshTrigger?: number;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  NEEDS_REVISION: "Perlu Revisi (Legacy)",
};

const STATUS_STYLES: Record<string, string> = {
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  SUBMITTED: "border-amber-200 bg-amber-50 text-amber-800",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-800",
  CANCELLED: "border-slate-200 bg-slate-100 text-slate-600",
  NEEDS_REVISION: "border-amber-200 bg-amber-50 text-amber-800",
};

const receiptDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
const quantityFormat = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 4,
});

export const InboundReceiptTab: React.FC<InboundReceiptTabProps> = ({
  goodsPurchaseId,
  supplierId,
  onCreateReceipt,
  refreshTrigger = 0,
}) => {
  const { canPerform } = useRole();
  const [receipts, setReceipts] = React.useState<InboundReceiptListItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const loadSequence = React.useRef(0);
  const [reviewingReceipt, setReviewingReceipt] =
    React.useState<InboundReceiptListItem | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<
    InboundReceiptStatus | "ALL"
  >("ALL");

  const canApprove = canPerform("inventory.inbound_receipt.approve", "update");
  const canReject = canPerform("inventory.inbound_receipt.reject", "update");
  const canEdit = canPerform("inventory.inbound_receipt.edit", "update");
  const canCreateReceipt = canPerform(
    "inventory.inbound_receipt.create",
    "create",
  );

  const loadReceipts = React.useCallback(async () => {
    const sequence = ++loadSequence.current;
    setIsLoading(true);
    setError(null);
    try {
      const nextReceipts = await fetchInboundReceipts({
        ...(statusFilter === "ALL" ? {} : { status: statusFilter }),
        ...(goodsPurchaseId ? { goodsPurchaseId } : {}),
        ...(supplierId ? { supplierId } : {}),
      });
      if (sequence === loadSequence.current) setReceipts(nextReceipts);
    } catch {
      if (sequence === loadSequence.current) {
        setError("Daftar penerimaan belum bisa dimuat. Silakan coba lagi.");
      }
    } finally {
      if (sequence === loadSequence.current) setIsLoading(false);
    }
  }, [goodsPurchaseId, statusFilter, supplierId]);

  React.useEffect(() => {
    void loadReceipts();
    return () => {
      loadSequence.current += 1;
    };
  }, [loadReceipts, refreshTrigger]);

  const handleSuccess = (nextMessage: string) => {
    setMessage(nextMessage);
    void loadReceipts();
  };

  const query = search.trim().toLocaleLowerCase("id-ID");
  const visibleReceipts = receipts.filter(
    (receipt) =>
      !query ||
      [
        receipt.supplier?.name,
        receipt.goodsPurchaseNumber,
        ...receipt.lines.flatMap((line) => [
          line.productNameSnapshot,
          line.skuSnapshot,
        ]),
      ].some((value) => value?.toLocaleLowerCase("id-ID").includes(query)),
  );

  return (
    <div className="space-y-4">
      <section
        className="inbound-receipt-panel overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        aria-label="Riwayat penerimaan barang"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="hidden rounded-xl bg-indigo-50 p-3 text-indigo-600 sm:block">
              <PackageOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                Riwayat Penerimaan Barang
              </h2>
              <p className="mt-1 max-w-lg text-sm leading-relaxed text-slate-600">
                Pantau barang dari supplier dan periksa penerimaan per produk.
              </p>
            </div>
          </div>
          {canCreateReceipt && onCreateReceipt && (
            <button
              type="button"
              onClick={onCreateReceipt}
              className="inbound-receipt-create inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
              Catat Penerimaan
            </button>
          )}
        </div>

        <div className="inbound-receipt-toolbar flex flex-wrap items-center justify-between gap-4 border-y border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
          <div
            className="inbound-receipt-filters flex flex-wrap gap-1"
            role="group"
            aria-label="Filter status penerimaan"
          >
            {[
              ["ALL", "Semua"],
              ["SUBMITTED", "Diajukan"],
              ["APPROVED", "Disetujui"],
              ["REJECTED", "Ditolak"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={statusFilter === value}
                onClick={() => {
                  setStatusFilter(value as InboundReceiptStatus | "ALL");
                  setExpandedId(null);
                }}
                className={`min-h-10 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                  statusFilter === value
                    ? "border-indigo-200 bg-white text-indigo-700 shadow-sm"
                    : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="inbound-receipt-search relative w-full sm:w-80">
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Cari penerimaan barang"
              placeholder="Cari supplier, produk, atau nomor PB..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {search && (
              <button
                type="button"
                aria-label="Hapus pencarian"
                onClick={() => setSearch("")}
                className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {message && (
          <div
            role="status"
            className="m-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          >
            {message}
          </div>
        )}

        {isLoading ? (
          <div
            role="status"
            className="flex min-h-48 items-center justify-center gap-3 p-6 text-sm text-slate-600"
          >
            <Loader2
              className="h-5 w-5 animate-spin text-indigo-600"
              aria-hidden="true"
            />
            Memuat penerimaan...
          </div>
        ) : error ? (
          <div
            role="alert"
            className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadReceipts()}
              className="mt-3 min-h-10 rounded-lg border border-rose-300 bg-white px-4 font-semibold hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-700"
            >
              Coba lagi
            </button>
          </div>
        ) : visibleReceipts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="rounded-2xl bg-slate-100 p-4">
              <PackageOpen
                className="h-7 w-7 text-slate-500"
                aria-hidden="true"
              />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              {query
                ? "Penerimaan tidak ditemukan"
                : statusFilter !== "ALL"
                  ? "Belum ada penerimaan dengan status ini"
                  : goodsPurchaseId
                    ? "Belum ada riwayat penerimaan untuk Pembelian Barang ini"
                    : "Belum ada Penerimaan Barang"}
            </h3>
            <p className="max-w-sm text-sm leading-relaxed text-slate-600">
              {query
                ? "Coba kata kunci lain atau hapus pencarian untuk melihat daftar kembali."
                : statusFilter !== "ALL"
                  ? "Pilih Semua untuk melihat penerimaan dengan status lainnya."
                  : "Barang yang dicatat akan muncul di sini. Persetujuan dilakukan per produk sebelum stok bertambah."}
            </p>
            {statusFilter !== "ALL" && (
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                Lihat semua status
              </button>
            )}
          </div>
        ) : (
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <p className="py-4 text-sm text-slate-500" aria-live="polite">
              {visibleReceipts.length} penerimaan
              {query ? " ditemukan" : " ditampilkan"}
            </p>
            <table
              role="table"
              aria-label="Daftar penerimaan barang"
              className="inbound-receipt-table w-full text-left text-sm text-slate-600"
            >
              <thead
                role="rowgroup"
                className="bg-slate-50 text-xs font-semibold text-slate-600"
              >
                <tr role="row">
                  <th scope="col" className="px-4 py-3">
                    Supplier / No. pembelian
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Tanggal
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Produk
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Tindakan
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {visibleReceipts.map((receipt) => {
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
                  const expanded = expandedId === receipt.id;
                  const reference =
                    receipt.goodsPurchaseNumber ??
                    receipt.supplier?.name ??
                    "penerimaan";
                  const approvedCount = receipt.lines.filter(
                    (line) => line.reviewStatus === "APPROVED",
                  ).length;
                  return (
                    <React.Fragment key={receipt.id}>
                      <tr
                        role="row"
                        className={`inbound-receipt-row border-b border-slate-100 transition-colors ${expanded ? "bg-indigo-50/40" : "hover:bg-slate-50/70"}`}
                      >
                        <td
                          role="cell"
                          className="inbound-receipt-supplier px-4 py-4"
                        >
                          <p className="break-words font-semibold text-slate-900">
                            {receipt.supplier?.name ?? "Tanpa Supplier"}
                          </p>
                          <p className="mt-1 break-words text-xs text-slate-500">
                            {receipt.goodsPurchaseNumber ??
                              "Tanpa nomor pembelian"}
                          </p>
                        </td>
                        <td role="cell" className="px-4 py-4 text-slate-700">
                          <span className="inbound-receipt-mobile-label">
                            Tanggal
                          </span>
                          <time dateTime={receipt.createdAt}>
                            {receiptDate.format(new Date(receipt.createdAt))}
                          </time>
                        </td>
                        <td role="cell" className="px-4 py-4">
                          <span className="inbound-receipt-mobile-label">
                            Produk
                          </span>
                          <p className="font-medium text-slate-800">
                            {receipt.lines.length} produk
                          </p>
                          {receipt.status === "SUBMITTED" && (
                            <p className="mt-1 text-xs text-slate-500">
                              {approvedCount}/{receipt.lines.length} disetujui
                            </p>
                          )}
                        </td>
                        <td role="cell" className="px-4 py-4">
                          <span className="inbound-receipt-mobile-label">
                            Status
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[receipt.status] ?? "border-slate-200 bg-slate-50 text-slate-700"}`}
                          >
                            <StatusIcon
                              className="h-3.5 w-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            {STATUS_LABELS[receipt.status] ?? receipt.status}
                          </span>
                        </td>
                        <td
                          role="cell"
                          className="inbound-receipt-actions px-4 py-4"
                        >
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              aria-label={`${expanded ? "Tutup" : "Lihat"} detail ${reference}`}
                              aria-expanded={expanded}
                              aria-controls={
                                expanded
                                  ? `receipt-detail-${receipt.id}`
                                  : undefined
                              }
                              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                              onClick={() =>
                                setExpandedId(
                                  expandedId === receipt.id ? null : receipt.id,
                                )
                              }
                            >
                              {expanded ? "Tutup Detail" : "Lihat Detail"}
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                                aria-hidden="true"
                              />
                            </button>
                            {actions.map((action) => (
                              <button
                                key={action.key}
                                type="button"
                                onClick={() => setReviewingReceipt(receipt)}
                                className={`min-h-10 rounded-lg px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                                  action.key === "reject"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                                }`}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr role="row" className="inbound-receipt-detail-row">
                          <td
                            role="cell"
                            colSpan={5}
                            className="bg-slate-50 p-4"
                          >
                            <div
                              id={`receipt-detail-${receipt.id}`}
                              role="region"
                              aria-label={`Detail ${reference}`}
                            >
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-slate-900">
                                  Rincian barang
                                </h3>
                                <span className="text-xs text-slate-500">
                                  {receipt.lines.length} produk ·{" "}
                                  {approvedCount} disetujui
                                </span>
                              </div>
                              {receipt.rejectionReason && (
                                <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                                  <strong>Alasan penolakan: </strong>
                                  {receipt.rejectionReason}
                                </p>
                              )}
                              {receipt.note && (
                                <p className="mb-3 break-words text-sm text-slate-600">
                                  <strong>Catatan penerimaan: </strong>
                                  {receipt.note}
                                </p>
                              )}
                              <div className="space-y-3">
                                {receipt.lines.map((line) => (
                                  <div
                                    key={line.id}
                                    className="rounded-xl border border-slate-200 bg-white p-4"
                                  >
                                    <dl className="inbound-receipt-line grid gap-4">
                                      <div className="inbound-receipt-product min-w-0">
                                        <dt className="text-xs text-slate-500">
                                          Produk
                                        </dt>
                                        <dd className="mt-2 flex items-start gap-3">
                                          <InboundReceiptProductThumbnail
                                            imageUrl={line.imageUrl}
                                            productName={
                                              line.productNameSnapshot ??
                                              "Produk"
                                            }
                                          />
                                          <div className="min-w-0">
                                            <p className="break-words font-semibold text-slate-900">
                                              {line.productNameSnapshot ??
                                                "Produk"}
                                            </p>
                                            {line.skuSnapshot && (
                                              <p className="mt-1 break-words text-xs text-slate-500">
                                                SKU: {line.skuSnapshot}
                                              </p>
                                            )}
                                          </div>
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-xs text-slate-500">
                                          Dipesan
                                        </dt>
                                        <dd className="mt-1 break-words font-medium tabular-nums text-slate-700">
                                          {quantityFormat.format(
                                            line.expectedQuantity,
                                          )}{" "}
                                          {line.unitSnapshot}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-xs text-slate-500">
                                          Diterima
                                        </dt>
                                        <dd className="mt-1 break-words font-semibold tabular-nums text-slate-900">
                                          {quantityFormat.format(
                                            line.receivedQuantity,
                                          )}{" "}
                                          {line.unitSnapshot}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-xs text-slate-500">
                                          Kondisi
                                        </dt>
                                        <dd
                                          className={`mt-1 text-xs font-medium ${line.matchStatus === "MATCHED" ? "text-emerald-800" : line.matchStatus ? "text-amber-800" : "text-slate-600"}`}
                                        >
                                          {line.matchStatus === "MATCHED"
                                            ? "Sesuai"
                                            : line.matchStatus
                                              ? "Tidak Sesuai"
                                              : "Belum diperiksa"}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-xs text-slate-500">
                                          Persetujuan
                                        </dt>
                                        <dd
                                          className={`mt-1 text-xs font-medium ${line.reviewStatus === "APPROVED" ? "text-emerald-800" : "text-slate-600"}`}
                                        >
                                          {line.reviewStatus === "APPROVED"
                                            ? "Disetujui"
                                            : "Belum disetujui"}
                                        </dd>
                                      </div>
                                    </dl>
                                    {line.note && (
                                      <p className="mt-3 break-words border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-600">
                                        <span className="font-medium">
                                          Catatan:{" "}
                                        </span>
                                        {line.note}
                                      </p>
                                    )}
                                  </div>
                                ))}
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

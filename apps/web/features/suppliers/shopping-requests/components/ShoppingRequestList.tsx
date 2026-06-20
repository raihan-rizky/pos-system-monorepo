"use client";

import React, { useState } from "react";
import {
  ShoppingBag,
  Trash2,
  Printer,
  CheckCircle2,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Button, Modal } from "@pos/ui";

import {
  useCancelShoppingRequest,
  useShoppingRequests,
} from "../hooks/useShoppingRequests";
import { ShoppingRequestPrintModal } from "./ShoppingRequestPrintModal";
import { ShoppingRequestApproveModal } from "./ShoppingRequestApproveModal";
import type { ShoppingRequestDetail } from "../types/shopping-request";

const STATUS_LABELS = {
  DRAFT: { label: "Draft", className: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: {
    label: "Disetujui",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  CANCELLED: {
    label: "Dibatalkan",
    className: "bg-slate-100 text-slate-500 border-slate-200",
  },
} as const;

export function ShoppingRequestList({
  onCreateClick,
}: {
  onCreateClick: () => void;
}) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [printTarget, setPrintTarget] = useState<ShoppingRequestDetail | null>(null);
  const [approveTarget, setApproveTarget] = useState<ShoppingRequestDetail | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ShoppingRequestDetail | null>(null);

  const list = useShoppingRequests({
    page,
    limit: 10,
    ...(statusFilter ? { status: statusFilter as "DRAFT" | "APPROVED" | "CANCELLED" } : {}),
  });

  const rows = list.data?.data ?? [];
  const pagination = list.data?.pagination;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm"
        >
          <option value="">Semua status</option>
          <option value="DRAFT">Draft</option>
          <option value="APPROVED">Disetujui</option>
          <option value="CANCELLED">Dibatalkan</option>
        </select>
        <Button
          type="button"
          onClick={onCreateClick}
          icon={<ShoppingBag className="h-4 w-4" />}
          className="sm:ml-auto"
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
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-black text-slate-950">{row.number}</p>
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.supplierName ? `Supplier: ${row.supplierName} · ` : ""}
                      Pemohon: {row.requestedByName ?? "-"}
                      {row.approvedByName ? ` · Disetujui: ${row.approvedByName}` : ""}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
                    <MetricPill label="Item" value={row.itemCount} />
                    <MetricPill label="Kebutuhan" value={row.totalRequestedQty} />
                    <MetricPill
                      label="Di Acc"
                      value={row.totalApprovedQty ?? "-"}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {row.status === "DRAFT" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={() => setApproveTarget({ ...row, items: [] })}
                        icon={<CheckCircle2 className="h-4 w-4" />}
                      >
                        Approve
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
                    {row.status === "DRAFT" && (
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
      <ShoppingRequestCancelDialog
        detail={cancelTarget}
        onClose={() => setCancelTarget(null)}
      />
    </div>
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
          Daftar belanja <strong>{detail?.number}</strong> akan dibatalkan dan tidak bisa diapprove lagi.
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

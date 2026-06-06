"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal } from "@pos/ui";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  Edit3,
  PackagePlus,
  Power,
  RefreshCcw,
} from "lucide-react";

import { useSupplierDetail } from "@/features/suppliers/hooks/useSuppliers";
import type {
  SupplierStockInRecapBundle,
  SupplierStockInRecapBundleItem,
} from "@/features/suppliers/api/suppliers-api";
import type { SupplierListItem } from "@/features/suppliers/types/supplier";

interface SupplierDetailPopupProps {
  open: boolean;
  supplier: SupplierListItem | null;
  statusActionPending: boolean;
  onClose: () => void;
  onEdit: (supplier: SupplierListItem) => void;
  onRequestStatusChange: (supplier: SupplierListItem) => void;
}

export function SupplierDetailPopup({
  open,
  supplier,
  statusActionPending,
  onClose,
  onEdit,
  onRequestStatusChange,
}: SupplierDetailPopupProps) {
  const [expandedBundleIds, setExpandedBundleIds] = useState<Set<string>>(
    () => new Set(),
  );
  const detail = useSupplierDetail({
    supplierId: supplier?.id ?? null,
    open,
    limit: 10,
  });

  const detailSupplier = detail.data?.pages[0]?.data.supplier ?? supplier;
  const historyItems = useMemo(
    () =>
      detail.data?.pages.flatMap((page) => page.data.history.items) ?? [],
    [detail.data],
  );
  const hasNextPage =
    detail.data?.pages.at(-1)?.data.history.pageInfo.hasNextPage ?? false;

  useEffect(() => {
    setExpandedBundleIds(new Set());
  }, [supplier?.id]);

  const toggleBundle = useCallback((bundleId: string) => {
    setExpandedBundleIds((current) => {
      const next = new Set(current);
      if (next.has(bundleId)) {
        next.delete(bundleId);
      } else {
        next.add(bundleId);
      }
      return next;
    });
  }, []);

  const handleEdit = useCallback(() => {
    if (detailSupplier) onEdit(detailSupplier);
  }, [detailSupplier, onEdit]);

  const handleStatusChange = useCallback(() => {
    if (detailSupplier) onRequestStatusChange(detailSupplier);
  }, [detailSupplier, onRequestStatusChange]);

  const handleLoadMore = useCallback(() => {
    detail.fetchNextPage();
  }, [detail]);

  const handleRetry = useCallback(() => {
    detail.refetch();
  }, [detail]);

  return (
    <Modal
      open={open && supplier !== null}
      onClose={onClose}
      title="Detail Supplier"
      size="4xl"
      className="max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[88dvh] max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none"
    >
      <div className="space-y-4">
        <div className="sticky -top-4 z-10 border-b border-slate-100 bg-white pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-black text-slate-950">
                    {detailSupplier?.name ?? "Supplier"}
                  </h3>
                  <StatusPill active={detailSupplier?.isActive ?? true} />
                </div>
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                  {detailSupplier?.type ?? "-"}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {detailSupplier?.contactPerson ||
                    detailSupplier?.phone ||
                    "Kontak belum diisi"}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                icon={<Edit3 className="h-4 w-4" />}
                onClick={handleEdit}
                disabled={!detailSupplier}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant={detailSupplier?.isActive ? "danger" : "primary"}
                loading={statusActionPending}
                icon={<Power className="h-4 w-4" />}
                onClick={handleStatusChange}
                disabled={!detailSupplier}
              >
                {detailSupplier?.isActive ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            </div>
          </div>
        </div>

        <section className="space-y-3">
          <div>
            <h4 className="text-sm font-black uppercase tracking-wider text-slate-500">
              Histori Stock In
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              10 bundle/log terbaru dari restock supplier yang sudah disetujui.
            </p>
          </div>

          {detail.isPending ? (
            <HistoryLoadingState />
          ) : detail.isError ? (
            <HistoryErrorState onRetry={handleRetry} />
          ) : historyItems.length === 0 ? (
            <HistoryEmptyState />
          ) : (
            <div className="space-y-3">
              {historyItems.map((bundle) => (
                <HistoryBundleRow
                  key={bundle.id}
                  bundle={bundle}
                  expanded={expandedBundleIds.has(bundle.id)}
                  onToggle={toggleBundle}
                />
              ))}
            </div>
          )}

          {!detail.isPending && !detail.isError && hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="secondary"
                loading={detail.isFetchingNextPage}
                onClick={handleLoadMore}
              >
                Load more
              </Button>
            </div>
          )}
        </section>

        <section className="border-t border-slate-100 pt-4">
          <h4 className="text-sm font-black uppercase tracking-wider text-slate-500">
            Profil Supplier
          </h4>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <Metric label="Kontak" value={detailSupplier?.contactPerson || "-"} />
            <Metric label="Phone" value={detailSupplier?.phone || "-"} />
            <Metric label="Alamat" value={detailSupplier?.address || "-"} />
            <Metric label="Catatan" value={detailSupplier?.notes || "-"} />
          </div>
        </section>
      </div>
    </Modal>
  );
}

interface HistoryBundleRowProps {
  bundle: SupplierStockInRecapBundle;
  expanded: boolean;
  onToggle: (bundleId: string) => void;
}

function HistoryBundleRow({
  bundle,
  expanded,
  onToggle,
}: HistoryBundleRowProps) {
  const detailId = `supplier-detail-history-${bundle.id}`;
  const canExpand = bundle.items.length > 1;
  const handleToggle = useCallback(() => {
    if (canExpand) onToggle(bundle.id);
  }, [bundle.id, canExpand, onToggle]);

  return (
    <article className="overflow-hidden border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={canExpand ? expanded : undefined}
        aria-controls={canExpand ? detailId : undefined}
        onClick={handleToggle}
        className="grid min-h-11 w-full cursor-pointer gap-3 p-3 text-left transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 md:grid-cols-[1.15fr_0.95fr_1fr_auto] md:items-center"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
              <PackagePlus className="h-4 w-4" />
            </span>
            <p className="truncate text-sm font-black text-slate-950">
              {bundle.kind === "BULK_BATCH" ? "Bundle Stock In" : "Stock In Manual"}
            </p>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
              {bundle.summary.itemCount} item
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {formatDateTime(bundle.createdAt)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
          <MetricPill
            label="Qty"
            value={formatNumber(bundle.summary.approvedQuantity)}
          />
          <MetricPill
            label="Total"
            value={formatCurrency(bundle.summary.approvedTotalCost)}
          />
        </div>

        <div className="min-w-0 text-xs font-semibold text-slate-500 sm:text-sm">
          <p className="truncate">
            {bundle.requesterName || "-"} / {bundle.approverName || "-"}
          </p>
          <p className="mt-1 truncate">{bundle.note || "Tanpa catatan"}</p>
        </div>

        <div className="flex items-center justify-between gap-2 md:justify-end">
          {bundle.summary.hasPartialCost && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {bundle.summary.missingCostCount} biaya kosong
            </span>
          )}
          {canExpand ? (
            expanded ? (
              <ChevronDown className="h-5 w-5 text-slate-500" />
            ) : (
              <ChevronRight className="h-5 w-5 text-slate-500" />
            )
          ) : null}
        </div>
      </button>

      {canExpand && expanded && (
        <div id={detailId} className="border-t border-slate-100 bg-slate-50 p-3">
          <div className="grid gap-2">
            {bundle.items.map((item) => (
              <HistoryItemRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function HistoryItemRow({ item }: { item: SupplierStockInRecapBundleItem }) {
  return (
    <div className="grid gap-2 border border-slate-200 bg-white p-3 text-sm md:grid-cols-[1fr_auto_auto] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-bold text-slate-950">
          {item.product?.name || "Produk tidak tersedia"}
        </p>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">
          {item.product?.sku || "-"} / {item.product?.category?.name ?? "-"}
        </p>
      </div>
      <p className="font-semibold text-slate-700">
        {formatNumber(item.quantity)} {item.product?.unit || ""}
      </p>
      <p className="font-bold text-slate-900">
        {formatOptionalCurrency(item.lineTotalCost)}
      </p>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {active ? "Aktif" : "Nonaktif"}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 break-words font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <span className="border border-slate-200 bg-white px-2 py-1">
      <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="font-bold text-slate-900">{value}</span>
    </span>
  );
}

function HistoryLoadingState() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="min-h-24 animate-pulse border border-slate-200 bg-slate-50"
        />
      ))}
    </div>
  );
}

function HistoryErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-700">
        Gagal memuat histori supplier.
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-3"
        icon={<RefreshCcw className="h-4 w-4" />}
        onClick={onRetry}
      >
        Coba lagi
      </Button>
    </div>
  );
}

function HistoryEmptyState() {
  return (
    <div className="border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
      Belum ada histori stock-in untuk supplier ini.
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatOptionalCurrency(value: number | null) {
  return value === null ? "-" : formatCurrency(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(value);
}

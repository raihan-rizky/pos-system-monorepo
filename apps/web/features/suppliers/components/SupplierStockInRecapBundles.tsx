"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  PackagePlus,
  RefreshCcw,
  XCircle,
} from "lucide-react";

import type {
  SupplierStockInRecapBundle,
  SupplierStockInRecapBundleItem,
} from "@/features/suppliers/api/suppliers-api";

interface SupplierStockInRecapBundlesProps {
  bundles: SupplierStockInRecapBundle[];
  isPending: boolean;
  isError: boolean;
}

export function SupplierStockInRecapBundles({
  bundles,
  isPending,
  isError,
}: SupplierStockInRecapBundlesProps) {
  const [expandedBundleIds, setExpandedBundleIds] = useState<Set<string>>(
    () => new Set(),
  );

  const expandedIds = useMemo(
    () => expandedBundleIds,
    [expandedBundleIds],
  );

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

  if (isPending) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500">
        <RefreshCcw className="mr-2 h-5 w-5 animate-spin text-slate-400" />
        Memuat rekap stock in...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
        Gagal memuat rekap stock in.
      </div>
    );
  }

  if (bundles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
        Belum ada rekap stock in supplier
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-3">
      {bundles.map((bundle) => {
        const isExpanded = expandedIds.has(bundle.id);
        const detailId = `supplier-stock-in-bundle-${bundle.id}`;

        return (
          <article
            key={bundle.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-controls={detailId}
              onClick={() => toggleBundle(bundle.id)}
              className="grid min-h-11 w-full cursor-pointer gap-3 p-4 text-left transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 md:grid-cols-[1.25fr_1fr_1fr_auto] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
                    <PackagePlus className="h-4 w-4" />
                  </span>
                  <p className="truncate text-sm font-black text-slate-950 sm:text-base">
                    {bundle.supplier?.name ?? "Supplier tidak diketahui"}
                  </p>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    {bundle.kind === "BULK_BATCH" ? "Bundle" : "Manual"}
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {formatDateTime(bundle.createdAt)}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
                <MetricPill label="Item" value={bundle.summary.itemCount} />
                <MetricPill label="OK" value={bundle.summary.approvedItemCount} />
                <MetricPill label="Ditolak" value={bundle.summary.rejectedItemCount} />
              </div>

              <div className="grid gap-1 text-xs text-slate-500 sm:text-sm">
                <span>
                  Qty:{" "}
                  <strong className="text-slate-900">
                    {formatNumber(bundle.summary.approvedQuantity)}
                  </strong>
                </span>
                <span>
                  Total:{" "}
                  <strong className="text-slate-900">
                    {formatCurrency(bundle.summary.approvedTotalCost)}
                  </strong>
                </span>
                <span className="truncate">
                  {bundle.requesterName || "-"} / {bundle.approverName || "-"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 md:justify-end">
                {bundle.summary.hasPartialCost && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
                    <AlertTriangle className="h-3 w-3" />
                    {bundle.summary.missingCostCount} biaya kosong
                  </span>
                )}
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-slate-500" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-slate-500" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div
                id={detailId}
                className="border-t border-slate-100 bg-slate-50/60 p-3"
              >
                {bundle.note && (
                  <p className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
                    {bundle.note}
                  </p>
                )}
                <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
                  <div className="grid grid-cols-[1.4fr_0.9fr_0.75fr_0.85fr_0.85fr_1fr] border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    <span>Produk</span>
                    <span>Kategori</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Harga</span>
                    <span className="text-right">Total</span>
                    <span>Audit</span>
                  </div>
                  {bundle.items.map((item) => (
                    <DesktopLineItem key={item.id} item={item} />
                  ))}
                </div>
                <div className="grid gap-2 md:hidden">
                  {bundle.items.map((item) => (
                    <MobileLineItem key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function DesktopLineItem({ item }: { item: SupplierStockInRecapBundleItem }) {
  return (
    <div className="grid grid-cols-[1.4fr_0.9fr_0.75fr_0.85fr_0.85fr_1fr] gap-2 border-b border-slate-100 px-3 py-3 text-sm last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-bold text-slate-950">{item.product.name}</p>
          <StatusBadge status={item.status} />
        </div>
        <p className="truncate text-xs text-slate-500">{item.product.sku}</p>
        {item.note && (
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">
            {item.note}
          </p>
        )}
      </div>
      <span className="text-slate-600">{item.product.category?.name ?? "-"}</span>
      <span className="text-right font-semibold text-slate-700">
        {formatNumber(item.quantity)} {item.product.unit}
      </span>
      <span className="text-right text-slate-600">
        {formatOptionalCurrency(item.unitCost)}
      </span>
      <span className="text-right font-bold text-slate-900">
        {formatOptionalCurrency(item.lineTotalCost)}
      </span>
      <AuditText item={item} />
    </div>
  );
}

function MobileLineItem({ item }: { item: SupplierStockInRecapBundleItem }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-black text-slate-950">{item.product.name}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {item.product.sku} / {item.product.category?.name ?? "-"}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MetricPill
          label="Qty"
          value={`${formatNumber(item.quantity)} ${item.product.unit}`}
        />
        <MetricPill label="Harga" value={formatOptionalCurrency(item.unitCost)} />
        <MetricPill label="Total" value={formatOptionalCurrency(item.lineTotalCost)} />
      </div>
      {item.note && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          {item.note}
        </p>
      )}
      <div className="mt-3">
        <AuditText item={item} />
      </div>
    </div>
  );
}

function AuditText({ item }: { item: SupplierStockInRecapBundleItem }) {
  return (
    <div className="text-xs font-semibold text-slate-500">
      <p className="truncate">
        {item.requesterName || "-"} / {item.approverName || "-"}
      </p>
      {item.status === "REJECTED" && item.rejectionReason && (
        <p className="mt-1 flex items-start gap-1 text-red-700">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{item.rejectionReason}</span>
        </p>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: SupplierStockInRecapBundleItem["status"];
}) {
  if (status === "REJECTED") {
    return (
      <span className="inline-flex shrink-0 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-red-700">
        Ditolak
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
      Disetujui
    </span>
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
    <span className="rounded-xl border border-slate-200 bg-white px-2 py-1">
      <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="font-bold text-slate-900">{value}</span>
    </span>
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
  return value === null ? "Biaya belum ada" : formatCurrency(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(value);
}

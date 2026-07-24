"use client";

import React from "react";
import { Loader2, PackageCheck } from "lucide-react";
import { Button, Modal } from "@pos/ui";
import {
  type BulkBatchDetail,
  useBulkBatchDetail,
} from "@/hooks/useInventoryLogs";

type Snapshot = {
  stock?: number;
  unit?: string | null;
  inboundReceiptImpact?: {
    kind?: "CANONICAL" | "VARIANT";
    delta?: number;
    baseDelta?: number;
  };
};

function asSnapshot(value: unknown): Snapshot {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Snapshot)
    : {};
}

function snapshotNumber(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function impactKind(item: BulkBatchDetail["items"][number]) {
  return (
    asSnapshot(item.afterSnapshot).inboundReceiptImpact?.kind ??
    asSnapshot(item.beforeSnapshot).inboundReceiptImpact?.kind ??
    (item.inventoryLogId ? "CANONICAL" : "VARIANT")
  );
}

function StockImpactTable({
  title,
  items,
}: {
  title: string;
  items: BulkBatchDetail["items"];
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-black text-slate-900">{title}</h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Produk</th>
              <th className="px-3 py-2 text-right">Sebelum</th>
              <th className="px-3 py-2 text-right">Sesudah</th>
              <th className="px-3 py-2 text-right">Perubahan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const before = asSnapshot(item.beforeSnapshot);
              const after = asSnapshot(item.afterSnapshot);
              const beforeStock = snapshotNumber(before.stock);
              const afterStock = snapshotNumber(after.stock);
              const unit = after.unit ?? before.unit ?? "";
              return (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <p className="font-bold text-slate-900">
                      {item.product?.name ?? item.sku}
                    </p>
                    <p className="text-xs text-slate-400">{item.sku}</p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {beforeStock.toLocaleString("id-ID")} {unit}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {afterStock.toLocaleString("id-ID")} {unit}
                  </td>
                  <td className="px-3 py-2 text-right font-black text-emerald-700 tabular-nums">
                    +{(afterStock - beforeStock).toLocaleString("id-ID")}{" "}
                    {unit}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function InboundReceiptStockBundleContent({
  batch,
}: {
  batch: BulkBatchDetail;
}) {
  const summary =
    batch.summary && typeof batch.summary === "object" ? batch.summary : {};
  const supplierName = String(
    summary.supplierName || summary.title || "Supplier",
  );
  const goodsPurchaseNumber =
    typeof summary.goodsPurchaseNumber === "string"
      ? summary.goodsPurchaseNumber
      : null;
  const canonicalItems = batch.items.filter(
    (item) => impactKind(item) === "CANONICAL",
  );
  const variantItems = batch.items.filter(
    (item) => impactKind(item) === "VARIANT",
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <PackageCheck className="h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <p className="font-black text-emerald-950">{supplierName}</p>
          {goodsPurchaseNumber && (
            <p className="text-sm font-semibold text-emerald-800">
              {goodsPurchaseNumber}
            </p>
          )}
        </div>
      </div>

      <StockImpactTable title="Produk Diterima" items={canonicalItems} />
      {variantItems.length > 0 && (
        <StockImpactTable
          title="Dampak Varian Stok Bersama"
          items={variantItems}
        />
      )}
    </div>
  );
}

export function InboundReceiptStockBundleModal({
  open,
  batchId,
  onClose,
}: {
  open: boolean;
  batchId: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useBulkBatchDetail(
    open ? batchId : null,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detail Penerimaan Barang"
      size="3xl"
    >
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          Gagal memuat detail bundle Penerimaan Barang.
        </div>
      ) : (
        <InboundReceiptStockBundleContent batch={data} />
      )}
      <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </Modal>
  );
}

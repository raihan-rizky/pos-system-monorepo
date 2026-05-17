"use client";

import React, { useMemo, useState } from "react";
import { Modal, Button } from "@pos/ui";
import { PackageMinus, PackagePlus, Settings2 } from "lucide-react";
import type { Product } from "@/hooks/useProducts";
import { useBulkStockCommit, useBulkStockPreview } from "../hooks/useBulkStock";
import { BatchResultPanel } from "@/features/batch-operations/components/BatchResultPanel";

export function BulkStockDrawer({
  open,
  onClose,
  products,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
}) {
  const preview = useBulkStockPreview();
  const commit = useBulkStockCommit();
  const [type, setType] = useState<"IN" | "OUT" | "ADJUSTMENT">("IN");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  const productIds = useMemo(() => products.map((product) => product.id), [products]);
  const input = { productIds, type, quantities, note };
  const hasQuantities = productIds.every((id) => (quantities[id] ?? 0) > 0);
  const canPreview = productIds.length > 0 && hasQuantities && note.trim().length > 0;
  const canCommit = Boolean(preview.data && preview.data.errors.length === 0);

  const reset = () => {
    preview.reset();
    commit.reset();
    setType("IN");
    setQuantities({});
    setNote("");
  };

  const close = () => {
    reset();
    onClose();
  };

  const handlePreview = async () => {
    await preview.mutateAsync(input);
  };

  const handleCommit = async () => {
    await commit.mutateAsync(input);
  };

  return (
    <Modal open={open} onClose={close} title="Bulk Stock Update" size="xl" className="max-w-5xl">
      <div className="space-y-5">
        {commit.data ? (
          <BatchResultPanel
            batchOperationId={commit.data.batchOperationId}
            summary={[
              { label: "Products", value: commit.data.updatedProductCount },
              { label: "Stock Logs", value: commit.data.inventoryLogCount },
            ]}
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {([
                ["IN", "Stock In", PackagePlus],
                ["OUT", "Stock Out", PackageMinus],
                ["ADJUSTMENT", "Set Exact", Settings2],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setType(value);
                    preview.reset();
                  }}
                  className={`min-h-11 rounded-xl border px-3 py-3 text-sm font-bold transition-all ${
                    type === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="mx-auto mb-1 h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Batch note</label>
              <textarea
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  preview.reset();
                }}
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
                placeholder="Reason for this stock update"
              />
            </div>

            <div className="max-h-[360px] overflow-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2 text-right">Current</th>
                    <th className="px-3 py-2">Quantity</th>
                    <th className="px-3 py-2 text-right">After</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const quantity = quantities[product.id] ?? 0;
                    const afterStock = type === "IN"
                      ? product.stock + quantity
                      : type === "OUT"
                        ? product.stock - quantity
                        : quantity;
                    return (
                      <tr key={product.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-900">{product.name}</td>
                        <td className="px-3 py-2">{product.sku}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{product.stock} {product.unit}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            value={quantity || ""}
                            onChange={(event) => {
                              setQuantities((current) => ({ ...current, [product.id]: Number(event.target.value) }));
                              preview.reset();
                            }}
                            className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                        </td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums ${afterStock < 0 ? "text-red-600" : "text-slate-900"}`}>
                          {afterStock} {product.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {preview.data && (
              <div className={`rounded-xl border p-3 text-sm ${preview.data.errors.length > 0 ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                {preview.data.errors.length > 0 ? preview.data.errors.join(" ") : `Preview ready for ${preview.data.rows.length} products.`}
              </div>
            )}
            {(preview.error || commit.error) && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {((preview.error || commit.error) as Error).message}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={handlePreview} loading={preview.isPending} disabled={!canPreview || preview.isPending}>
                Preview
              </Button>
              <Button type="button" onClick={handleCommit} loading={commit.isPending} disabled={!canCommit || commit.isPending}>
                Commit Stock Update
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

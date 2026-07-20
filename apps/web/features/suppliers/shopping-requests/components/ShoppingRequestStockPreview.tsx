"use client";

import React, { useState } from "react";
import { ChevronDown, Loader2, TrendingUp } from "lucide-react";

import { ProductStockThumbnail } from "@/features/inventory-management/components/ProductStockThumbnail";
import type { ShoppingRequestStockPreview } from "../helpers/shopping-request-stock";

function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString();
}

export function ShoppingRequestStockPreviewPanel({
  preview,
  loading,
  error,
}: {
  preview: ShoppingRequestStockPreview | null;
  loading: boolean;
  error: string | null;
}) {
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const hasRows = Boolean(
    preview && (preview.groupRows.length > 0 || preview.productRows.length > 0),
  );

  return (
    <section className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-cyan-700">Live preview</p>
          <h3 className="text-sm font-black text-slate-900">Dampak stok setelah disetujui</h3>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>
      ) : !hasRows ? (
        <p className="text-sm text-slate-500">Tambahkan produk dan isi jumlah valid untuk melihat perubahan stok.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {preview?.groupRows.map((row) => {
            const lead = row.variants[0];
            const isExpanded = expandedGroupId === row.stockGroupId;
            const detailId = `variant-detail-${row.stockGroupId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
            return (
              <article key={row.stockGroupId} className="overflow-hidden rounded-xl border border-white bg-white shadow-sm">
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={detailId}
                  onClick={() => setExpandedGroupId(isExpanded ? null : row.stockGroupId)}
                  className="w-full cursor-pointer p-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    {lead && <ProductStockThumbnail name={row.displayName} imageUrl={lead.imageUrl} size="sm" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-900">{row.displayName}</p>
                      <p className="text-[11px] font-bold text-cyan-700">Stok Bersama · {row.itemIds.length} item</p>
                    </div>
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <PreviewMetric label="Sebelum" value={formatQty(row.beforeBaseStock)} />
                    <PreviewMetric label="Sesudah" value={formatQty(row.afterBaseStock)} />
                    <PreviewMetric label="Delta" value={`+${formatQty(row.baseDelta)}`} accent />
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">Unit dasar: {row.baseUnit} · {row.variants.length} varian ikut diperbarui</p>
                </button>

                {isExpanded && (
                  <div id={detailId} className="border-t border-slate-100 bg-slate-50/70 p-3">
                    <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      Perubahan varian
                    </p>
                    <div className="space-y-2">
                      {row.variants.map((variant) => (
                        <div key={variant.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                          <div className="flex items-center gap-2">
                            <ProductStockThumbnail name={variant.name} imageUrl={variant.imageUrl} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-slate-800">{variant.name}</p>
                              <p className="truncate text-[10px] font-semibold text-slate-500">
                                {variant.sku} · {variant.unit}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                            <PreviewMetric label="Sebelum" value={formatQty(variant.beforeStock)} />
                            <PreviewMetric label="Sesudah" value={formatQty(variant.afterStock)} />
                            <PreviewMetric label="Delta" value={`+${formatQty(variant.delta)}`} accent />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {preview?.productRows.map((row) => (
            <article key={row.itemId} className="rounded-xl border border-white bg-white p-3 shadow-sm">
              <div className="flex items-center gap-3">
                <ProductStockThumbnail name={row.productName} imageUrl={row.imageUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{row.productName}</p>
                  <p className="text-[11px] font-bold text-slate-500">Stok Produk Ini · {row.sku}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <PreviewMetric label="Sebelum" value={formatQty(row.beforeStock)} />
                <PreviewMetric label="Sesudah" value={formatQty(row.afterStock)} />
                <PreviewMetric label="Delta" value={`+${formatQty(row.delta)}`} accent />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PreviewMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-black ${accent ? "text-emerald-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Modal, Button } from "@pos/ui";
import {
  AlertTriangle,
  ClipboardList,
  PackageMinus,
  PackagePlus,
  RotateCcw,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { Product } from "@/hooks/useProducts";
import { formatCompoundStock } from "@/features/product-stock-groups/stock-display";
import {
  useBulkStockCommit,
  type BulkStockReason,
} from "../hooks/useBulkStock";
import { BatchResultPanel } from "@/features/batch-operations/components/BatchResultPanel";
import { SupplierSelector } from "@/features/suppliers";

const REASONS_BY_TYPE: Record<
  "IN" | "OUT" | "ADJUSTMENT",
  Array<{ value: BulkStockReason; label: string }>
> = {
  IN: [
    { value: "RESTOCK", label: "Pembelian / Restock" },
    { value: "SALE_RETURN", label: "Retur Penjualan" },
  ],
  OUT: [
    { value: "WASTE", label: "Waste / Rusak" },
    { value: "USAGE", label: "Pemakaian Internal" },
    { value: "SUPPLIER_RETURN", label: "Retur ke Supplier" },
  ],
  ADJUSTMENT: [
    { value: "OPNAME", label: "Stock Opname" },
    { value: "MANUAL_ADJUSTMENT", label: "Penyesuaian Manual" },
  ],
};

export function BulkStockDrawer({
  open,
  onClose,
  products,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
}) {
  const commit = useBulkStockCommit();
  const [type, setType] = useState<"IN" | "OUT" | "ADJUSTMENT">("IN");
  const [reason, setReason] = useState<BulkStockReason>("RESTOCK");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [unitCosts, setUnitCosts] = useState<Record<string, number | null>>({});
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [note, setNote] = useState("");
  const [quickQuantity, setQuickQuantity] = useState("");
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [showNegativeWarning, setShowNegativeWarning] = useState(false);

  const productIds = useMemo(() => products.map((product) => product.id), [products]);
  const input = useMemo(
    () => ({
      productIds,
      type,
      reason,
      quantities,
      unitCosts,
      supplierId: supplierId || undefined,
      supplierName,
      note,
    }),
    [productIds, type, reason, quantities, unitCosts, supplierId, supplierName, note],
  );
  const requiresSupplier = type === "IN" && reason === "RESTOCK";
  const rows = useMemo(
    () =>
      products.map((product) => {
        const quantity = quantities[product.id] ?? 0;
        const unitCost = unitCosts[product.id] !== undefined ? unitCosts[product.id] : (product.costPrice ?? null);
        const afterStock =
          type === "IN"
            ? product.stock + quantity
            : type === "OUT"
              ? product.stock - quantity
              : quantity;

        return {
          product,
          quantity,
          afterStock,
          delta:
            type === "IN"
              ? quantity
              : type === "OUT"
                ? -quantity
                : quantity - product.stock,
          unitCost,
        };
      }),
    [products, quantities, type, unitCosts],
  );
  const filledCount = rows.filter((row) => row.quantity > 0).length;
  const missingCount = Math.max(productIds.length - filledCount, 0);
  const negativeCount = rows.filter((row) => row.afterStock < 0).length;
  const negativeRows = rows.filter((row) => row.afterStock < 0);
  const totalDelta = rows.reduce((sum, row) => sum + row.delta, 0);
  const hasQuantities = missingCount === 0;
  const canTryCommit = productIds.length > 0 && !commit.isPending;

  const reset = useCallback(() => {
    commit.reset();
    setType("IN");
    setReason("RESTOCK");
    setQuantities({});
    setUnitCosts({});
    setSupplierId("");
    setSupplierName("");
    setNote("");
    setQuickQuantity("");
    setValidationWarnings([]);
    setShowNegativeWarning(false);
  }, [commit]);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleTypeChange = useCallback((next: "IN" | "OUT" | "ADJUSTMENT") => {
    setType(next);
    setReason(REASONS_BY_TYPE[next][0].value);
    setSupplierId("");
    commit.reset();
    setValidationWarnings([]);
    setShowNegativeWarning(false);
  }, [commit]);

  const handleQuantityChange = useCallback((productId: string, value: string) => {
    setQuantities((current) => ({ ...current, [productId]: Number(value) }));
    commit.reset();
    setValidationWarnings([]);
  }, [commit]);

  const handleUnitCostChange = useCallback((productId: string, value: string) => {
    setUnitCosts((current) => {
      const next = { ...current };
      if (value === "") {
        next[productId] = null;
      } else {
        next[productId] = Number(value);
      }
      return next;
    });
    commit.reset();
    setValidationWarnings([]);
  }, [commit]);

  const applyQuickQuantity = useCallback(() => {
    const amount = Number(quickQuantity);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setQuantities(Object.fromEntries(productIds.map((id) => [id, amount])));
    commit.reset();
    setValidationWarnings([]);
  }, [commit, productIds, quickQuantity]);

  const clearQuantities = useCallback(() => {
    setQuantities({});
    setQuickQuantity("");
    commit.reset();
    setValidationWarnings([]);
  }, [commit]);

  const handleCommit = async (options: { skipNegativeWarning?: boolean } = {}) => {
    const warnings: string[] = [];
    if (!note.trim()) warnings.push("Catatan batch wajib diisi.");
    if (!hasQuantities) warnings.push(`${missingCount} produk belum memiliki jumlah.`);
    if (requiresSupplier && !supplierId) warnings.push("Supplier wajib dipilih untuk Stock In Restock.");

    if (warnings.length > 0) {
      setValidationWarnings(warnings);
      setShowNegativeWarning(false);
      return;
    }

    if (negativeCount > 0 && !options.skipNegativeWarning) {
      setValidationWarnings([]);
      setShowNegativeWarning(true);
      return;
    }

    setValidationWarnings([]);
    setShowNegativeWarning(false);
    await commit.mutateAsync(input);
  };

  return (
    <Modal open={open} onClose={close} title="Pembaruan Stok Massal" size="5xl" className="max-h-[92dvh] max-w-[96vw] xl:max-w-7xl translate-y-0">
      <div className="space-y-4">
        {commit.data ? (
          <div className="space-y-3">
            {commit.data.pendingApproval && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-bold">Menunggu persetujuan owner</p>
                <p className="mt-1">
                  Permintaan massal berhasil dibuat. Stok produk belum berubah sampai item disetujui.
                </p>
              </div>
            )}
            <BatchResultPanel
              batchOperationId={commit.data.batchOperationId}
              summary={[
                {
                  label: commit.data.pendingApproval ? "Produk diajukan" : "Produk",
                  value: commit.data.pendingApproval ? products.length : commit.data.updatedProductCount,
                },
                { label: "Stock Logs", value: commit.data.inventoryLogCount },
              ]}
            />
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-violet-50 p-4 shadow-[0_16px_42px_rgba(6,182,212,0.16),inset_0_0_0_1px_rgba(124,58,237,0.08)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-100 text-cyan-700 shadow-[0_0_20px_rgba(6,182,212,0.28)]">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-950">Update stok massal</p>
                    <p className="text-sm text-slate-600">
                      {products.length} produk dipilih. Commit akan memvalidasi catatan audit dan memperingatkan stok negatif.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
                  <SummaryTile label="Terisi" value={`${filledCount}/${products.length}`} tone="cyan" />
                  <SummaryTile label="Delta" value={totalDelta > 0 ? `+${totalDelta}` : totalDelta} tone="violet" />
                  <SummaryTile label="Risiko" value={negativeCount} tone={negativeCount > 0 ? "red" : "emerald"} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {([
                ["IN", "Stock In", PackagePlus],
                ["OUT", "Stock Out", PackageMinus],
                ["ADJUSTMENT", "Set Tepat", Settings2],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleTypeChange(value)}
                  className={`min-h-12 cursor-pointer rounded-xl border px-3 py-3 text-sm font-bold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 ${type === value ? "border-cyan-700 bg-slate-950 text-white shadow-[0_10px_28px_rgba(6,182,212,0.22)]" : "border-slate-200 bg-white text-slate-600 hover:border-cyan-200 hover:bg-cyan-50"
                    }`}
                >
                  <Icon className="mx-auto mb-1 h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <label className="mb-1 block text-sm font-bold text-slate-700">Alasan</label>
                <select
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value as BulkStockReason);
                    commit.reset();
                    setValidationWarnings([]);
                  }}
                  className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                >
                  {REASONS_BY_TYPE[type].map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {requiresSupplier ? (
                <SupplierSelector
                  value={supplierId}
                  onChange={(nextSupplierId) => {
                    setSupplierId(nextSupplierId);
                    commit.reset();
                    setValidationWarnings([]);
                  }}
                  error={validationWarnings.find((warning) => warning.includes("Supplier")) ?? null}
                />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <label className="mb-1 block text-sm font-bold text-slate-700">Nama supplier <span className="font-semibold text-slate-400">(opsional)</span></label>
                  <input
                    value={supplierName}
                    onChange={(event) => {
                      setSupplierName(event.target.value);
                      commit.reset();
                      setValidationWarnings([]);
                    }}
                    className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                    placeholder="Contoh: CV Sinar Jaya"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Jika dikosongkan, catatan batch akan dipakai sebagai nama bundle di Stock Logs.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <label className="mb-1 block text-sm font-bold text-slate-700">Catatan batch</label>
              <textarea
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  commit.reset();
                  setValidationWarnings([]);
                }}
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                placeholder="Alasan update stok ini"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900">Jumlah per produk</p>
                  <p className="text-xs text-slate-500">
                    {missingCount > 0 ? `${missingCount} produk belum diisi.` : "Semua produk sudah memiliki jumlah."}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="number"
                    min="1"
                    value={quickQuantity}
                    onChange={(event) => setQuickQuantity(event.target.value)}
                    className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 sm:w-36"
                    placeholder="Isi semua"
                  />
                  <button
                    type="button"
                    onClick={applyQuickQuantity}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
                  >
                    <Sparkles className="h-4 w-4" />
                    Terapkan
                  </button>
                  <button
                    type="button"
                    onClick={clearQuantities}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map(({ product, quantity, afterStock, unitCost }) => (
                <StockQuantityCard
                  key={product.id}
                  product={product}
                  quantity={quantity}
                  afterStock={afterStock}
                  unitCost={unitCost}
                  showUnitCost={requiresSupplier}
                  type={type}
                  onChange={handleQuantityChange}
                  onUnitCostChange={handleUnitCostChange}
                />
              ))}
            </div>

            <div className="hidden max-h-[360px] overflow-auto rounded-xl border border-slate-200 bg-white md:block">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Produk</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2 text-right">Saat Ini</th>
                    <th className="px-3 py-2">Jumlah</th>
                    {requiresSupplier && <th className="px-3 py-2">Harga Beli</th>}
                    <th className="px-3 py-2 text-right">Setelah</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ product, quantity, afterStock, unitCost }) => {
                    return (
                      <tr key={product.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-900">{product.name}</td>
                        <td className="px-3 py-2">{product.sku}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCompoundStock(product)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            value={quantity || ""}
                            onChange={(event) => {
                              handleQuantityChange(product.id, event.target.value);
                            }}
                            className="min-h-10 w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                          />
                        </td>
                        {requiresSupplier && (
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              value={unitCosts[product.id] !== undefined ? (unitCosts[product.id] ?? "") : (product.costPrice ?? "")}
                              onChange={(event) => {
                                handleUnitCostChange(product.id, event.target.value);
                              }}
                              className="min-h-10 w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                            />
                          </td>
                        )}
                        <td className={`px-3 py-2 text-right font-bold tabular-nums ${afterStock < 0 ? "text-red-600" : "text-slate-900"}`}>
                          {formatCompoundStock({ ...product, stock: afterStock })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {negativeCount > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{negativeCount} produk akan memiliki stok negatif. Owner dapat memblokir commit, admin akan mengirim permintaan approval.</span>
              </div>
            )}
            {validationWarnings.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-bold">Lengkapi data sebelum commit</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {validationWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {commit.error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {(commit.error as Error).message}
              </div>
            )}

            <div className="sticky bottom-0 -mx-6 -mb-4 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  {hasQuantities ? "Commit akan langsung memproses update stok." : "Lengkapi jumlah semua produk sebelum commit."}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" onClick={() => handleCommit()} loading={commit.isPending} disabled={!canTryCommit} className="w-full sm:w-auto">
                    Commit Stock Update
                  </Button>
                </div>
              </div>
            </div>

            {showNegativeWarning && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
                  onClick={() => setShowNegativeWarning(false)}
                />
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="negative-stock-warning-title"
                  className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 id="negative-stock-warning-title" className="text-base font-black text-slate-950">
                        Stok setelah commit akan negatif
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {negativeCount} produk memiliki hasil stok negatif. Lanjutkan hanya jika perubahan ini memang diperlukan.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-red-100 bg-red-50/60 p-2">
                    {negativeRows.map((row) => (
                      <div key={row.product.id} className="flex items-center justify-between gap-3 border-b border-red-100 py-2 last:border-b-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{row.product.name}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{row.product.sku}</p>
                        </div>
                        <p className="shrink-0 text-sm font-black text-red-600 tabular-nums">
                          {formatCompoundStock({ ...row.product, stock: row.afterStock })}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setShowNegativeWarning(false)}
                      className="min-h-11 cursor-pointer rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                    >
                      Cek Lagi
                    </button>
                    <Button
                      type="button"
                      variant="danger"
                      loading={commit.isPending}
                      disabled={commit.isPending}
                      onClick={() => handleCommit({ skipNegativeWarning: true })}
                      className="w-full sm:w-auto"
                    >
                      Lanjutkan Commit
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "cyan" | "violet" | "emerald" | "red";
}) {
  const toneClass = {
    cyan: "border-cyan-100 bg-white/80 text-cyan-700",
    violet: "border-violet-100 bg-white/80 text-violet-700",
    emerald: "border-emerald-100 bg-white/80 text-emerald-700",
    red: "border-red-100 bg-red-50 text-red-700",
  }[tone];

  return (
    <div className={`rounded-xl border px-3 py-2 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-wider">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function StockQuantityCard({
  product,
  quantity,
  afterStock,
  unitCost,
  showUnitCost,
  type,
  onChange,
  onUnitCostChange,
}: {
  product: Product;
  quantity: number;
  afterStock: number;
  unitCost: number | null;
  showUnitCost: boolean;
  type: "IN" | "OUT" | "ADJUSTMENT";
  onChange: (productId: string, value: string) => void;
  onUnitCostChange: (productId: string, value: string) => void;
}) {
  const deltaLabel =
    type === "IN"
      ? `+${quantity}`
      : type === "OUT"
        ? `-${quantity}`
        : `${afterStock - product.stock >= 0 ? "+" : ""}${afterStock - product.stock}`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-950">{product.name}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{product.sku}</p>
        </div>
        <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
          {formatCompoundStock(product)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-slate-600">Jumlah</span>
          <input
            type="number"
            min="0"
            value={quantity || ""}
            onChange={(event) => onChange(product.id, event.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
          />
        </label>
        <div className={`min-w-24 rounded-xl border px-3 py-2 text-right ${afterStock < 0 ? "border-red-200 bg-red-50" : "border-cyan-100 bg-cyan-50/70"}`}>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Setelah</p>
          <p className={`text-sm font-black tabular-nums ${afterStock < 0 ? "text-red-600" : "text-slate-950"}`}>
            {formatCompoundStock({ ...product, stock: afterStock })}
          </p>
          <p className="text-[10px] font-bold text-slate-400">{deltaLabel}</p>
        </div>
      </div>
      {showUnitCost && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] font-bold text-slate-600">Harga beli</span>
          <input
            type="number"
            min="0"
            value={unitCost ?? ""}
            onChange={(event) => onUnitCostChange(product.id, event.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
          />
        </label>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  Info,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import { Button } from "@pos/ui";
import { useProducts, type Product, type ProductVariant } from "@/hooks/useProducts";
import { ProductStockThumbnail } from "./ProductStockThumbnail";
import {
  previewStockGroupBulk,
  submitStockGroupBulk,
  type ProductFirstStockBulkRequestRow,
  type ProductFirstStockGroupBulkPreview,
  type ProductFirstStockMode,
} from "../api/inventory-management-api";

type StockActionType = "IN" | "OUT" | "ADJUSTMENT";

interface SelectableProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stock: number;
  imageUrl: string | null;
  category: Product["category"];
  stockGroupId: string | null;
  stockGroup?: Product["stockGroup"];
  unitMultiplierToBase?: number;
  conversionNeedsReview?: boolean;
}

interface SelectedProductRow {
  product: SelectableProduct;
  mode: ProductFirstStockMode;
  type: StockActionType;
  inputValue: string;
  note: string;
  expanded: boolean;
}

function formatQty(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString();
}

function actionLabel(type: StockActionType) {
  if (type === "IN") return "Tambah";
  if (type === "OUT") return "Kurangi";
  return "Set stok akhir";
}

function modeLabel(mode: ProductFirstStockMode) {
  return mode === "GROUP_STOCK" ? "Stok Bersama" : "Stok Produk Ini";
}

function duplicateKey(product: SelectableProduct) {
  return [product.name, product.sku, product.unit]
    .map((part) => part.trim().toLowerCase())
    .join("|");
}

function flattenProductCandidates(products: Product[] | undefined): SelectableProduct[] {
  return (products ?? []).flatMap((product) => {
    if (product.variants && product.variants.length > 0) {
      return product.variants.map((variant: ProductVariant) => {
        const variantExtra = variant as ProductVariant & {
          stockGroupId?: string | null;
          conversionNeedsReview?: boolean;
        };
        return {
          id: variant.id,
          name: product.name,
          sku: variant.sku,
          unit: variant.unit,
          stock: variant.stock,
          imageUrl: product.imageUrl,
          category: product.category,
          stockGroupId: variantExtra.stockGroupId ?? variant.stockGroup?.id ?? product.stockGroupId ?? null,
          stockGroup: variant.stockGroup ?? product.stockGroup,
          unitMultiplierToBase: variant.unitMultiplierToBase,
          conversionNeedsReview:
            variantExtra.conversionNeedsReview ?? product.conversionNeedsReview ?? false,
        };
      });
    }

    return [{
      id: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      stock: product.stock,
      imageUrl: product.imageUrl,
      category: product.category,
      stockGroupId: product.stockGroupId ?? product.stockGroup?.id ?? null,
      stockGroup: product.stockGroup,
      unitMultiplierToBase: product.unitMultiplierToBase,
      conversionNeedsReview: product.conversionNeedsReview ?? false,
    }];
  });
}

function validationMessages(rows: SelectedProductRow[]) {
  const messages: string[] = [];
  const seen = new Set<string>();
  const sharedGroups = new Map<string, string>();

  for (const row of rows) {
    const key = duplicateKey(row.product);
    if (seen.has(key)) {
      messages.push("Produk yang sama sudah dipilih.");
    }
    seen.add(key);

    if (row.mode === "GROUP_STOCK" && row.product.stockGroupId) {
      const existing = sharedGroups.get(row.product.stockGroupId);
      if (existing) {
        messages.push("Pilih satu produk saja per grup stok untuk mode Stok Bersama.");
      }
      sharedGroups.set(row.product.stockGroupId, row.product.id);
    }

    if (!Number.isFinite(Number(row.inputValue)) || Number(row.inputValue) < 0) {
      messages.push(`${row.product.name} perlu jumlah stok yang valid.`);
    }

    if (row.mode === "GROUP_STOCK" && row.product.conversionNeedsReview) {
      messages.push(`${row.product.name} perlu review konversi unit sebelum Stok Bersama diproses.`);
    }
  }

  return Array.from(new Set(messages));
}

function buildRequestRows(rows: SelectedProductRow[]): ProductFirstStockBulkRequestRow[] {
  return rows.map((row) => ({
    productId: row.product.id,
    mode: row.mode,
    type: row.type,
    inputValue: Number(row.inputValue),
    note: row.note.trim() || null,
  }));
}

interface StockGroupBulkPanelProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export const StockGroupBulkPanel: React.FC<StockGroupBulkPanelProps> = ({
  onSuccess,
  onError,
}) => {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<SelectedProductRow[]>([]);
  const [preview, setPreview] = useState<ProductFirstStockGroupBulkPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const productsQuery = useProducts(search, undefined, { limit: 20 });
  const candidates = useMemo(
    () => flattenProductCandidates(productsQuery.data),
    [productsQuery.data],
  );
  const validations = useMemo(() => validationMessages(rows), [rows]);

  const canPreview =
    rows.length > 0 &&
    validations.length === 0 &&
    rows.every((row) => Number.isFinite(Number(row.inputValue)) && Number(row.inputValue) >= 0);

  useEffect(() => {
    if (!canPreview) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setIsPreviewing(true);
    previewStockGroupBulk({ rows: buildRequestRows(rows) })
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null);
          setError(err instanceof Error ? err.message : "Gagal membuat preview stok.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsPreviewing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canPreview, rows]);

  const addProduct = (product: SelectableProduct) => {
    if (rows.some((row) => duplicateKey(row.product) === duplicateKey(product))) {
      setError("Produk yang sama sudah dipilih.");
      return;
    }

    setRows((current) => [
      ...current,
      {
        product,
        mode: product.stockGroupId ? "GROUP_STOCK" : "PRODUCT_ONLY",
        type: "ADJUSTMENT",
        inputValue: formatQty(product.stock),
        note: "",
        expanded: true,
      },
    ]);
    setSearch("");
    setError(null);
    setSuccess(null);
  };

  const updateRow = (productId: string, patch: Partial<Omit<SelectedProductRow, "product">>) => {
    setRows((current) =>
      current.map((row) =>
        row.product.id === productId ? { ...row, ...patch } : row,
      ),
    );
    setSuccess(null);
  };

  const removeRow = (productId: string) => {
    setRows((current) => current.filter((row) => row.product.id !== productId));
    setSuccess(null);
  };

  const submit = async () => {
    if (!canPreview) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await submitStockGroupBulk({ rows: buildRequestRows(rows) });
      setPreview(result.preview);
      const message = "Permintaan update stok massal berhasil dibuat dan menunggu approval owner.";
      setSuccess(message);
      onSuccess?.(message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengajukan update stok massal.";
      setError(message);
      onError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Layers className="h-5 w-5 text-sky-700" />
            Update Stok Massal
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Cari produk, pilih mode stok, lalu ajukan perubahan untuk direview owner.
          </p>
        </div>
        {isPreviewing && (
          <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Menghitung preview
          </span>
        )}
      </div>

      {(error || validations.length > 0) && (
        <div className="mb-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            {error && <p>{error}</p>}
            {validations.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {success}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(360px,440px)_1fr]">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-xs font-bold text-slate-600">
            Cari produk
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm"
                placeholder="Cari nama produk, SKU, atau unit"
              />
            </div>
          </label>

          {search.trim() && (
            <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white">
              {productsQuery.isFetching ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Memuat produk...
                </div>
              ) : candidates.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-500">
                  Produk tidak ditemukan.
                </div>
              ) : (
                candidates.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <ProductStockThumbnail
                        name={product.name}
                        imageUrl={product.imageUrl}
                        categoryName={product.category?.name}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">{product.name}</span>
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          {product.sku} - {product.unit}
                        </span>
                      </span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-slate-500" />
                  </button>
                ))
              )}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div
              title="Perubahan mengikuti stok grup dan ikut menghitung varian lain dalam grup."
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
            >
              <span className="inline-flex items-center gap-1 font-black text-slate-900">
                Stok Bersama
                <Info className="h-3.5 w-3.5" />
              </span>
            </div>
            <div
              title="Perubahan hanya dicatat untuk produk ini dan tidak mengubah stok grup."
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
            >
              <span className="inline-flex items-center gap-1 font-black text-slate-900">
                Stok Produk Ini
                <Info className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
                Belum ada produk dipilih.
              </div>
            ) : (
              rows.map((row) => (
                <div key={row.product.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <ProductStockThumbnail
                        name={row.product.name}
                        imageUrl={row.product.imageUrl}
                        categoryName={row.product.category?.name}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{row.product.name}</p>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          {row.product.sku} - {row.product.unit}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          Stok saat ini: {formatQty(row.product.stock)} {row.product.unit}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Hapus ${row.product.name}`}
                      onClick={() => removeRow(row.product.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600">
                      Aksi
                      <select
                        value={row.type}
                        onChange={(event) =>
                          updateRow(row.product.id, {
                            type: event.target.value as StockActionType,
                            inputValue:
                              event.target.value === "ADJUSTMENT"
                                ? formatQty(row.product.stock)
                                : "",
                          })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      >
                        <option value="IN">Tambah stok</option>
                        <option value="OUT">Kurangi stok</option>
                        <option value="ADJUSTMENT">Set stok akhir</option>
                      </select>
                    </label>

                    <label className="text-xs font-bold text-slate-600">
                      {row.type === "ADJUSTMENT" ? "Stok akhir baru" : "Jumlah"}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.inputValue}
                        onChange={(event) => updateRow(row.product.id, { inputValue: event.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-right text-sm font-bold"
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {([
                      ["GROUP_STOCK", "Stok Bersama", "Perubahan mengikuti stok grup dan ikut menghitung varian lain dalam grup."],
                      ["PRODUCT_ONLY", "Stok Produk Ini", "Perubahan hanya dicatat untuk produk ini dan tidak mengubah stok grup."],
                    ] as const).map(([mode, label, tooltip]) => (
                      <button
                        key={mode}
                        type="button"
                        title={tooltip}
                        onClick={() => updateRow(row.product.id, { mode })}
                        className={`min-h-10 rounded-lg border px-3 py-2 text-left text-xs font-black ${
                          row.mode === mode
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {label}
                          <Info className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    ))}
                  </div>

                  <label className="mt-3 block text-xs font-bold text-slate-600">
                    Catatan
                    <textarea
                      value={row.note}
                      onChange={(event) => updateRow(row.product.id, { note: event.target.value })}
                      className="mt-1 min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Catatan approval"
                    />
                  </label>
                </div>
              ))
            )}
          </div>

          <Button
            type="button"
            onClick={submit}
            disabled={!canPreview || isSubmitting}
            className="w-full bg-slate-900 text-white hover:bg-slate-800"
            icon={<Send className="h-4 w-4" />}
          >
            Ajukan Update Stok
          </Button>
        </div>

        <div className="min-h-80 min-w-0 rounded-xl border border-slate-200 bg-white">
          {!preview ? (
            <div className="flex min-h-80 items-center justify-center p-8 text-center text-sm text-slate-500">
              Pilih produk dan isi jumlah untuk melihat dampak varian secara real time.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {preview.rows.map((previewRow) => {
                const isOpen = rows.find((row) => row.product.id === previewRow.productId)?.expanded ?? true;
                const selected = rows.find((row) => row.product.id === previewRow.productId);
                return (
                  <div key={`${previewRow.mode}-${previewRow.productId}`} className="p-4">
                    <button
                      type="button"
                      onClick={() =>
                        selected && updateRow(selected.product.id, { expanded: !selected.expanded })
                      }
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <ProductStockThumbnail
                          name={
                            previewRow.mode === "GROUP_STOCK"
                              ? previewRow.productName
                              : previewRow.name
                          }
                          imageUrl={
                            previewRow.mode === "GROUP_STOCK"
                              ? selected?.product.imageUrl
                              : previewRow.imageUrl ?? selected?.product.imageUrl
                          }
                          categoryName={selected?.product.category?.name}
                          size="sm"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-slate-900">
                            {previewRow.mode === "GROUP_STOCK"
                              ? previewRow.stockGroupName
                              : previewRow.name}
                          </span>
                          <span className="block text-xs font-semibold text-slate-500">
                            {modeLabel(previewRow.mode)} - {actionLabel(previewRow.type)}
                          </span>
                        </span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isOpen && previewRow.mode === "GROUP_STOCK" && (
                      <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[620px] text-sm">
                          <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wider text-slate-400">
                            <tr>
                              <th className="px-3 py-2">Varian</th>
                              <th className="px-3 py-2 text-right">Sebelum</th>
                              <th className="px-3 py-2 text-right">Sesudah</th>
                              <th className="px-3 py-2 text-right">Delta</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewRow.variants.map((variant) => (
                              <tr key={variant.id} className="border-t border-slate-100">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <ProductStockThumbnail
                                      name={variant.name}
                                      imageUrl={variant.imageUrl}
                                      size="sm"
                                      className="h-8 w-8"
                                    />
                                    <div className="min-w-0">
                                      <p className="truncate font-bold text-slate-900">{variant.name}</p>
                                      <p className="text-[10px] font-bold text-slate-400">{variant.sku} - {variant.unit}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right font-bold tabular-nums">
                                  {formatQty(variant.beforeStock)}
                                </td>
                                <td className="px-3 py-2 text-right font-bold tabular-nums">
                                  {formatQty(variant.afterStock)}
                                </td>
                                <td className={`px-3 py-2 text-right font-black tabular-nums ${variant.delta < 0 ? "text-rose-600" : variant.delta > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                                  {variant.delta > 0 ? "+" : ""}{formatQty(variant.delta)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {isOpen && previewRow.mode === "PRODUCT_ONLY" && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center gap-3">
                          <ProductStockThumbnail
                            name={previewRow.name}
                            imageUrl={previewRow.imageUrl ?? selected?.product.imageUrl}
                            categoryName={selected?.product.category?.name}
                            size="md"
                            className="h-10 w-10 rounded-xl"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-900">{previewRow.name}</p>
                            <p className="text-xs text-slate-500">
                              {formatQty(previewRow.beforeStock)} {"->"} {formatQty(previewRow.afterStock)} {previewRow.unit}
                            </p>
                          </div>
                          <span className={`text-sm font-black tabular-nums ${previewRow.delta < 0 ? "text-rose-600" : previewRow.delta > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                            {previewRow.delta > 0 ? "+" : ""}{formatQty(previewRow.delta)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-500">
                          Stok grup tidak berubah. Catatan log akan memuat mode Stok Produk Ini.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockGroupBulkPanel;

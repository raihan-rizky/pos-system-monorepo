"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Info,
  Package,
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

function formatQty(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString();
}

function actionLabel(type: StockActionType) {
  if (type === "IN") return "Tambah stok";
  if (type === "OUT") return "Kurangi stok";
  return "Set stok akhir";
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

function buildRequestRow(
  product: SelectableProduct,
  mode: ProductFirstStockMode,
  type: StockActionType,
  inputValue: string,
  note: string,
): ProductFirstStockBulkRequestRow {
  return {
    productId: product.id,
    mode,
    type,
    inputValue: Number(inputValue),
    note: note.trim() || null,
  };
}

function validationMessage(
  product: SelectableProduct | null,
  mode: ProductFirstStockMode,
  inputValue: string,
) {
  if (!product) return null;
  if (!Number.isFinite(Number(inputValue)) || Number(inputValue) < 0) {
    return "Masukkan jumlah stok yang valid.";
  }
  if (mode === "GROUP_STOCK" && product.conversionNeedsReview) {
    return "Produk ini perlu review konversi unit sebelum Stok Bersama diproses.";
  }
  return null;
}

function CompactPreview({
  preview,
  selectedProduct,
}: {
  preview: ProductFirstStockGroupBulkPreview | null;
  selectedProduct: SelectableProduct | null;
}) {
  const row = preview?.rows[0] ?? null;

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {selectedProduct && (
            <ProductStockThumbnail
              name={selectedProduct.name}
              imageUrl={selectedProduct.imageUrl}
              categoryName={selectedProduct.category?.name}
              size="sm"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">
              Preview perubahan
            </p>
            <h3 className="truncate text-sm font-black text-slate-900">Dampak stok</h3>
          </div>
        </div>
        {selectedProduct && (
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
            {selectedProduct.unit}
          </span>
        )}
      </div>

      {!selectedProduct ? (
        <p className="text-sm text-slate-500">Pilih satu produk dulu untuk melihat preview.</p>
      ) : !row ? (
        <p className="text-sm text-slate-500">Preview perubahan akan muncul setelah jumlah stok valid.</p>
      ) : row.mode === "PRODUCT_ONLY" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white p-3">
              <p className="text-[11px] font-bold text-slate-400">Sebelum</p>
              <p className="mt-1 text-lg font-black text-slate-900">{formatQty(row.beforeStock)}</p>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-[11px] font-bold text-slate-400">Sesudah</p>
              <p className="mt-1 text-lg font-black text-slate-900">{formatQty(row.afterStock)}</p>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-[11px] font-bold text-slate-400">Delta</p>
              <p className={`mt-1 text-lg font-black ${row.delta < 0 ? "text-rose-600" : row.delta > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                {row.delta > 0 ? "+" : ""}{formatQty(row.delta)}
              </p>
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Stok grup tidak berubah. Pengajuan tetap masuk approval owner.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-white p-3">
            <p className="text-[11px] font-bold text-slate-400">Stok Bersama</p>
            <p className="mt-1 text-sm font-black text-slate-900">
              {formatQty(row.beforeBaseStock)} {"->"} {formatQty(row.afterBaseStock)} {row.baseUnit}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Berdampak ke {row.changedVariants.length} varian dalam grup {row.stockGroupName}.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-white p-3">
              <p className="text-[11px] font-bold text-slate-400">Aksi</p>
              <p className="mt-1 text-sm font-black text-slate-900">{actionLabel(row.type)}</p>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-[11px] font-bold text-slate-400">Input</p>
              <p className="mt-1 text-sm font-black text-slate-900">{formatQty(row.inputValue)}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface SingleStockUpdatePanelProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export const SingleStockUpdatePanel: React.FC<SingleStockUpdatePanelProps> = ({
  onSuccess,
  onError,
}) => {
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<SelectableProduct | null>(null);
  const [mode, setMode] = useState<ProductFirstStockMode>("PRODUCT_ONLY");
  const [type, setType] = useState<StockActionType>("ADJUSTMENT");
  const [inputValue, setInputValue] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<ProductFirstStockGroupBulkPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const productsQuery = useProducts(search, undefined, { limit: 12 });
  const candidates = useMemo(
    () => flattenProductCandidates(productsQuery.data),
    [productsQuery.data],
  );
  const validation = validationMessage(selectedProduct, mode, inputValue);
  const canPreview = Boolean(selectedProduct) && !validation;

  useEffect(() => {
    if (!selectedProduct || !canPreview) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setIsPreviewing(true);
    previewStockGroupBulk({
      rows: [buildRequestRow(selectedProduct, mode, type, inputValue, note)],
    })
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
  }, [canPreview, inputValue, mode, note, selectedProduct, type]);

  const selectProduct = (product: SelectableProduct) => {
    setSelectedProduct(product);
    setMode(product.stockGroupId ? "GROUP_STOCK" : "PRODUCT_ONLY");
    setType("ADJUSTMENT");
    setInputValue(formatQty(product.stock));
    setNote("");
    setSearch("");
    setPreview(null);
    setError(null);
    setSuccess(null);
  };

  const clearSelection = () => {
    setSelectedProduct(null);
    setMode("PRODUCT_ONLY");
    setType("ADJUSTMENT");
    setInputValue("");
    setNote("");
    setPreview(null);
    setError(null);
    setSuccess(null);
  };

  const submit = async () => {
    if (!selectedProduct || !canPreview) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await submitStockGroupBulk({
        rows: [buildRequestRow(selectedProduct, mode, type, inputValue, note)],
      });
      const message = "Permintaan update stok berhasil dibuat dan menunggu approval owner.";
      setSuccess(message);
      onSuccess?.(message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengajukan update stok.";
      setError(message);
      onError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
          <Package className="h-5 w-5 text-cyan-700" />
          Update satu produk
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Cari satu produk, isi perubahan stok, lalu ajukan approval owner.
        </p>
      </div>

      {(error || validation) && (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error || validation}</p>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {success}
        </div>
      )}

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
        <div className="max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white">
          {productsQuery.isFetching ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Memuat produk...
            </div>
          ) : candidates.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">Produk tidak ditemukan.</div>
          ) : (
            candidates.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => selectProduct(product)}
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
                <span className="text-xs font-bold text-slate-500">{formatQty(product.stock)}</span>
              </button>
            ))
          )}
        </div>
      )}

      {selectedProduct ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <ProductStockThumbnail
                name={selectedProduct.name}
                imageUrl={selectedProduct.imageUrl}
                categoryName={selectedProduct.category?.name}
                size="md"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{selectedProduct.name}</p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {selectedProduct.sku} - {selectedProduct.unit}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Stok saat ini: {formatQty(selectedProduct.stock)} {selectedProduct.unit}
                </p>
                {selectedProduct.stockGroup && (
                  <p className="mt-1 text-xs font-semibold text-cyan-700">
                    Grup stok: {selectedProduct.stockGroup.displayName}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label={`Hapus ${selectedProduct.name}`}
              onClick={clearSelection}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">
              Aksi
              <select
                value={type}
                onChange={(event) => {
                  const nextType = event.target.value as StockActionType;
                  setType(nextType);
                  setInputValue(nextType === "ADJUSTMENT" ? formatQty(selectedProduct.stock) : "");
                  setSuccess(null);
                }}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="IN">Tambah stok</option>
                <option value="OUT">Kurangi stok</option>
                <option value="ADJUSTMENT">Set stok akhir</option>
              </select>
            </label>

            <label className="text-xs font-bold text-slate-600">
              {type === "ADJUSTMENT" ? "Stok akhir baru" : "Jumlah"}
              <input
                type="number"
                min="0"
                step="0.01"
                value={inputValue}
                onChange={(event) => {
                  setInputValue(event.target.value);
                  setSuccess(null);
                }}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-right text-sm font-bold"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {selectedProduct.stockGroupId ? (
              ([
                ["GROUP_STOCK", "Stok Bersama", "Perubahan mengikuti stok grup dan ikut menghitung varian lain dalam grup."],
                ["PRODUCT_ONLY", "Stok Produk Ini", "Perubahan hanya dicatat untuk produk ini dan tidak mengubah stok grup."],
              ] as const).map(([nextMode, label, tooltip]) => (
                <button
                  key={nextMode}
                  type="button"
                  title={tooltip}
                  onClick={() => {
                    setMode(nextMode);
                    setSuccess(null);
                  }}
                  className={`min-h-10 rounded-lg border px-3 py-2 text-left text-xs font-black ${
                    mode === nextMode
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 sm:col-span-2">
                Produk ini memakai mode Stok Produk Ini.
              </div>
            )}
          </div>

          <label className="mt-3 block text-xs font-bold text-slate-600">
            Catatan
            <textarea
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setSuccess(null);
              }}
              className="mt-1 min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Catatan approval"
            />
          </label>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
          Pilih satu produk dulu.
        </div>
      )}

      <CompactPreview preview={preview} selectedProduct={selectedProduct} />

      <Button
        type="button"
        onClick={submit}
        disabled={!canPreview || isSubmitting || isPreviewing}
        className="w-full bg-slate-900 text-white hover:bg-slate-800"
        icon={<Send className="h-4 w-4" />}
      >
        Ajukan Update Stok
      </Button>
    </div>
  );
};

export default SingleStockUpdatePanel;

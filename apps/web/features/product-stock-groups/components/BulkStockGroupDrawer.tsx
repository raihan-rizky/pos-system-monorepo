"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, X } from "lucide-react";
import { formatCompoundStock } from "../stock-display";

export interface BulkStockGroupProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stock: number;
  unitMultiplierToBase?: number | null;
  stockGroup?: { baseUnit?: string | null } | null;
}

interface StockGroupOption {
  id: string;
  displayName: string;
  baseUnit: string;
  variantCount: number;
}

interface BulkStockGroupDrawerProps {
  open: boolean;
  products: BulkStockGroupProduct[];
  onClose: () => void;
  onSaved: () => void;
}

function initialPairQuantities(products: BulkStockGroupProduct[]) {
  const source = products[0];
  if (!source) return {};

  return Object.fromEntries(
    products
      .filter((product) => product.id !== source.id)
      .map((product) => {
        const sourceMultiplier = source.unitMultiplierToBase ?? 1;
        const quantity =
          sourceMultiplier > 0
            ? (product.unitMultiplierToBase ?? 1) / sourceMultiplier
            : 1;
        return [product.id, Number(quantity.toFixed(4)).toString()];
      }),
  );
}

export const BulkStockGroupDrawer: React.FC<BulkStockGroupDrawerProps> = ({
  open,
  products,
  onClose,
  onSaved,
}) => {
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [displayName, setDisplayName] = useState(products[0]?.name ?? "");
  const [targetGroupId, setTargetGroupId] = useState("");
  const [sourceProductId, setSourceProductId] = useState(products[0]?.id ?? "");
  const [unitFilter, setUnitFilter] = useState("all");
  const [note, setNote] = useState("");
  const [pairQuantities, setPairQuantities] = useState<Record<string, string>>(
    () => initialPairQuantities(products),
  );
  const [groups, setGroups] = useState<StockGroupOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(products[0]?.name ?? "");
    setSourceProductId(products[0]?.id ?? "");
    setUnitFilter("all");
    setPairQuantities(initialPairQuantities(products));
    setError(null);
  }, [open, products]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/product-stock-groups?limit=100")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => setGroups(body.data ?? []))
      .catch(() => setGroups([]));
  }, [open]);

  const sourceProduct = useMemo(
    () => products.find((product) => product.id === sourceProductId) ?? null,
    [products, sourceProductId],
  );

  const unitOptions = useMemo(
    () => Array.from(new Set(products.map((product) => product.unit))).sort(),
    [products],
  );

  const visibleProducts = useMemo(
    () =>
      unitFilter === "all"
        ? products
        : products.filter((product) => product.unit === unitFilter),
    [products, unitFilter],
  );

  const duplicateUnits = useMemo(() => {
    const units = products.map((product) => product.unit.trim().toLowerCase());
    return new Set(units).size !== units.length;
  }, [products]);

  const conversionPairs = useMemo(
    () =>
      products
        .filter((product) => product.id !== sourceProductId)
        .map((product) => ({
          fromProductId: product.id,
          fromQuantity: 1,
          toProductId: sourceProductId,
          toQuantity: Number(pairQuantities[product.id]),
        })),
    [pairQuantities, products, sourceProductId],
  );

  const productPayload = useMemo(
    () => products.map((product) => ({ productId: product.id })),
    [products],
  );

  const canSave =
    products.length >= 2 &&
    Boolean(sourceProduct) &&
    !duplicateUnits &&
    conversionPairs.every(
      (pair) => Number.isFinite(pair.toQuantity) && pair.toQuantity > 0,
    ) &&
    (targetMode === "new"
      ? Boolean(displayName.trim())
      : Boolean(targetGroupId.trim()));

  const submit = useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);

    try {
      const body = {
        ...(targetMode === "new"
          ? {
              displayName: displayName.trim(),
              baseUnit: sourceProduct?.unit ?? "pcs",
            }
          : {}),
        sourceProductId,
        sharedStock: sourceProduct?.stock ?? 0,
        stockInput: {
          mode: "VARIANT" as const,
          variantProductId: sourceProductId,
        },
        conversionPairs,
        products: productPayload,
        note: note.trim() || undefined,
      };
      const res = await fetch(
        targetMode === "new"
          ? "/api/product-stock-groups"
          : `/api/product-stock-groups/${targetGroupId}/products`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message || "Gagal menyimpan grup stok");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan grup stok");
    } finally {
      setIsSaving(false);
    }
  }, [
    canSave,
    conversionPairs,
    displayName,
    note,
    onClose,
    onSaved,
    productPayload,
    sourceProduct,
    sourceProductId,
    targetGroupId,
    targetMode,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Bulk Grup Stok</p>
              <p className="text-xs text-slate-500">{products.length} produk dipilih</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTargetMode("new")}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${
                targetMode === "new"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Grup Baru
            </button>
            <button
              type="button"
              onClick={() => setTargetMode("existing")}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${
                targetMode === "existing"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Grup Existing
            </button>
          </div>

          {targetMode === "new" ? (
            <label className="block text-xs font-bold text-slate-600">
              Nama Grup
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          ) : (
            <label className="block text-xs font-bold text-slate-600">
              Target Grup
              <select
                value={targetGroupId}
                onChange={(event) => setTargetGroupId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Pilih grup</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.displayName} ({group.variantCount})
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">
              Sumber Stok
              <select
                value={sourceProductId}
                onChange={(event) => setSourceProductId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({formatCompoundStock(product)})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">
              Filter Unit Existing
              <select
                value={unitFilter}
                onChange={(event) => setUnitFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="all">Semua unit</option>
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-bold text-slate-600">Stok Sumber</p>
            <p className="mt-1 text-sm font-black text-slate-900">
              {sourceProduct ? formatCompoundStock(sourceProduct) : "-"}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">
              Pair Konversi
            </p>
            {duplicateUnits && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                Grup tidak boleh memiliki produk aktif dengan unit yang sama.
              </div>
            )}
            {visibleProducts.map((product) => (
              <div
                key={product.id}
                className="grid grid-cols-[1fr_140px] items-center gap-3 rounded-xl border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-500">
                    {product.sku} - {product.unit}
                  </p>
                </div>
                {product.id === sourceProductId ? (
                  <span className="rounded-xl bg-slate-100 px-3 py-2 text-center text-xs font-black text-slate-600">
                    Sumber
                  </span>
                ) : (
                  <label className="text-xs font-bold text-slate-600">
                    1 {product.unit} =
                    <input
                      value={pairQuantities[product.id] ?? ""}
                      onChange={(event) =>
                        setPairQuantities((current) => ({
                          ...current,
                          [product.id]: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-right text-sm"
                      aria-label={`Konversi ${product.name}`}
                    />
                    <span className="mt-1 block text-right text-slate-500">
                      {sourceProduct?.unit ?? "unit"}
                    </span>
                  </label>
                )}
              </div>
            ))}
          </div>

          <label className="block text-xs font-bold text-slate-600">
            Catatan
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-5">
          <button
            type="button"
            disabled={!canSave || isSaving}
            onClick={submit}
            className="h-11 w-full rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving ? "Menyimpan..." : "Simpan Grup Stok"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkStockGroupDrawer;

"use client";

import React, { useEffect, useMemo, useState, Suspense, useCallback } from "react";
import { AlertTriangle, Plus, Save, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  type StockGroupDetail, 
  type StockInputMode 
} from "../api/stock-group-api";
import {
  useSuspenseStockGroupDetail,
  useUpdateSharedStock,
  useUpdateConversionRate,
  useUpdateVariantPrice,
  useAddVariant,
  stockGroupDetailKey,
} from "../hooks/useStockGroup";
import { ErrorBoundary } from "react-error-boundary";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);

export type StockGroupSaveReason =
  | "shared-stock"
  | "conversion-rate"
  | "variant-price"
  | "variant-added";

type WorkspaceTab =
  | "summary"
  | "unitManagement"
  | "pricing"
  | "newVariant"
  | "history";

export interface StockGroupWorkspaceContentProps {
  detail: StockGroupDetail;
  canUpdateStock: boolean;
  sharedStock: string;
  stockInputMode: StockInputMode;
  stockVariantProductId: string;
  note: string;
  isSaving: boolean;
  savingMessage?: string | null;
  successMessage?: string | null;
  onClose: () => void;
  onSharedStockChange: (value: string) => void;
  onStockInputModeChange: (value: StockInputMode) => void;
  onStockVariantProductIdChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSaveSharedStock: () => void;
  activeTab?: WorkspaceTab;
  onActiveTabChange?: (tab: WorkspaceTab) => void;
  conversionDraft?: {
    editMode: "PAIR" | "DIRECT";
    baseProductId: string;
    fromProductId: string;
    fromQuantity: string;
    toProductId: string;
    toQuantity: string;
    mode: "KEEP_SHARED_STOCK" | "PRESERVE_SOURCE_STOCK";
    directMultipliers: Record<string, string>;
  };
  onConversionDraftChange?: (
    draft: StockGroupWorkspaceContentProps["conversionDraft"],
  ) => void;
  onSaveConversion?: () => void;
  priceDrafts?: Record<string, { price: string; costPrice: string; note: string }>;
  onPriceDraftChange?: (
    productId: string,
    draft: { price: string; costPrice: string; note: string },
  ) => void;
  onSavePrice?: (productId: string) => void;
  newVariantDraft?: {
    unit: string;
    price: string;
    costPrice: string;
    stock: string;
    minStock: string;
    conversionFromQuantity: string;
    conversionToProductId: string;
    conversionToQuantity: string;
    note: string;
  };
  onNewVariantDraftChange?: (
    draft: StockGroupWorkspaceContentProps["newVariantDraft"],
  ) => void;
  onAddVariant?: () => void;
}

export function buildUnitManagementDraft(
  detail: StockGroupDetail,
): NonNullable<StockGroupWorkspaceContentProps["conversionDraft"]> {
  const firstVariantId = detail.variants[0]?.id ?? "";
  const secondVariantId = detail.variants[1]?.id ?? firstVariantId;
  const baseProductId =
    detail.variants.find(
      (variant) =>
        variant.unit.trim().toLowerCase() === detail.baseUnit.trim().toLowerCase(),
    )?.id ?? firstVariantId;
  const currentPair = detail.conversionPairs?.[0];

  return {
    editMode: "PAIR",
    baseProductId,
    fromProductId: currentPair?.fromProductId ?? secondVariantId,
    fromQuantity: String(currentPair?.fromQuantity ?? 1),
    toProductId: currentPair?.toProductId ?? firstVariantId,
    toQuantity: String(currentPair?.toQuantity ?? 1),
    mode: "KEEP_SHARED_STOCK",
    directMultipliers: Object.fromEntries(
      detail.variants.map((variant) => [
        variant.id,
        String(variant.unitMultiplierToBase),
      ]),
    ),
  };
}

function calculateMargin(price: number, costPrice?: number | null) {
  if (!Number.isFinite(price) || !Number.isFinite(Number(costPrice))) {
    return { amount: 0, percentage: 0, warning: false };
  }
  const amount = price - Number(costPrice);
  const percentage = price === 0 ? 0 : (amount / price) * 100;
  return { amount, percentage, warning: amount < 0 };
}

export function StockGroupWorkspaceContent({
  detail,
  canUpdateStock,
  sharedStock,
  stockInputMode,
  stockVariantProductId,
  note,
  isSaving,
  savingMessage,
  successMessage,
  onClose,
  onSharedStockChange,
  onStockInputModeChange,
  onStockVariantProductIdChange,
  onNoteChange,
  onSaveSharedStock,
  activeTab = "summary",
  onActiveTabChange,
  conversionDraft,
  onConversionDraftChange,
  onSaveConversion,
  priceDrafts = {},
  onPriceDraftChange,
  onSavePrice,
  newVariantDraft,
  onNewVariantDraftChange,
  onAddVariant,
}: StockGroupWorkspaceContentProps) {
  const existingUnits = useMemo(
    () => detail.variants.map((variant) => variant.unit.toLowerCase()),
    [detail.variants],
  );
  const newUnitExists =
    !!newVariantDraft?.unit &&
    existingUnits.includes(newVariantDraft.unit.trim().toLowerCase());
  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: "summary", label: "Ringkasan" },
    { id: "unitManagement", label: "Unit Management" },
    { id: "pricing", label: "Harga & Margin" },
    { id: "newVariant", label: "Tambah Varian" },
    { id: "history", label: "Riwayat Aktivitas" },
  ];
  const selectedBaseVariant = detail.variants.find(
    (variant) => variant.id === conversionDraft?.baseProductId,
  );
  const selectedSourceVariant = detail.variants.find(
    (variant) => variant.id === conversionDraft?.fromProductId,
  );
  const conversionPreview = useMemo(() => {
    if (!conversionDraft || !selectedBaseVariant) return [];
    const nextMultipliers = new Map<string, number>();

    if (conversionDraft.editMode === "DIRECT") {
      for (const variant of detail.variants) {
        const next =
          variant.id === conversionDraft.baseProductId
            ? 1
            : Number(conversionDraft.directMultipliers[variant.id] ?? "");
        if (!Number.isFinite(next) || next <= 0) return [];
        nextMultipliers.set(variant.id, next);
      }
    } else {
      const from = detail.variants.find(
        (variant) => variant.id === conversionDraft.fromProductId,
      );
      const to = detail.variants.find(
        (variant) => variant.id === conversionDraft.toProductId,
      );
      const fromQty = Number(conversionDraft.fromQuantity);
      const toQty = Number(conversionDraft.toQuantity);
      if (
        !from ||
        !to ||
        !Number.isFinite(fromQty) ||
        !Number.isFinite(toQty) ||
        fromQty <= 0 ||
        toQty <= 0
      ) {
        return [];
      }
      for (const variant of detail.variants) {
        if (variant.id === conversionDraft.baseProductId) {
          nextMultipliers.set(variant.id, 1);
        } else if (variant.id === from.id && to.id === conversionDraft.baseProductId) {
          nextMultipliers.set(variant.id, toQty / fromQty);
        } else if (variant.id === to.id && from.id === conversionDraft.baseProductId) {
          nextMultipliers.set(variant.id, fromQty / toQty);
        } else {
          nextMultipliers.set(variant.id, variant.unitMultiplierToBase);
        }
      }
    }

    const baseChanged =
      selectedBaseVariant.unit.trim().toLowerCase() !==
      detail.baseUnit.trim().toLowerCase();
    const nextBaseStock =
      conversionDraft.mode === "PRESERVE_SOURCE_STOCK" && selectedSourceVariant
        ? selectedSourceVariant.stock *
          (nextMultipliers.get(selectedSourceVariant.id) ?? 1)
        : baseChanged
          ? detail.baseStock / selectedBaseVariant.unitMultiplierToBase
          : detail.baseStock;

    return detail.variants.map((variant) => {
      const nextMultiplier = nextMultipliers.get(variant.id) ?? variant.unitMultiplierToBase;
      return {
        productId: variant.id,
        unit: variant.unit,
        oldDisplayStock: variant.stock,
        newDisplayStock: nextBaseStock / nextMultiplier,
        oldMultiplier: variant.unitMultiplierToBase,
        newMultiplier: nextMultiplier,
      };
    });
  }, [conversionDraft, detail.baseStock, detail.baseUnit, detail.variants, selectedBaseVariant, selectedSourceVariant]);

  return (
    <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-sm font-black text-slate-900">
            {detail.displayName || "Stok Unit"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Base: {detail.baseStock} {detail.baseUnit}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
          aria-label="Tutup"
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="border-b border-slate-100 px-5 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onActiveTabChange?.(tab.id)}
              className={`h-9 shrink-0 rounded-lg px-3 text-xs font-black ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[72vh] overflow-y-auto p-5">
        <div className="space-y-4">
          {isSaving && (
            <div
              className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-700"
              role="status"
              aria-live="polite"
            >
              {savingMessage ?? "Menyimpan perubahan stok unit..."}
            </div>
          )}

          {successMessage && !isSaving && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-emerald-700">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              {successMessage}
            </div>
          )}

          {(detail.hasNegativeStock || detail.hasDuplicateUnits) && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {detail.hasNegativeStock && <p>Stok bersama bernilai negatif.</p>}
              {detail.hasDuplicateUnits && (
                <p>Grup memiliki unit duplikat dan perlu direview.</p>
              )}
            </div>
          )}

          {activeTab === "summary" && (
            <section className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-black uppercase text-slate-500">
                  Konversi Saat Ini
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(detail.conversionPairs ?? []).length > 0 ? (
                    detail.conversionPairs?.map((pair) => (
                      <span
                        key={`${pair.fromProductId}:${pair.toProductId}`}
                        className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-black text-sky-700 ring-1 ring-sky-100"
                      >
                        {pair.label}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm font-semibold text-slate-500">
                      Belum ada pair konversi antar unit.
                    </span>
                  )}
                </div>
              </div>

              {canUpdateStock && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="text-xs font-bold text-slate-600">
                      Shared Stock
                      <input
                        value={sharedStock}
                        onChange={(event) =>
                          onSharedStockChange(event.target.value)
                        }
                        inputMode="decimal"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Unit Input
                      <select
                        value={
                          stockInputMode === "BASE"
                            ? "BASE"
                            : stockVariantProductId
                        }
                        onChange={(event) => {
                          if (event.target.value === "BASE") {
                            onStockInputModeChange("BASE");
                          } else {
                            onStockInputModeChange("VARIANT");
                            onStockVariantProductIdChange(event.target.value);
                          }
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="BASE">{detail.baseUnit}</option>
                        {detail.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.unit}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Catatan
                      <input
                        value={note}
                        onChange={(event) => onNoteChange(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={onSaveSharedStock}
                    disabled={isSaving || sharedStock.trim() === ""}
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:bg-slate-300"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Menyimpan..." : "Simpan Shared Stock"}
                  </button>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                {detail.variants.map((variant) => (
                  <VariantSummary key={variant.id} variant={variant} />
                ))}
              </div>
            </section>
          )}

          {activeTab === "unitManagement" && (
            <section className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-black text-slate-900">
                  Unit Management
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Atur unit terkecil, conversion rate, dan preview perubahan stok.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">
                    Unit terkecil/base
                    <select
                      value={conversionDraft?.baseProductId ?? ""}
                      onChange={(event) =>
                        onConversionDraftChange?.({
                          ...conversionDraft!,
                          baseProductId: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      {detail.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Mode editor
                    <select
                      value={conversionDraft?.editMode ?? "PAIR"}
                      onChange={(event) =>
                        onConversionDraftChange?.({
                          ...conversionDraft!,
                          editMode: event.target.value as "PAIR" | "DIRECT",
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="PAIR">Pair conversion</option>
                      <option value="DIRECT">Direct multiplier</option>
                    </select>
                  </label>
                </div>
                {conversionDraft?.editMode !== "DIRECT" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-bold text-slate-600">
                    Unit asal
                    <select
                      value={conversionDraft?.fromProductId ?? ""}
                      onChange={(event) =>
                        onConversionDraftChange?.({
                          ...conversionDraft!,
                          fromProductId: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      {detail.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Qty asal
                    <input
                      value={conversionDraft?.fromQuantity ?? "1"}
                      onChange={(event) =>
                        onConversionDraftChange?.({
                          ...conversionDraft!,
                          fromQuantity: event.target.value,
                        })
                      }
                      inputMode="decimal"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Setara unit
                    <select
                      value={conversionDraft?.toProductId ?? ""}
                      onChange={(event) =>
                        onConversionDraftChange?.({
                          ...conversionDraft!,
                          toProductId: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      {detail.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Qty setara
                    <input
                      value={conversionDraft?.toQuantity ?? "1"}
                      onChange={(event) =>
                        onConversionDraftChange?.({
                          ...conversionDraft!,
                          toQuantity: event.target.value,
                        })
                      }
                      inputMode="decimal"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {detail.variants.map((variant) => (
                      <label key={variant.id} className="text-xs font-bold text-slate-600">
                        1 {variant.unit} = ...
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            value={
                              variant.id === conversionDraft.baseProductId
                                ? "1"
                                : conversionDraft.directMultipliers[variant.id] ?? ""
                            }
                            onChange={(event) =>
                              onConversionDraftChange?.({
                                ...conversionDraft,
                                directMultipliers: {
                                  ...conversionDraft.directMultipliers,
                                  [variant.id]: event.target.value,
                                },
                              })
                            }
                            disabled={variant.id === conversionDraft.baseProductId}
                            inputMode="decimal"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
                          />
                          <span className="shrink-0 text-xs font-black text-slate-500">
                            {selectedBaseVariant?.unit ?? detail.baseUnit}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <label className="mt-3 block text-xs font-bold text-slate-600">
                  Mode update stok
                  <select
                    value={conversionDraft?.mode ?? "KEEP_SHARED_STOCK"}
                    onChange={(event) =>
                      onConversionDraftChange?.({
                        ...conversionDraft!,
                        mode: event.target.value as
                          | "KEEP_SHARED_STOCK"
                          | "PRESERVE_SOURCE_STOCK",
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="KEEP_SHARED_STOCK">
                      Pertahankan shared stock
                    </option>
                    <option value="PRESERVE_SOURCE_STOCK">
                      Pertahankan stok unit asal
                    </option>
                  </select>
                </label>
                {conversionDraft?.fromProductId ===
                  conversionDraft?.toProductId && (
                  <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                    Unit asal dan setara harus berbeda.
                  </div>
                )}
                {conversionPreview.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                    <div className="grid grid-cols-4 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
                      <span>Unit</span>
                      <span>Multiplier</span>
                      <span>Stok sekarang</span>
                      <span>Stok setelah simpan</span>
                    </div>
                    {conversionPreview.map((row) => (
                      <div
                        key={row.productId}
                        className="grid grid-cols-4 border-t border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        <span>{row.unit}</span>
                        <span>
                          {row.oldMultiplier} &rarr; {row.newMultiplier}
                        </span>
                        <span>{row.oldDisplayStock.toFixed(4).replace(/\.?0+$/, "")}</span>
                        <span>{row.newDisplayStock.toFixed(4).replace(/\.?0+$/, "")}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={onSaveConversion}
                  disabled={isSaving}
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:bg-slate-300"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Menyimpan..." : "Simpan Unit Management"}
                </button>
              </div>
            </section>
          )}

          {activeTab === "pricing" && (
            <section className="space-y-3">
              {detail.variants.map((variant) => {
                const draft = priceDrafts[variant.id] ?? {
                  price: String(variant.price),
                  costPrice: String(variant.costPrice ?? ""),
                  note: "",
                };
                const margin = calculateMargin(
                  Number(draft.price),
                  draft.costPrice === "" ? null : Number(draft.costPrice),
                );
                return (
                  <div
                    key={variant.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-black text-slate-900">
                          {variant.unit} - {variant.sku}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          Margin {fmt(margin.amount)} (
                          {margin.percentage.toFixed(1)}%)
                        </p>
                      </div>
                      {margin.warning && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-black text-amber-700 ring-1 ring-amber-100">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Margin negatif
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="text-xs font-bold text-slate-600">
                        Harga katalog
                        <input
                          value={draft.price}
                          onChange={(event) =>
                            onPriceDraftChange?.(variant.id, {
                              ...draft,
                              price: event.target.value,
                            })
                          }
                          inputMode="decimal"
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        HPP
                        <input
                          value={draft.costPrice}
                          onChange={(event) =>
                            onPriceDraftChange?.(variant.id, {
                              ...draft,
                              costPrice: event.target.value,
                            })
                          }
                          inputMode="decimal"
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        Catatan harga
                        <input
                          value={draft.note}
                          onChange={(event) =>
                            onPriceDraftChange?.(variant.id, {
                              ...draft,
                              note: event.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSavePrice?.(variant.id)}
                      disabled={isSaving}
                      className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:bg-slate-300"
                    >
                      <Save className="h-4 w-4" />
                      {isSaving ? "Menyimpan..." : "Simpan harga varian"}
                    </button>
                  </div>
                );
              })}
            </section>
          )}

          {activeTab === "newVariant" && (
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-slate-700" />
                <p className="text-sm font-black text-slate-900">
                  Tambahkan varian baru
                </p>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Nama dan SKU mengikuti produk grup, suffix SKU dibuat dari unit.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["unit", "Unit"],
                  ["price", "Harga"],
                  ["costPrice", "HPP"],
                  ["stock", "Stok saat ini"],
                  ["minStock", "Minimum stok warning"],
                ].map(([key, label]) => (
                  <label key={key} className="text-xs font-bold text-slate-600">
                    {label}
                    <input
                      value={
                        newVariantDraft?.[
                          key as keyof NonNullable<
                            StockGroupWorkspaceContentProps["newVariantDraft"]
                          >
                        ] ?? ""
                      }
                      onChange={(event) =>
                        onNewVariantDraftChange?.({
                          ...newVariantDraft!,
                          [key]: event.target.value,
                        })
                      }
                      inputMode={key === "unit" ? "text" : "decimal"}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                ))}
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-xs font-bold text-slate-600">
                    Setup conversion
                  </p>
                  <div className="mt-1 grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="text-xs font-bold text-slate-600">
                      Qty varian baru
                      <input
                        value={newVariantDraft?.conversionFromQuantity ?? ""}
                        onChange={(event) =>
                          onNewVariantDraftChange?.({
                            ...newVariantDraft!,
                            conversionFromQuantity: event.target.value,
                          })
                        }
                        inputMode="decimal"
                        className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                      />
                    </label>
                    <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700">
                      {newVariantDraft?.unit.trim() || "Unit baru"}
                    </div>
                    <div className="hidden h-10 items-center px-1 text-sm font-black text-slate-500 sm:flex">
                      =
                    </div>
                    <label className="text-xs font-bold text-slate-600">
                      Qty target
                      <input
                        value={newVariantDraft?.conversionToQuantity ?? ""}
                        onChange={(event) =>
                          onNewVariantDraftChange?.({
                            ...newVariantDraft!,
                            conversionToQuantity: event.target.value,
                          })
                        }
                        inputMode="decimal"
                        className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Unit target
                      <select
                        value={newVariantDraft?.conversionToProductId ?? ""}
                        onChange={(event) =>
                          onNewVariantDraftChange?.({
                            ...newVariantDraft!,
                            conversionToProductId: event.target.value,
                          })
                        }
                        className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                      >
                        {detail.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.unit}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <label className="text-xs font-bold text-slate-600">
                  Catatan
                  <input
                    value={newVariantDraft?.note ?? ""}
                    onChange={(event) =>
                      onNewVariantDraftChange?.({
                        ...newVariantDraft!,
                        note: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              {newUnitExists && (
                <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                  Unit sudah ada di grup ini.
                </div>
              )}
              <button
                type="button"
                onClick={onAddVariant}
                disabled={newUnitExists || isSaving}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:bg-slate-300"
              >
                <Plus className="h-4 w-4" />
                {isSaving ? "Menambahkan varian..." : "Tambah varian"}
              </button>
            </section>
          )}

          {activeTab === "history" && (
            <section className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-black text-slate-900">
                Riwayat Aktivitas Grup
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Perubahan stok, varian, harga, dan unit management untuk grup ini.
              </p>
              <div className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-500">
                Riwayat conversion rate dimuat dari endpoint riwayat grup ini.
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function VariantSummary({
  variant,
}: {
  variant: StockGroupDetail["variants"][number];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="break-words text-sm font-black text-slate-900">
          {variant.name}
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {variant.sku} - multiplier {variant.unitMultiplierToBase}
        </p>
        {variant.conversionNeedsReview && (
          <span className="mt-2 inline-flex rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700 ring-1 ring-amber-100">
            Perlu review konversi
          </span>
        )}
      </div>
      <div className="text-left sm:text-right">
        <p className="text-base font-black tabular-nums text-slate-900">
          {variant.stock}{" "}
          <span className="text-xs text-slate-500">{variant.unit}</span>
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {fmt(variant.price)}
        </p>
      </div>
    </div>
  );
}

export function StockGroupWorkspaceModal({
  stockGroupId,
  onClose,
  canUpdateStock,
  onSaved,
}: {
  stockGroupId: string;
  onClose: () => void;
  canUpdateStock: boolean;
  onSaved: (reason?: StockGroupSaveReason) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <ErrorBoundary
        fallback={
          <div className="w-full max-w-xl rounded-2xl border border-red-100 bg-white p-5 shadow-2xl">
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              Gagal memuat stok unit. Silakan coba lagi.
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 h-10 rounded-xl bg-slate-900 px-4 text-sm font-black text-white"
            >
              Tutup
            </button>
          </div>
        }
      >
        <Suspense
          fallback={
            <div className="rounded-xl bg-white px-5 py-4 text-sm font-semibold text-slate-500 shadow-xl">
              Memuat...
            </div>
          }
        >
          <StockGroupWorkspaceDataFetcher
            stockGroupId={stockGroupId}
            onClose={onClose}
            canUpdateStock={canUpdateStock}
            onSaved={onSaved}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

function StockGroupWorkspaceDataFetcher({
  stockGroupId,
  onClose,
  canUpdateStock,
  onSaved,
}: {
  stockGroupId: string;
  onClose: () => void;
  canUpdateStock: boolean;
  onSaved: (reason?: StockGroupSaveReason) => void;
}) {
  const { data: detail } = useSuspenseStockGroupDetail(stockGroupId);
  const queryClient = useQueryClient();
  
  const [sharedStock, setSharedStock] = useState(() => String(detail.baseStock));
  const [stockInputMode, setStockInputMode] = useState<StockInputMode>("BASE");
  const firstVariantId = detail.variants[0]?.id ?? "";
  const [stockVariantProductId, setStockVariantProductId] = useState(firstVariantId);
  const [note, setNote] = useState("");
  
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("summary");
  
  const [conversionDraft, setConversionDraft] = useState<NonNullable<StockGroupWorkspaceContentProps["conversionDraft"]>>(() =>
    buildUnitManagementDraft(detail),
  );
  
  const [priceDrafts, setPriceDrafts] = useState<Record<string, { price: string; costPrice: string; note: string }>>(() => 
    Object.fromEntries(
      detail.variants.map((variant) => [
        variant.id,
        {
          price: String(variant.price),
          costPrice: variant.costPrice == null ? "" : String(variant.costPrice),
          note: "",
        },
      ]),
    )
  );
  
  const [newVariantDraft, setNewVariantDraft] = useState<NonNullable<StockGroupWorkspaceContentProps["newVariantDraft"]>>(() => ({
    unit: "",
    price: "",
    costPrice: "",
    stock: "0",
    minStock: "5",
    conversionFromQuantity: "1",
    conversionToProductId: firstVariantId,
    conversionToQuantity: "1",
    note: "",
  }));

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const showSuccess = useCallback((msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const resetDrafts = useCallback(() => {
    const next = queryClient.getQueryData<StockGroupDetail>(stockGroupDetailKey(stockGroupId));
    if (!next) return;
    setSharedStock(String(next.baseStock));
    const first = next.variants[0]?.id ?? "";
    setStockVariantProductId(first);
    setConversionDraft(buildUnitManagementDraft(next));
    setPriceDrafts(
      Object.fromEntries(
        next.variants.map((variant) => [
          variant.id,
          {
            price: String(variant.price),
            costPrice: variant.costPrice == null ? "" : String(variant.costPrice),
            note: "",
          },
        ]),
      )
    );
    setNewVariantDraft({
      unit: "",
      price: "",
      costPrice: "",
      stock: "0",
      minStock: "5",
      conversionFromQuantity: "1",
      conversionToProductId: first,
      conversionToQuantity: "1",
      note: "",
    });
  }, [queryClient, stockGroupId]);

  const updateSharedStockMut = useUpdateSharedStock(stockGroupId);
  const updateConversionRateMut = useUpdateConversionRate(stockGroupId);
  const updateVariantPriceMut = useUpdateVariantPrice(stockGroupId);
  const addVariantMut = useAddVariant(stockGroupId);

  const isSaving = 
    updateSharedStockMut.isPending || 
    updateConversionRateMut.isPending || 
    updateVariantPriceMut.isPending || 
    addVariantMut.isPending;

  let savingMessage = null;
  if (updateSharedStockMut.isPending) savingMessage = "Menyimpan shared stock...";
  else if (updateConversionRateMut.isPending) savingMessage = "Menyimpan unit management...";
  else if (updateVariantPriceMut.isPending) savingMessage = "Menyimpan harga varian...";
  else if (addVariantMut.isPending) savingMessage = "Menambahkan varian baru...";

  const error = 
    updateSharedStockMut.error?.message || 
    updateConversionRateMut.error?.message || 
    updateVariantPriceMut.error?.message || 
    addVariantMut.error?.message;

  const handlePriceDraftChange = useCallback((productId: string, draft: { price: string; costPrice: string; note: string }) => {
    setPriceDrafts((current) => ({ ...current, [productId]: draft }));
  }, []);

  const saveSharedStock = useCallback(() => {
    if (!Number.isFinite(Number(sharedStock))) return;
    updateSharedStockMut.mutate(
      {
        sharedStock: Number(sharedStock),
        stockInput: stockInputMode === "BASE" ? { mode: "BASE" } : { mode: "VARIANT", variantProductId: stockVariantProductId },
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          onSaved("shared-stock");
          showSuccess("Berhasil menyimpan shared stock");
          resetDrafts();
        },
      }
    );
  }, [sharedStock, stockInputMode, stockVariantProductId, note, updateSharedStockMut, onSaved, showSuccess, resetDrafts]);

  const saveConversion = useCallback(() => {
    if (!conversionDraft) return;
    const payload =
      conversionDraft.editMode === "DIRECT"
        ? {
            mode: conversionDraft.mode,
            baseProductId: conversionDraft.baseProductId,
            sourceProductId: conversionDraft.fromProductId,
            note: note.trim() || undefined,
            directMultipliers: detail.variants.map((variant) => ({
              productId: variant.id,
              unitMultiplierToBase:
                variant.id === conversionDraft.baseProductId
                  ? 1
                  : Number(conversionDraft.directMultipliers[variant.id]),
            })),
          }
        : {
            mode: conversionDraft.mode,
            baseProductId: conversionDraft.baseProductId,
            sourceProductId: conversionDraft.fromProductId,
            note: note.trim() || undefined,
            conversionPairs: [
              {
                fromProductId: conversionDraft.fromProductId,
                fromQuantity: Number(conversionDraft.fromQuantity),
                toProductId: conversionDraft.toProductId,
                toQuantity: Number(conversionDraft.toQuantity),
              },
            ],
          };
    updateConversionRateMut.mutate(
      payload,
      {
        onSuccess: () => {
          onSaved("conversion-rate");
          showSuccess("Berhasil memperbarui unit management");
          resetDrafts();
        },
      }
    );
  }, [conversionDraft, detail.variants, note, updateConversionRateMut, onSaved, showSuccess, resetDrafts]);

  const savePrice = useCallback((productId: string) => {
    const draft = priceDrafts[productId];
    if (!draft) return;
    updateVariantPriceMut.mutate(
      {
        productId,
        payload: {
          price: Number(draft.price),
          costPrice: draft.costPrice === "" ? null : Number(draft.costPrice),
          priceChangeNote: draft.note.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          onSaved("variant-price");
          showSuccess("Berhasil memperbarui harga varian");
          resetDrafts();
        },
      }
    );
  }, [priceDrafts, updateVariantPriceMut, onSaved, showSuccess, resetDrafts]);

  const handleAddVariant = useCallback(() => {
    if (!newVariantDraft) return;
    addVariantMut.mutate(
      {
        unit: newVariantDraft.unit,
        price: Number(newVariantDraft.price),
        costPrice: newVariantDraft.costPrice === "" ? null : Number(newVariantDraft.costPrice),
        stock: Number(newVariantDraft.stock),
        minStock: Number(newVariantDraft.minStock),
        conversionPair: newVariantDraft.conversionToProductId
          ? {
              fromQuantity: Number(newVariantDraft.conversionFromQuantity),
              toProductId: newVariantDraft.conversionToProductId,
              toQuantity: Number(newVariantDraft.conversionToQuantity),
            }
          : undefined,
        note: newVariantDraft.note.trim() || undefined,
      },
      {
        onSuccess: () => {
          onSaved("variant-added");
          showSuccess("Berhasil menambahkan varian baru");
          resetDrafts();
        },
      }
    );
  }, [newVariantDraft, addVariantMut, onSaved, showSuccess, resetDrafts]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      {error && (
        <div className="mx-auto mb-3 max-w-5xl rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      <StockGroupWorkspaceContent
        detail={detail}
        canUpdateStock={canUpdateStock}
        sharedStock={sharedStock}
        stockInputMode={stockInputMode}
        stockVariantProductId={stockVariantProductId}
        note={note}
        isSaving={isSaving}
        savingMessage={savingMessage}
        successMessage={successMessage}
        onClose={onClose}
        onSharedStockChange={setSharedStock}
        onStockInputModeChange={setStockInputMode}
        onStockVariantProductIdChange={setStockVariantProductId}
        onNoteChange={setNote}
        onSaveSharedStock={saveSharedStock}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        conversionDraft={conversionDraft}
        onConversionDraftChange={(draft) => { if (draft) setConversionDraft(draft); }}
        onSaveConversion={saveConversion}
        priceDrafts={priceDrafts}
        onPriceDraftChange={handlePriceDraftChange}
        onSavePrice={savePrice}
        newVariantDraft={newVariantDraft}
        onNewVariantDraftChange={(draft) => { if (draft) setNewVariantDraft(draft); }}
        onAddVariant={handleAddVariant}
      />
    </div>
  );
}

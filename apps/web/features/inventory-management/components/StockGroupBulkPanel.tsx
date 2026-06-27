"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Boxes, RefreshCw, Send } from "lucide-react";
import { Button } from "@pos/ui";
import { getDefaultProductImage } from "@/lib/utils";
import {
  previewStockGroupBulk,
  submitStockGroupBulk,
  type StockGroupBulkPreview,
} from "../api/inventory-management-api";
import { fetchStockGroupDetail, type StockGroupDetail } from "@/features/product-stock-groups/api/stock-group-api";

interface StockGroupOption {
  id: string;
  displayName: string;
  baseUnit: string;
  baseStock: number;
  variantCount: number;
}

function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function StockGroupBulkPanel() {
  const [groups, setGroups] = useState<StockGroupOption[]>([]);
  const [groupId, setGroupId] = useState("");
  const [detail, setDetail] = useState<StockGroupDetail | null>(null);
  const [type, setType] = useState<"OUT" | "ADJUSTMENT">("ADJUSTMENT");
  const [basis, setBasis] = useState<"BASE" | "VARIANT">("BASE");
  const [variantProductId, setVariantProductId] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<StockGroupBulkPreview | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setIsLoadingGroups(true);
    fetch("/api/product-stock-groups?limit=100&minVariants=2")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => setGroups(body.data ?? []))
      .catch(() => setError("Gagal memuat grup stok."))
      .finally(() => setIsLoadingGroups(false));
  }, []);

  useEffect(() => {
    if (!groupId) {
      setDetail(null);
      return;
    }
    setIsLoadingDetail(true);
    setError(null);
    fetchStockGroupDetail(groupId)
      .then((data) => {
        setDetail(data);
        setVariantProductId(data.variants[0]?.id ?? "");
        setInputValue(formatQty(data.baseStock));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat detail grup"))
      .finally(() => setIsLoadingDetail(false));
  }, [groupId]);

  const stockInput = useMemo(
    () =>
      basis === "BASE"
        ? ({ mode: "BASE" } as const)
        : ({ mode: "VARIANT", variantProductId } as const),
    [basis, variantProductId],
  );

  const canPreview =
    Boolean(groupId) &&
    Number.isFinite(Number(inputValue)) &&
    Number(inputValue) >= 0 &&
    (basis === "BASE" || Boolean(variantProductId));

  const runPreview = async () => {
    if (!canPreview) return;
    setError(null);
    setSuccess(null);
    try {
      const data = await previewStockGroupBulk({
        stockGroupId: groupId,
        type,
        stockInput,
        inputValue: Number(inputValue),
        note: note.trim() || null,
      });
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Gagal membuat preview");
    }
  };

  const submit = async () => {
    if (!canPreview) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await submitStockGroupBulk({
        stockGroupId: groupId,
        type,
        stockInput,
        inputValue: Number(inputValue),
        note: note.trim() || null,
      });
      setPreview(result.preview);
      setSuccess("Request bulk grup stok dibuat dan menunggu approval owner.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengajukan request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Boxes className="h-5 w-5 text-sky-700" />
            Bulk & Grup Stok
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Ajukan OUT atau ADJUSTMENT untuk satu grup stok existing.
          </p>
        </div>
        {isLoadingGroups && (
          <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Memuat grup
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {success}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-xs font-bold text-slate-600">
            Grup Stok
            <select
              value={groupId}
              onChange={(event) => {
                setGroupId(event.target.value);
                setPreview(null);
              }}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Pilih grup stok</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.displayName} ({group.variantCount} varian)
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            {(["ADJUSTMENT", "OUT"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setType(mode);
                  setPreview(null);
                }}
                className={`h-10 rounded-xl text-sm font-black ${
                  type === mode ? "bg-slate-900 text-white" : "bg-white text-slate-600"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <label className="block text-xs font-bold text-slate-600">
            Basis Input
            <select
              value={basis === "BASE" ? "BASE" : variantProductId}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "BASE") {
                  setBasis("BASE");
                } else {
                  setBasis("VARIANT");
                  setVariantProductId(value);
                }
                setPreview(null);
              }}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              disabled={!detail}
            >
              <option value="BASE">Stok dasar ({detail?.baseUnit ?? "base"})</option>
              {detail?.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name} ({variant.unit})
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-bold text-slate-600">
            {type === "OUT" ? "Jumlah dikurangi" : "Stok akhir baru"}
            <input
              type="number"
              min="0"
              step="0.01"
              value={inputValue}
              onChange={(event) => {
                setInputValue(event.target.value);
                setPreview(null);
              }}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-right text-sm font-bold"
            />
          </label>

          <label className="block text-xs font-bold text-slate-600">
            Catatan
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Catatan request approval"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={runPreview}
              disabled={!canPreview || isLoadingDetail}
            >
              Preview
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={!canPreview || isSubmitting}
              className="bg-slate-900 text-white hover:bg-slate-800"
              icon={<Send className="h-4 w-4" />}
            >
              Ajukan
            </Button>
          </div>
        </div>

        <div className="min-h-80 rounded-xl border border-slate-200 bg-white">
          {isLoadingDetail ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Memuat detail grup...
            </div>
          ) : !detail ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Pilih grup stok untuk melihat varian dan preview perubahan.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-black uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-3">Varian</th>
                    <th className="px-3 py-3 text-right">Konversi</th>
                    <th className="px-3 py-3 text-right">Sebelum</th>
                    <th className="px-3 py-3 text-right">Sesudah</th>
                    <th className="px-3 py-3 text-right">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.variants.map((variant) => {
                    const next = preview?.variants.find((row) => row.id === variant.id);
                    const before = next?.beforeStock ?? variant.stock;
                    const after = next?.afterStock ?? variant.stock;
                    const delta = next?.delta ?? 0;
                    return (
                      <tr key={variant.id} className="border-b border-slate-100">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                              <img
                                src={variant.imageUrl || getDefaultProductImage(variant.category?.name)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-bold text-slate-900">{variant.name}</p>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                {variant.sku} - {variant.unit}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-600">
                          1 {variant.unit} = {formatQty(variant.unitMultiplierToBase)} {detail.baseUnit}
                        </td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums">
                          {formatQty(before)}
                        </td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums">
                          {formatQty(after)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-black tabular-nums ${
                            delta < 0 ? "text-rose-600" : delta > 0 ? "text-emerald-600" : "text-slate-400"
                          }`}
                        >
                          {delta > 0 ? "+" : ""}
                          {formatQty(delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {preview && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                  Base stock: {formatQty(preview.beforeBaseStock)} {"->"} {formatQty(preview.afterBaseStock)} {preview.baseUnit}
                  . {preview.changedVariants.length} varian berubah.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

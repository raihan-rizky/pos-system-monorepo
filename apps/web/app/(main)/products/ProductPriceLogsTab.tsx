"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  History,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  ProductPriceLogField,
  ProductPriceLogSource,
  useProductPriceLogs,
} from "@/hooks/useProductPriceLogs";
import type { Product } from "@/hooks/useProducts";

const fmt = (value: string | null) => {
  if (value === null) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
};

const dateFmt = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

const fieldLabels: Record<ProductPriceLogField, string> = {
  PRICE: "Harga Jual",
  COST_PRICE: "HPP",
};

const sourceLabels: Record<ProductPriceLogSource, string> = {
  MANUAL: "Manual",
  IMPORT: "Import",
  API: "API",
  SYSTEM: "Sistem",
};

export default function ProductPriceLogsTab({
  products,
  selectedProductId,
  onSelectedProductChange,
}: {
  products: Product[];
  selectedProductId: string;
  onSelectedProductChange: (productId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [field, setField] = useState<ProductPriceLogField | "">("");
  const [source, setSource] = useState<ProductPriceLogSource | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [productSearch, setProductSearch] = useState("");

  useEffect(() => {
    setPage(1);
  }, [selectedProductId, field, source, from, to]);

  const priceLogsQuery = useProductPriceLogs({
    page,
    limit: 50,
    productId: selectedProductId || undefined,
    field,
    source,
    from,
    to,
  });
  const logs = priceLogsQuery.data?.data ?? [];
  const pagination = priceLogsQuery.data?.pagination;

  const productOptions = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products
      .filter((product) => {
        if (!q) return true;
        return (
          product.name.toLowerCase().includes(q) ||
          product.sku.toLowerCase().includes(q)
        );
      })
      .slice(0, 80);
  }, [products, productSearch]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_0.75fr_0.75fr_0.7fr_0.7fr_auto]">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Produk
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Cari produk atau SKU..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
              />
            </div>
            <select
              value={selectedProductId}
              onChange={(event) => onSelectedProductChange(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400"
            >
              <option value="">Semua produk</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - {product.sku}
                </option>
              ))}
            </select>
          </div>

          <FilterSelect
            label="Field"
            value={field}
            onChange={(value) => setField(value as ProductPriceLogField | "")}
            options={[
              ["", "Semua field"],
              ["PRICE", "Harga Jual"],
              ["COST_PRICE", "HPP"],
            ]}
          />
          <FilterSelect
            label="Sumber"
            value={source}
            onChange={(value) => setSource(value as ProductPriceLogSource | "")}
            options={[
              ["", "Semua sumber"],
              ["MANUAL", "Manual"],
              ["IMPORT", "Import"],
              ["API", "API"],
              ["SYSTEM", "Sistem"],
            ]}
          />
          <DateInput label="Dari" value={from} onChange={setFrom} />
          <DateInput label="Sampai" value={to} onChange={setTo} />
          <button
            type="button"
            onClick={() => {
              setProductSearch("");
              onSelectedProductChange("");
              setField("");
              setSource("");
              setFrom("");
              setTo("");
            }}
            className="self-end rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {priceLogsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold">Memuat riwayat harga...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
            <History className="mb-3 h-10 w-10" />
            <p className="text-sm font-bold text-slate-600">
              Belum ada perubahan harga
            </p>
            <p className="mt-1 text-xs">
              Riwayat akan muncul saat harga jual atau HPP berubah.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <Th>Produk</Th>
                  <Th>Field</Th>
                  <Th className="text-right">Sebelum</Th>
                  <Th className="text-right">Sesudah</Th>
                  <Th>Oleh</Th>
                  <Th>Sumber</Th>
                  <Th>Catatan</Th>
                  <Th>Waktu</Th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const oldNumber =
                    log.oldValue === null ? null : Number(log.oldValue);
                  const newNumber =
                    log.newValue === null ? null : Number(log.newValue);
                  const isUp =
                    oldNumber !== null &&
                    newNumber !== null &&
                    newNumber > oldNumber;
                  const isDown =
                    oldNumber !== null &&
                    newNumber !== null &&
                    newNumber < oldNumber;

                  return (
                    <tr key={log.id} className="border-b border-slate-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-black text-slate-900">
                          {log.product.name}
                        </p>
                        <p className="text-xs font-semibold text-slate-400">
                          {log.product.sku}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">
                        {fieldLabels[log.field]}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-slate-500">
                        {fmt(log.oldValue)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-flex items-center gap-1 text-sm font-black tabular-nums ${
                            isUp
                              ? "text-red-600"
                              : isDown
                                ? "text-emerald-600"
                                : "text-slate-900"
                          }`}
                        >
                          {isUp && <TrendingUp className="h-4 w-4" />}
                          {isDown && <TrendingDown className="h-4 w-4" />}
                          {fmt(log.newValue)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-600">
                        {log.changedByName || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
                          {sourceLabels[log.source]}
                        </span>
                      </td>
                      <td className="max-w-[220px] px-4 py-3 text-sm text-slate-500">
                        <span className="line-clamp-2">{log.note || "-"}</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-500">
                        {dateFmt.format(new Date(log.createdAt))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-xs font-bold text-slate-500">
              Halaman {pagination.page} dari {Math.max(1, pagination.totalPages)}
            </p>
            <div className="flex items-center gap-2">
              <PagerButton
                disabled={!pagination.hasPreviousPage}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                label="Sebelumnya"
                icon={<ChevronLeft className="h-4 w-4" />}
              />
              <PagerButton
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
                label="Berikutnya"
                icon={<ChevronRight className="h-4 w-4" />}
                iconAfter
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400"
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue || "all"} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400 ${className}`}
    >
      {children}
    </th>
  );
}

function PagerButton({
  disabled,
  onClick,
  label,
  icon,
  iconAfter = false,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  iconAfter?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {!iconAfter && icon}
      {label}
      {iconAfter && icon}
    </button>
  );
}

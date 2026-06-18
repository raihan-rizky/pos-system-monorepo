"use client";

import React, { useMemo } from "react";
import { previewSuratJalanStockImpact } from "../helpers/surat-jalan-core";
import type { SuratJalanRemainingItem } from "../types/surat-jalan";

interface SuratJalanQuantityTableProps {
  items: SuratJalanRemainingItem[];
  quantities: Record<string, number>;
  keterangan: Record<string, string>;
  isFirstSuratJalan: boolean;
  stockManagedBySuratJalan: boolean;
  onQuantityChange: (transactionItemId: string, quantity: number) => void;
  onKeteranganChange: (transactionItemId: string, value: string) => void;
}

export const SuratJalanQuantityTable: React.FC<SuratJalanQuantityTableProps> = ({
  items,
  quantities,
  keterangan,
  isFirstSuratJalan,
  stockManagedBySuratJalan,
  onQuantityChange,
  onKeteranganChange,
}) => {
  const impactByItemId = useMemo(() => {
    const impacts = previewSuratJalanStockImpact({
      items: items.map((item) => ({
        id: item.transactionItemId,
        productId: item.productId,
        printingServiceId: null,
        productName: item.productName,
        quantity: item.invoiceQuantity,
        unit: item.unit,
        currentStock: item.currentStock,
      })),
      quantities,
      // When first SJ: API restores invoice qty to stock BEFORE deducting delivery qty
      // so effective stock = currentStock + (stockManagedBySuratJalan ? 0 : invoiceQty)
      addInvoiceQtyToFirstSj:
        isFirstSuratJalan && !stockManagedBySuratJalan ? true : undefined,
    });
    return new Map(impacts.map((impact) => [impact.transactionItemId, impact]));
  }, [items, quantities, isFirstSuratJalan, stockManagedBySuratJalan]);

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-200">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-surface-50 text-xs font-bold uppercase tracking-wide text-surface-500">
          <tr>
            <th className="px-3 py-3 text-left">Nama Barang</th>
            <th className="px-3 py-3 text-right">Sisa</th>
            <th className="px-3 py-3 text-right">Stok Saat Ini</th>
            <th className="px-3 py-3 text-right">Dikirim</th>
            <th className="px-3 py-3 text-right">Stok Setelah</th>
            <th className="px-3 py-3 text-left">Keterangan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100 bg-white">
          {items.map((item) => {
            const isCompleted = item.remainingQuantity <= 0;
            const impact = impactByItemId.get(item.transactionItemId);
            const invalid = !isCompleted && (impact?.isInsufficientStock || quantities[item.transactionItemId] > item.remainingQuantity);
            return (
              <tr key={item.transactionItemId} className={isCompleted ? "bg-surface-50/70" : "hover:bg-surface-50/50 transition-colors"}>
                <td className="px-3 py-3 font-semibold text-surface-900">
                  {item.productName}
                  <div className="text-xs font-medium text-surface-500">{item.unit || "-"}</div>
                </td>
                <td className="px-3 py-3 text-right font-semibold">
                  {isCompleted ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      {item.invoiceQuantity}/{item.invoiceQuantity}
                    </span>
                  ) : (
                    <>
                      {item.remainingQuantity}/{item.invoiceQuantity}
                    </>
                  )}
                </td>
                <td className="px-3 py-3 text-right">{item.currentStock ?? "-"}</td>
                <td className="px-3 py-3 text-right">
                  {isCompleted ? (
                    <div className="flex h-11 items-center justify-end text-sm font-bold text-surface-400">
                      Selesai
                    </div>
                  ) : (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={item.remainingQuantity}
                        value={quantities[item.transactionItemId] ?? 0}
                        onChange={(event) => onQuantityChange(item.transactionItemId, Number(event.target.value))}
                        className={`h-11 w-24 rounded-lg border px-3 text-right text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${
                          invalid ? "border-red-300 bg-red-50 text-red-700" : "border-surface-200"
                        }`}
                      />
                      {invalid && (
                        <div className="mt-1 text-xs font-medium text-red-600">
                          Melebihi sisa/stok.
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td className={`px-3 py-3 text-right font-bold ${impact?.isInsufficientStock && !isCompleted ? "text-red-600" : "text-surface-900"}`}>
                  {isCompleted ? "-" : (impact?.afterStock ?? "-")}
                </td>
                <td className="px-3 py-3">
                  <input
                    type="text"
                    value={keterangan[item.transactionItemId] ?? ""}
                    onChange={(event) => onKeteranganChange(item.transactionItemId, event.target.value)}
                    className="h-11 w-full min-w-48 rounded-lg border border-surface-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-surface-100/50 disabled:text-surface-400"
                    placeholder={isCompleted ? "-" : "Opsional"}
                    disabled={isCompleted}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

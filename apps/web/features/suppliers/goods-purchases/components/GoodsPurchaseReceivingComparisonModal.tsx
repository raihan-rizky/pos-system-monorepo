"use client";

import React from "react";
import { Loader2, PackageCheck } from "lucide-react";
import { Button, Modal } from "@pos/ui";
import { fetchGoodsPurchaseReceivingComparison } from "@/features/inventory-management/api/inventory-management-api";
import type { GoodsPurchaseReceivingComparison } from "@/features/inventory-management/types/inventory-management";

export function GoodsPurchaseReceivingComparisonContent({
  comparison,
}: {
  comparison: GoodsPurchaseReceivingComparison;
}) {
  const itemById = new Map(
    comparison.items.map((item) => [item.goodsPurchaseItemId, item]),
  );
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
        <PackageCheck className="h-5 w-5 shrink-0 text-sky-700" />
        <div>
          <p className="font-black text-sky-950">
            {comparison.supplierName}
          </p>
          <p className="text-sm font-semibold text-sky-800">
            {comparison.goodsPurchaseNumber}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Produk</th>
              <th className="px-3 py-2 text-right">Dipesan</th>
              <th className="px-3 py-2 text-right">Diterima</th>
              <th className="px-3 py-2 text-right">Pending</th>
              <th className="px-3 py-2 text-right">Sisa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {comparison.items.map((item) => (
              <tr key={item.goodsPurchaseItemId}>
                <td className="px-3 py-2">
                  <p className="font-bold text-slate-900">
                    {item.productName}
                  </p>
                  <p className="text-xs text-slate-400">{item.sku}</p>
                </td>
                {[
                  item.orderedQuantity,
                  item.approvedReceivedQuantity,
                  item.pendingReservedQuantity,
                  item.remainingQuantity,
                ].map((quantity, index) => (
                  <td
                    key={index}
                    className="px-3 py-2 text-right tabular-nums"
                  >
                    {quantity.toLocaleString("id-ID")} {item.unit ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-black text-slate-900">
          Riwayat per Penerimaan Barang
        </h3>
        {comparison.receipts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            Belum ada Penerimaan Barang.
          </p>
        ) : (
          comparison.receipts.map((receipt) => (
            <div
              key={receipt.id}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-700">
                  {new Date(receipt.createdAt).toLocaleString("id-ID")}
                </p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-700">
                  {receipt.status}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {receipt.lines.map((line) => {
                  const item = itemById.get(line.goodsPurchaseItemId);
                  return (
                    <div
                      key={`${receipt.id}:${line.goodsPurchaseItemId}`}
                      className="flex flex-wrap justify-between gap-2 text-xs text-slate-600"
                    >
                      <span className="font-bold">
                        {item?.productName ?? "Produk"}
                      </span>
                      <span>
                        {line.receivedQuantity.toLocaleString("id-ID")}{" "}
                        {item?.unit ?? ""}
                      </span>
                      <span>
                        {line.matchStatus === "MATCHED"
                          ? "Sesuai"
                          : "Tidak Sesuai"}
                      </span>
                      {line.note && (
                        <span className="w-full text-slate-500">
                          {line.note}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

export function GoodsPurchaseReceivingComparisonModal({
  purchaseId,
  onClose,
}: {
  purchaseId: string | null;
  onClose: () => void;
}) {
  const [data, setData] =
    React.useState<GoodsPurchaseReceivingComparison | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!purchaseId) {
      setData(null);
      setError(null);
      return;
    }
    let active = true;
    void fetchGoodsPurchaseReceivingComparison(purchaseId)
      .then((comparison) => {
        if (active) setData(comparison);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Gagal memuat perbandingan Penerimaan Barang.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [purchaseId]);

  return (
    <Modal
      open={Boolean(purchaseId)}
      onClose={onClose}
      title="Perbandingan Pembelian dan Penerimaan"
      size="3xl"
    >
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          {error}
        </div>
      ) : !data ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <GoodsPurchaseReceivingComparisonContent comparison={data} />
      )}
      <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </Modal>
  );
}

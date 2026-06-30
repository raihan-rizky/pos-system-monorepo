"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Button } from "@pos/ui";
import { AlertCircle } from "lucide-react";
import { createInboundReceipt, fetchReceivingQueue } from "../api/inventory-management-api";
import type { InventorySummary, ReceivingQueueResult } from "../types/inventory-management";

interface InboundReceiptModalProps {
  open: boolean;
  onClose: () => void;
  initialSummary: InventorySummary;
  onSuccess: (message: string) => void;
  receivingQueue?: ReceivingQueueResult;
}

const LINE_STATUSES = [
  ["RECEIVED", "Diterima"],
  ["PARTIAL", "Sebagian"],
  ["MISSING", "Tidak Ada"],
  ["DAMAGED", "Rusak"],
  ["MISMATCH", "Tidak Cocok"],
  ["OVER_RECEIVED", "Lebih"],
] as const;

export function InboundReceiptModal({
  open,
  onClose,
  initialSummary,
  onSuccess,
  receivingQueue,
}: InboundReceiptModalProps) {
  const [loadedReceivingQueue, setLoadedReceivingQueue] =
    useState<ReceivingQueueResult | null>(null);
  const loadedOnceRef = useRef(false);
  const queueItems = (receivingQueue ?? loadedReceivingQueue)?.items ?? [];
  const shoppingRequests = useMemo(() => {
    const requestIds = Array.from(new Set(queueItems.map((item) => item.shoppingRequestId)));
    return requestIds.map((id) => {
      const requestItems = queueItems.filter((item) => item.shoppingRequestId === id);
      const firstItem = requestItems[0];
      const activeReceiptStatuses = Array.from(
        new Set(requestItems.flatMap((item) => item.activeReceiptStatuses ?? [])),
      );

      return {
        id,
        number: firstItem?.shoppingRequestNumber ?? id,
        supplierName: firstItem?.supplierName ?? null,
        hasActiveReceipt: requestItems.some((item) => item.hasActiveReceipt),
        activeReceiptStatuses,
        isFullyReceived:
          requestItems.length > 0 && requestItems.every((item) => item.isFullyReceived),
        remainingQuantity: requestItems.reduce(
          (total, item) => total + item.remainingQuantity,
          0,
        ),
      };
    });
  }, [queueItems]);
  const firstSelectableRequestId =
    shoppingRequests.find((request) => !request.isFullyReceived)?.id ??
    shoppingRequests[0]?.id ??
    "";
  const [shoppingRequestId, setShoppingRequestId] = useState(firstSelectableRequestId);

  if (open && !receivingQueue && !loadedOnceRef.current) {
    loadedOnceRef.current = true;
    void fetchReceivingQueue({ take: 100 })
      .then((queue) => setLoadedReceivingQueue(queue as ReceivingQueueResult))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Gagal memuat invoice Daftar Belanja"),
      );
  }

  useEffect(() => {
    if (!shoppingRequestId && firstSelectableRequestId) {
      setShoppingRequestId(firstSelectableRequestId);
    }
  }, [firstSelectableRequestId, shoppingRequestId]);

  const [lineInputs, setLineInputs] = useState<
    Record<
      string,
      {
        expectedQuantity: string;
        receivedQuantity: string;
        status: string;
        note: string;
      }
    >
  >({});
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLines = queueItems.filter(
    (item) => item.shoppingRequestId === shoppingRequestId && !item.isFullyReceived,
  );

  const updateLine = (itemId: string, key: keyof typeof lineInputs[string], value: string) => {
    setLineInputs((current) => ({
      ...current,
      [itemId]: {
        expectedQuantity: current[itemId]?.expectedQuantity ?? "",
        receivedQuantity: current[itemId]?.receivedQuantity ?? "",
        status: current[itemId]?.status ?? "RECEIVED",
        note: current[itemId]?.note ?? "",
        [key]: value,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shoppingRequestId) {
      setError("Invoice Daftar Belanja wajib dipilih.");
      return;
    }
    if (selectedLines.length === 0) {
      setError("Invoice Daftar Belanja tidak memiliki produk untuk diterima.");
      return;
    }

    const lines = selectedLines.map((item) => {
      const input = lineInputs[item.itemId];
      return {
        productId: item.productId,
        shoppingRequestItemId: item.itemId,
        expectedQuantity: Number(input?.expectedQuantity || item.remainingQuantity),
        receivedQuantity: Number(input?.receivedQuantity || 0),
        status: (input?.status || "RECEIVED") as any,
        note: input?.note || null,
      };
    });

    if (lines.some((line) => line.expectedQuantity <= 0 || line.receivedQuantity < 0)) {
      setError("Qty ekspektasi dan qty diterima wajib valid untuk setiap produk.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createInboundReceipt({
        shoppingRequestId,
        submitImmediately: true,
        note: note || null,
        lines,
      });
      onSuccess("Penerimaan barang berhasil diajukan ke owner.");
      setShoppingRequestId("");
      setLineInputs({});
      setNote("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim data");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Daftar Penerimaan Barang" size="3xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-medium text-xs text-slate-500">
            Pilih invoice Daftar Belanja, lalu isi qty ekspektasi dan qty diterima untuk setiap produk.
          </p>
          <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-black text-sky-700">
            {initialSummary.counts.submittedInboundReceipts} menunggu owner
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">
            Pilih Invoice Daftar Belanja
          </label>
          <input type="hidden" name="inboundShoppingRequestId" value={shoppingRequestId} />
          <div className="grid gap-2">
            {shoppingRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Belum ada invoice Daftar Belanja yang bisa dipilih.
              </div>
            ) : (
              shoppingRequests.map((request) => {
                const isSelected = shoppingRequestId === request.id;
                return (
                  <button
                    key={request.id}
                    type="button"
                    disabled={request.isFullyReceived}
                    onClick={() => setShoppingRequestId(request.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm transition ${
                      isSelected
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    } ${request.isFullyReceived ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-black text-slate-900">
                        {request.number}
                        {request.supplierName ? ` - ${request.supplierName}` : ""}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Sisa diterima: {request.remainingQuantity.toLocaleString("id-ID")}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {request.hasActiveReceipt && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">
                          Sudah dibuat
                        </span>
                      )}
                      {request.isFullyReceived && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-800">
                          Sudah lengkap
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-3">
          {selectedLines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Pilih invoice untuk melihat daftar produk.
            </div>
          ) : (
            selectedLines.map((item) => {
              const input = lineInputs[item.itemId];
              return (
                <div key={item.itemId} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-slate-900">{item.productName}</p>
                      <p className="text-xs text-slate-500">
                        Sisa: {item.remainingQuantity} {item.unit ?? ""} - approved {item.approvedReceivedQuantity} - reserved {item.submittedReservedQuantity}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-600">Qty Ekspektasi</label>
                      <input
                        name={`inboundLines.${item.itemId}.expectedQuantity`}
                        type="number"
                        min={1}
                        value={input?.expectedQuantity ?? String(item.remainingQuantity)}
                        onChange={(e) => updateLine(item.itemId, "expectedQuantity", e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition-colors focus:border-slate-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-600">Qty Diterima</label>
                      <input
                        name={`inboundLines.${item.itemId}.receivedQuantity`}
                        type="number"
                        min={0}
                        value={input?.receivedQuantity ?? ""}
                        onChange={(e) => updateLine(item.itemId, "receivedQuantity", e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition-colors focus:border-slate-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-600">Status Line</label>
                      <select
                        name={`inboundLines.${item.itemId}.status`}
                        value={input?.status ?? "RECEIVED"}
                        onChange={(e) => updateLine(item.itemId, "status", e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-slate-400"
                      >
                        {LINE_STATUSES.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-600">Catatan</label>
                      <input
                        name={`inboundLines.${item.itemId}.note`}
                        value={input?.note ?? ""}
                        onChange={(e) => updateLine(item.itemId, "note", e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition-colors focus:border-slate-400"
                        placeholder="Wajib untuk issue"
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">
            Catatan Receipt
          </label>
          <textarea
            name="inboundNote"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-slate-400"
            placeholder="Catatan umum penerimaan..."
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="w-28 cursor-pointer"
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button
            type="submit"
            className="w-48 cursor-pointer bg-slate-900 text-white hover:bg-slate-800"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Memproses..." : "Ajukan ke Owner"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

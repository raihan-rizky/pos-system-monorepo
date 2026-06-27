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
  const [loadedReceivingQueue, setLoadedReceivingQueue] = useState<ReceivingQueueResult | null>(null);
  const loadedOnceRef = useRef(false);
  const queueItems = (receivingQueue ?? loadedReceivingQueue)?.items ?? [];
  const shoppingRequests = useMemo(
    () =>
      Array.from(
        new Map(
          queueItems.map((item) => [
            item.shoppingRequestId,
            {
              id: item.shoppingRequestId,
              number: item.shoppingRequestNumber,
              supplierName: item.supplierName,
            },
          ]),
        ).values(),
      ),
    [queueItems],
  );
  const [shoppingRequestId, setShoppingRequestId] = useState(
    shoppingRequests[0]?.id ?? "",
  );

  if (open && !receivingQueue && !loadedOnceRef.current) {
    loadedOnceRef.current = true;
    void fetchReceivingQueue({ take: 100 })
      .then((queue) => setLoadedReceivingQueue(queue as ReceivingQueueResult))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Gagal memuat invoice Daftar Belanja"),
      );
  }

  useEffect(() => {
    if (!shoppingRequestId && shoppingRequests[0]?.id) {
      setShoppingRequestId(shoppingRequests[0].id);
    }
  }, [shoppingRequestId, shoppingRequests]);

  const [lineInputs, setLineInputs] = useState<Record<string, {
    expectedQuantity: string;
    receivedQuantity: string;
    status: string;
    note: string;
  }>>({});
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLines = queueItems.filter(
    (item) => item.shoppingRequestId === shoppingRequestId,
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
        note: note || null,
        lines,
      });
      onSuccess("Draft penerimaan barang berhasil dibuat.");
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
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-slate-700 flex justify-between items-center">
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
          <label className="block text-xs font-bold text-slate-600 mb-1">
            Pilih Invoice Daftar Belanja
          </label>
          <select
            name="inboundShoppingRequestId"
            value={shoppingRequestId}
            onChange={(e) => setShoppingRequestId(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 bg-white transition-colors"
            required
          >
            <option value="">Pilih invoice...</option>
            {shoppingRequests.map((request) => (
              <option key={request.id} value={request.id}>
                {request.number}{request.supplierName ? ` — ${request.supplierName}` : ""}
              </option>
            ))}
          </select>
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
                        Sisa: {item.remainingQuantity} {item.unit ?? ""} · approved {item.approvedReceivedQuantity} · reserved {item.submittedReservedQuantity}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Qty Ekspektasi</label>
                      <input
                        name={`inboundLines.${item.itemId}.expectedQuantity`}
                        type="number"
                        min={1}
                        value={input?.expectedQuantity ?? String(item.remainingQuantity)}
                        onChange={(e) => updateLine(item.itemId, "expectedQuantity", e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Qty Diterima</label>
                      <input
                        name={`inboundLines.${item.itemId}.receivedQuantity`}
                        type="number"
                        min={0}
                        value={input?.receivedQuantity ?? ""}
                        onChange={(e) => updateLine(item.itemId, "receivedQuantity", e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Status Line</label>
                      <select
                        name={`inboundLines.${item.itemId}.status`}
                        value={input?.status ?? "RECEIVED"}
                        onChange={(e) => updateLine(item.itemId, "status", e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 bg-white transition-colors"
                      >
                        {LINE_STATUSES.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Catatan</label>
                      <input
                        name={`inboundLines.${item.itemId}.note`}
                        value={input?.note ?? ""}
                        onChange={(e) => updateLine(item.itemId, "note", e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 transition-colors"
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
          <label className="block text-xs font-bold text-slate-600 mb-1">
            Catatan Receipt
          </label>
          <textarea
            name="inboundNote"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 transition-colors"
            placeholder="Catatan umum penerimaan..."
          />
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
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
            className="w-48 bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Memproses..." : "Buat Draft Penerimaan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

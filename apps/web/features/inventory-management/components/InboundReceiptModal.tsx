"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@pos/ui";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  createInboundReceipt,
  fetchReceivingQueue,
} from "../api/inventory-management-api";
import {
  requiresInboundQuantityNote,
  type InboundReceiptMatchStatus,
} from "../helpers/inbound-receipt-rules";
import type {
  ReceivingQueuePurchase,
  ReceivingQueuePurchaseItem,
  ReceivingQueueResult,
} from "../types/inventory-management";

export interface InboundReceiptModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  initialGoodsPurchaseId?: string | null;
  supplierId?: string | null;
}

type LineInput = {
  matchStatus: InboundReceiptMatchStatus;
  receivedQuantity: string;
  supplierCostPrice: string;
  note: string;
};

const EMPTY_LINE_INPUT: LineInput = {
  matchStatus: "MATCHED",
  receivedQuantity: "",
  supplierCostPrice: "",
  note: "",
};

function hasAvailableItem(purchase: ReceivingQueuePurchase): boolean {
  return purchase.items.some((item) => item.availableQuantity > 1e-9);
}

export function resolveInboundGoodsPurchaseSelection(input: {
  purchases: ReceivingQueuePurchase[];
  currentGoodsPurchaseId: string;
  initialGoodsPurchaseId?: string | null;
}): string {
  const selectablePurchases = input.purchases.filter(hasAvailableItem);
  const initialId = input.initialGoodsPurchaseId?.trim();
  if (
    initialId &&
    selectablePurchases.some((purchase) => purchase.id === initialId)
  ) {
    return initialId;
  }
  if (
    input.currentGoodsPurchaseId &&
    selectablePurchases.some(
      (purchase) => purchase.id === input.currentGoodsPurchaseId,
    )
  ) {
    return input.currentGoodsPurchaseId;
  }
  return selectablePurchases[0]?.id ?? "";
}

export function isInboundReceiptLineValid(input: {
  availableQuantity: number;
  line: LineInput;
}): boolean {
  const rawQuantity = input.line.receivedQuantity.trim();
  if (!rawQuantity) return false;

  const receivedQuantity = Number(rawQuantity);
  if (
    !Number.isFinite(receivedQuantity) ||
    receivedQuantity < 0 ||
    receivedQuantity > input.availableQuantity + 1e-9
  ) {
    return false;
  }

  return !(
    requiresInboundQuantityNote(
      input.availableQuantity,
      receivedQuantity,
    ) && !input.line.note.trim()
  );
}

export function getInboundReceiptLineInput(input: {
  lineInputs: Record<string, LineInput>;
  itemId: string;
  currentCostPrice: number | null;
}): LineInput {
  return (
    input.lineInputs[input.itemId] ?? {
      ...EMPTY_LINE_INPUT,
      supplierCostPrice:
        input.currentCostPrice === null
          ? ""
          : String(input.currentCostPrice),
    }
  );
}

export function isInboundReceiptCostValid(input: {
  receivedQuantity: string;
  supplierCostPrice: string;
}): boolean {
  const quantity = Number(input.receivedQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return true;
  if (!input.supplierCostPrice.trim()) return false;
  const cost = Number(input.supplierCostPrice);
  return Number.isFinite(cost) && cost >= 0 && cost <= 9_999_999_999.99;
}

function formatQuantity(value: number): string {
  return value.toLocaleString("id-ID", {
    maximumFractionDigits: 4,
  });
}

export function InboundReceiptModal({
  open,
  onClose,
  onSuccess,
  initialGoodsPurchaseId,
  supplierId,
}: InboundReceiptModalProps) {
  const [receivingQueue, setReceivingQueue] =
    useState<ReceivingQueueResult | null>(null);
  const [goodsPurchaseId, setGoodsPurchaseId] = useState(
    initialGoodsPurchaseId ?? "",
  );
  const [lineInputs, setLineInputs] = useState<Record<string, LineInput>>({});
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      loadedKeyRef.current = null;
      return;
    }

    const loadKey = `${initialGoodsPurchaseId?.trim() ?? ""}:${supplierId?.trim() ?? ""}`;
    if (loadedKeyRef.current === loadKey) return;
    loadedKeyRef.current = loadKey;
    let active = true;

    setIsLoading(true);
    setError(null);
    void fetchReceivingQueue({ take: 100, supplierId: supplierId ?? undefined })
      .then((queue) => {
        if (!active) return;
        setReceivingQueue(queue);
        setGoodsPurchaseId((currentId) =>
          resolveInboundGoodsPurchaseSelection({
            purchases: queue.purchases,
            currentGoodsPurchaseId: currentId,
            initialGoodsPurchaseId,
          }),
        );
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Gagal memuat antrean Pembelian Barang.",
        );
        setIsLoading(false);
      });

    return () => {
      active = false;
      if (loadedKeyRef.current === loadKey) {
        loadedKeyRef.current = null;
      }
    };
  }, [initialGoodsPurchaseId, open, supplierId]);

  const purchases = receivingQueue?.purchases.filter(hasAvailableItem) ?? [];
  const selectedPurchase =
    purchases.find((purchase) => purchase.id === goodsPurchaseId) ?? null;
  const visibleItems =
    selectedPurchase?.items.filter((item) => item.availableQuantity > 1e-9) ??
    [];
  const allLinesValid =
    visibleItems.length > 0 &&
    visibleItems.every((item) => {
      const line = getInboundReceiptLineInput({
        lineInputs,
        itemId: item.goodsPurchaseItemId,
        currentCostPrice: item.currentCostPrice,
      });
      return (
        isInboundReceiptLineValid({
          availableQuantity: item.availableQuantity,
          line,
        }) && isInboundReceiptCostValid(line)
      );
    });
  const canSubmit =
    Boolean(selectedPurchase) &&
    allLinesValid &&
    !isLoading &&
    !isSubmitting;

  const updateLine = (
    itemId: string,
    currentCostPrice: number | null,
    patch: Partial<LineInput>,
  ) => {
    setLineInputs((current) => ({
      ...current,
      [itemId]: {
        ...getInboundReceiptLineInput({
          lineInputs: current,
          itemId,
          currentCostPrice,
        }),
        ...patch,
      },
    }));
    setError(null);
  };

  const selectPurchase = (purchaseId: string) => {
    setGoodsPurchaseId(purchaseId);
    setLineInputs({});
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPurchase) {
      setError("Pembelian Barang wajib dipilih.");
      return;
    }
    if (visibleItems.length === 0) {
      setError("Pembelian Barang ini tidak memiliki produk yang bisa diterima.");
      return;
    }
    if (!allLinesValid) {
      setError(
        "Lengkapi jumlah dan harga modal supplier. Catatan wajib diisi jika jumlahnya berbeda dari jumlah tersedia.",
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await createInboundReceipt({
        goodsPurchaseId: selectedPurchase.id,
        note: note.trim() || null,
        lines: visibleItems.map((item) => {
          const input = getInboundReceiptLineInput({
            lineInputs,
            itemId: item.goodsPurchaseItemId,
            currentCostPrice: item.currentCostPrice,
          });
          return {
            goodsPurchaseItemId: item.goodsPurchaseItemId,
            matchStatus: input.matchStatus,
            receivedQuantity: Number(input.receivedQuantity),
            supplierCostPrice: Number(input.supplierCostPrice),
            note: input.note.trim() || null,
          };
        }),
      });
      onSuccess("Penerimaan barang berhasil diajukan ke owner.");
      setLineInputs({});
      setNote("");
      setReceivingQueue(null);
      setGoodsPurchaseId(initialGoodsPurchaseId ?? "");
      loadedKeyRef.current = null;
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal mengajukan Penerimaan Barang.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Daftar Penerimaan Barang"
      size="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-600">
            Pilih Pembelian Barang yang sudah disetujui, lalu catat jumlah
            barang yang benar-benar tiba.
          </p>
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

        <section>
          <label className="mb-1 block text-xs font-bold text-slate-600">
            Pilih Pembelian Barang
          </label>
          <input
            type="hidden"
            name="inboundGoodsPurchaseId"
            value={goodsPurchaseId}
          />

          {isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat Pembelian Barang...
            </div>
          ) : purchases.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Belum ada Pembelian Barang yang bisa diterima.
            </div>
          ) : (
            <div className="grid gap-2">
              {purchases.map((purchase) => {
                const isSelected = purchase.id === goodsPurchaseId;
                return (
                  <button
                    key={purchase.id}
                    type="button"
                    data-goods-purchase-id={purchase.id}
                    aria-pressed={isSelected}
                    onClick={() => selectPurchase(purchase.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                      isSelected
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="block font-black text-slate-900">
                      {purchase.number}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {purchase.supplierName} · {purchase.items.length} produk
                    </span>
                    {purchase.pendingReceiptCount > 0 && (
                      <span className="mt-2 block text-xs font-bold text-amber-700">
                        Ada {purchase.pendingReceiptCount} penerimaan menunggu
                        persetujuan
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3">
          {!isLoading && !selectedPurchase && purchases.length > 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Pilih Pembelian Barang untuk melihat produknya.
            </div>
          )}

          {visibleItems.map((item) => (
            <InboundReceiptLine
              key={item.goodsPurchaseItemId}
              item={item}
              input={getInboundReceiptLineInput({
                lineInputs,
                itemId: item.goodsPurchaseItemId,
                currentCostPrice: item.currentCostPrice,
              })}
              onChange={(patch) =>
                updateLine(
                  item.goodsPurchaseItemId,
                  item.currentCostPrice,
                  patch,
                )
              }
            />
          ))}
        </section>

        <label className="block text-xs font-bold text-slate-600">
          Catatan Penerimaan
          <textarea
            name="inboundNote"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-slate-400"
            placeholder="Catatan umum penerimaan (opsional)"
          />
        </label>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {isSubmitting ? "Memproses..." : "Ajukan ke Owner"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function InboundReceiptLine({
  item,
  input,
  onChange,
}: {
  item: ReceivingQueuePurchaseItem;
  input: LineInput;
  onChange: (patch: Partial<LineInput>) => void;
}) {
  const receivedQuantity = Number(input.receivedQuantity);
  const noteRequired =
    input.receivedQuantity.trim() !== "" &&
    Number.isFinite(receivedQuantity) &&
    requiresInboundQuantityNote(
      item.availableQuantity,
      receivedQuantity,
    );

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <p className="text-sm font-black text-slate-900">
          {item.productName}
        </p>
        <p className="text-xs text-slate-500">
          {item.sku} · {item.unit ?? "unit"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Dipesan {formatQuantity(item.orderedQuantity)} · Sudah diterima{" "}
          {formatQuantity(item.approvedReceivedQuantity)} · Menunggu{" "}
          {formatQuantity(item.pendingReservedQuantity)} · Tersedia{" "}
          {formatQuantity(item.availableQuantity)}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold text-slate-600">
          Kesesuaian
          <select
            name={`inboundLines.${item.goodsPurchaseItemId}.matchStatus`}
            value={input.matchStatus}
            onChange={(event) =>
              onChange({
                matchStatus: event.target
                  .value as InboundReceiptMatchStatus,
              })
            }
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
          >
            <option value="MATCHED">Sesuai</option>
            <option value="MISMATCHED">Tidak Sesuai</option>
          </select>
        </label>

        <label className="text-xs font-bold text-slate-600">
          Jumlah Diterima
          <input
            name={`inboundLines.${item.goodsPurchaseItemId}.receivedQuantity`}
            type="number"
            inputMode="decimal"
            min={0}
            max={item.availableQuantity}
            step="any"
            value={input.receivedQuantity}
            onChange={(event) =>
              onChange({ receivedQuantity: event.target.value })
            }
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
            placeholder={`Maks. ${formatQuantity(item.availableQuantity)}`}
          />
        </label>

        <label className="text-xs font-bold text-slate-600">
          Harga Modal Supplier
          <input
            name={`inboundLines.${item.goodsPurchaseItemId}.supplierCostPrice`}
            type="number"
            inputMode="decimal"
            min={0}
            max={9_999_999_999.99}
            step="0.01"
            value={input.supplierCostPrice}
            onChange={(event) =>
              onChange({ supplierCostPrice: event.target.value })
            }
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
            placeholder="Masukkan harga modal"
          />
        </label>

        <label className="text-xs font-bold text-slate-600">
          Catatan Produk
          <input
            name={`inboundLines.${item.goodsPurchaseItemId}.note`}
            value={input.note}
            required={noteRequired}
            onChange={(event) => onChange({ note: event.target.value })}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
            placeholder={
              noteRequired
                ? "Wajib: jelaskan selisih jumlah"
                : "Opsional jika jumlah sesuai"
            }
          />
        </label>
      </div>
    </article>
  );
}

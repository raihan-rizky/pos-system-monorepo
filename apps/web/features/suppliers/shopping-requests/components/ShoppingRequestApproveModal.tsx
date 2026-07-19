"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  LockKeyhole,
  XCircle,
} from "lucide-react";
import { Button, Modal } from "@pos/ui";

import { ProductStockThumbnail } from "@/features/inventory-management/components/ProductStockThumbnail";
import { formatRupiah } from "@/lib/utils";
import {
  useApproveShoppingRequest,
  useApproveShoppingRequestItem,
  useShoppingRequest,
} from "../hooks/useShoppingRequests";
import { previewShoppingRequestStock } from "../api/shopping-requests-api";
import type { ShoppingRequestStockPreview } from "../helpers/shopping-request-stock";
import type {
  ShoppingRequestDetail,
  ShoppingRequestItemDecisionStatus,
  ShoppingRequestStockMode,
} from "../types/shopping-request";
import { ShoppingRequestStockPreviewPanel } from "./ShoppingRequestStockPreview";

interface ApprovalRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  imageUrl: string | null;
  unit: string | null;
  requestedQty: number;
  approvedQty: number | null;
  stockMode: ShoppingRequestStockMode;
  hasStockGroup: boolean;
  costPrice: number | null;
  costPriceSnapshot: number | null;
  decisionStatus: ShoppingRequestItemDecisionStatus;
  decidedByName: string | null;
  decidedAt: string | null;
}

export function ShoppingRequestApproveModal({
  detail,
  open,
  onClose,
}: {
  detail: ShoppingRequestDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  const fullDetail = useShoppingRequest(open ? detail?.id ?? null : null);
  const approveAll = useApproveShoppingRequest();
  const approveItem = useApproveShoppingRequestItem();
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [preview, setPreview] = useState<ShoppingRequestStockPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!fullDetail.data) return;
    setRows(
      fullDetail.data.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        imageUrl: item.imageUrl,
        unit: item.unit,
        requestedQty: item.requestedQty,
        approvedQty: item.approvedQty,
        stockMode: item.stockMode,
        hasStockGroup: Boolean(item.product.stockGroup),
        costPrice:
          item.product.costPrice == null ? null : Number(item.product.costPrice),
        costPriceSnapshot:
          item.costPriceSnapshot == null ? null : Number(item.costPriceSnapshot),
        decisionStatus: item.decisionStatus,
        decidedByName: item.decidedByName,
        decidedAt: item.decidedAt,
      })),
    );
    setActionError(null);
  }, [fullDetail.data]);

  const pendingRows = useMemo(
    () => rows.filter((row) => row.decisionStatus === "PENDING"),
    [rows],
  );
  const preparedRows = useMemo(
    () => pendingRows.filter((row) => row.approvedQty !== null),
    [pendingRows],
  );
  const decidedCount = rows.length - pendingRows.length;
  const allPrepared =
    pendingRows.length > 0 &&
    pendingRows.every((row) => row.approvedQty !== null);

  useEffect(() => {
    if (!open || preparedRows.length === 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsPreviewing(true);
      previewShoppingRequestStock(
        preparedRows.map((row) => ({
          itemId: row.id,
          productId: row.productId,
          stockMode: row.stockMode,
          quantity: row.approvedQty ?? 0,
        })),
      )
        .then((data) => {
          if (!cancelled) {
            setPreview(data);
            setPreviewError(null);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setPreview(null);
            setPreviewError(
              error instanceof Error
                ? error.message
                : "Gagal membuat preview stok",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setIsPreviewing(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, preparedRows]);

  const expensePreview = useMemo(() => {
    const effectiveCostPrice = (row: ApprovalRow) =>
      row.decisionStatus === "PENDING"
        ? row.costPrice
        : row.costPriceSnapshot;
    const missing = rows.filter(
      (row) =>
        (row.approvedQty ?? 0) > 0 && effectiveCostPrice(row) === null,
    );
    const total = rows.reduce(
      (sum, row) =>
        sum + (row.approvedQty ?? 0) * (effectiveCostPrice(row) ?? 0),
      0,
    );
    return { missing, total };
  }, [rows]);

  const updateMode = (id: string, stockMode: ShoppingRequestStockMode) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, stockMode } : row)),
    );

  const confirmOverRequested = (targetRows: ApprovalRow[]) => {
    const over = targetRows.filter(
      (row) => (row.approvedQty ?? 0) > row.requestedQty,
    );
    return {
      hasOverage: over.length > 0,
      confirmed:
        over.length === 0 ||
        window.confirm(
          `${over.length} item melebihi Jumlah Kebutuhan. Tetap lanjutkan persetujuan?`,
        ),
    };
  };

  const handleApproveItem = async (row: ApprovalRow) => {
    if (!detail || row.approvedQty === null) return;
    const confirmation = confirmOverRequested([row]);
    if (!confirmation.confirmed) return;
    setActionError(null);
    setProcessingItemId(row.id);
    try {
      await approveItem.mutateAsync({
        id: detail.id,
        itemId: row.id,
        input: {
          stockMode: row.stockMode,
          confirmOverRequested: confirmation.hasOverage,
        },
      });
      await fullDetail.refetch();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Gagal menyetujui item",
      );
    } finally {
      setProcessingItemId(null);
    }
  };

  const handleApproveAll = async () => {
    if (!detail || !allPrepared) return;
    const confirmation = confirmOverRequested(pendingRows);
    if (!confirmation.confirmed) return;
    setActionError(null);
    try {
      await approveAll.mutateAsync({
        id: detail.id,
        input: {
          items: pendingRows.map((row) => ({
            id: row.id,
            stockMode: row.stockMode,
          })),
          confirmOverRequested: confirmation.hasOverage,
        },
      });
      await fullDetail.refetch();
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Gagal menyetujui permohonan",
      );
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Setujui Permohonan Belanja"
      size="4xl"
    >
      {fullDetail.isPending ? (
        <div className="p-8 text-center text-sm font-semibold text-slate-500">
          Memuat detail...
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">Belum ada item</div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-black text-slate-950">
                  {fullDetail.data?.supplierName ?? "Supplier tidak tersedia"}
                </p>
                <p className="text-xs font-semibold text-slate-500">
                  {decidedCount} dari {rows.length} item diproses
                </p>
              </div>
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">
                {pendingRows.length} item menunggu
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-cyan-500 transition-all"
                style={{
                  width: `${rows.length > 0 ? (decidedCount / rows.length) * 100 : 0}%`,
                }}
              />
            </div>
          </section>

          <div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">
            {rows.map((row) => {
              const pending = row.decisionStatus === "PENDING";
              const prepared = row.approvedQty !== null;
              const isOver = (row.approvedQty ?? 0) > row.requestedQty;
              return (
                <article
                  key={row.id}
                  className={`rounded-xl border p-3 shadow-sm ${
                    pending ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <ProductStockThumbnail
                      name={row.productName}
                      imageUrl={row.imageUrl}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black text-slate-950">
                        {row.productName}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {row.productSku} · Kebutuhan {row.requestedQty} {row.unit}
                      </p>
                    </div>
                    <DecisionBadge status={row.decisionStatus} />
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end">
                    <div>
                      <p className="text-xs font-bold text-slate-600">
                        Jumlah yang Di-ACC
                      </p>
                      <div
                        className={`mt-1 rounded-lg border px-3 py-2 text-right font-black ${
                          prepared
                            ? isOver
                              ? "border-amber-300 bg-amber-50 text-amber-900"
                              : "border-slate-200 bg-white text-slate-950"
                            : "border-dashed border-slate-300 bg-slate-50 text-slate-400"
                        }`}
                      >
                        {prepared ? row.approvedQty : "Belum diisi"} {row.unit}
                      </div>
                    </div>
                    {pending ? (
                      <StockModeSelector
                        row={row}
                        onChange={(stockMode) => updateMode(row.id, stockMode)}
                      />
                    ) : (
                      <div className="text-xs font-semibold text-slate-500">
                        <p className="inline-flex items-center gap-1 font-bold text-slate-600">
                          <LockKeyhole className="h-3.5 w-3.5" /> Keputusan terkunci
                        </p>
                        <p className="mt-1">
                          {row.decidedByName ?? "Pengguna"} · {row.decidedAt ? new Date(row.decidedAt).toLocaleString("id-ID") : "-"}
                        </p>
                      </div>
                    )}
                    {pending && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={!prepared || isPreviewing || Boolean(previewError)}
                        loading={processingItemId === row.id}
                        onClick={() => handleApproveItem(row)}
                        icon={<CheckCircle2 className="h-4 w-4" />}
                      >
                        Setujui Item
                      </Button>
                    )}
                  </div>
                  {pending && !prepared && (
                    <p className="mt-2 text-xs font-bold text-amber-700">
                      Isi jumlah terlebih dahulu melalui tombol Isi Jumlah yang Di-ACC.
                    </p>
                  )}
                  {pending && isOver && (
                    <p className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-800">
                      <AlertTriangle className="h-4 w-4" /> Jumlah melebihi kebutuhan dan akan dikonfirmasi saat approval.
                    </p>
                  )}
                </article>
              );
            })}
          </div>

          <ShoppingRequestStockPreviewPanel
            preview={preview}
            loading={isPreviewing}
            error={previewError}
          />

          <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-violet-700">
                  Estimasi pengeluaran
                </p>
                <p className="mt-1 text-2xl font-black text-violet-950">
                  {formatRupiah(expensePreview.total)}
                </p>
              </div>
              <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-bold text-violet-700">
                Tanggal pengeluaran mengikuti tanggal permohonan
              </span>
            </div>
            {expensePreview.missing.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-black">Harga modal tidak tersedia saat approval</p>
                <p className="mt-1">
                  {expensePreview.missing.map((row) => row.productName).join(", ")} dihitung Rp0. Snapshot pengeluaran tidak berubah otomatis.
                </p>
              </div>
            )}
          </section>

          {actionError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              {actionError}
            </p>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500">
              {pendingRows.length === 0
                ? "Seluruh item sudah diproses."
                : allPrepared
                  ? "Semua item tersisa siap disetujui."
                  : "Lengkapi Jumlah yang Di-ACC sebelum approval massal."}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Tutup
              </Button>
              <Button
                type="button"
                loading={approveAll.isPending}
                disabled={!allPrepared || isPreviewing || Boolean(previewError)}
                onClick={handleApproveAll}
                icon={<CheckCircle2 className="h-4 w-4" />}
              >
                Setujui Semua Item Tersisa
              </Button>
            </div>
          </footer>
        </div>
      )}
    </Modal>
  );
}

function DecisionBadge({ status }: { status: ShoppingRequestItemDecisionStatus }) {
  if (status === "APPROVED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Disetujui
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">
        <XCircle className="h-3 w-3" /> Tidak Disetujui
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">
      <CircleDashed className="h-3 w-3" /> Menunggu
    </span>
  );
}

function StockModeSelector({
  row,
  onChange,
}: {
  row: ApprovalRow;
  onChange: (value: ShoppingRequestStockMode) => void;
}) {
  if (!row.hasStockGroup) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
        Stok Produk Ini
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-xs font-bold text-slate-600">Mode stok final</p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["GROUP_STOCK", "Stok Bersama"],
            ["PRODUCT_ONLY", "Stok Produk Ini"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`min-h-10 rounded-lg border px-3 text-xs font-black ${
              row.stockMode === mode
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, LockKeyhole } from "lucide-react";
import { Button, Modal } from "@pos/ui";

import { ProductStockThumbnail } from "@/features/inventory-management/components/ProductStockThumbnail";
import {
  useSaveShoppingRequestApprovedQuantities,
  useShoppingRequest,
} from "../hooks/useShoppingRequests";
import type { ShoppingRequestDetail } from "../types/shopping-request";

export function ShoppingRequestApprovedQtyModal({
  detail,
  open,
  onClose,
}: {
  detail: ShoppingRequestDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  const fullDetail = useShoppingRequest(open ? detail?.id ?? null : null);
  const saveQuantities = useSaveShoppingRequestApprovedQuantities();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fullDetail.data) return;
    setValues(
      Object.fromEntries(
        fullDetail.data.items.map((item) => [
          item.id,
          item.approvedQty === null ? "" : String(item.approvedQty),
        ]),
      ),
    );
    setError(null);
  }, [fullDetail.data]);

  const pendingItems = useMemo(
    () =>
      fullDetail.data?.items.filter(
        (item) => item.decisionStatus === "PENDING",
      ) ?? [],
    [fullDetail.data],
  );
  const invalid = pendingItems.some((item) => {
    const raw = values[item.id];
    const value = Number(raw);
    return raw === "" || !Number.isFinite(value) || value < 0;
  });
  const overRequested = pendingItems.filter(
    (item) => Number(values[item.id]) > item.requestedQty,
  );

  const handleSave = async () => {
    if (!detail || invalid || pendingItems.length === 0) return;
    const confirmed =
      overRequested.length === 0 ||
      window.confirm(
        `${overRequested.length} item melebihi Jumlah Kebutuhan. Tetap simpan Jumlah yang Di-ACC?`,
      );
    if (!confirmed) return;
    setError(null);
    try {
      await saveQuantities.mutateAsync({
        id: detail.id,
        input: {
          items: pendingItems.map((item) => ({
            id: item.id,
            approvedQty: Number(values[item.id]),
          })),
          confirmOverRequested: overRequested.length > 0,
        },
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Gagal menyimpan Jumlah yang Di-ACC",
      );
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Isi Jumlah yang Di-ACC"
      size="6xl"
    >
      {fullDetail.isPending ? (
        <div className="p-8 text-center text-sm font-semibold text-slate-500">
          Memuat detail permohonan...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold text-cyan-900">
            Simpan jumlah sebagai persiapan approval. Aksi ini tidak mengubah stok.
          </div>
          <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
            {fullDetail.data?.items.map((item) => {
              const locked = item.decisionStatus !== "PENDING";
              const isOver = Number(values[item.id]) > item.requestedQty;
              return (
                <article
                  key={item.id}
                  className={`rounded-xl border p-3 ${
                    locked
                      ? "border-slate-200 bg-slate-50"
                      : isOver
                        ? "border-amber-300 bg-amber-50"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ProductStockThumbnail
                      name={item.productName}
                      imageUrl={item.imageUrl}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black text-slate-950">
                        {item.productName}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {item.productSku} · Kebutuhan {item.requestedQty} {item.unit}
                      </p>
                    </div>
                    {locked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-1 text-[10px] font-black text-slate-600">
                        <LockKeyhole className="h-3 w-3" /> Terkunci
                      </span>
                    ) : (
                      <label className="w-44 text-xs font-bold text-slate-600">
                        Jumlah yang Di-ACC
                        <div className="relative mt-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={values[item.id] ?? ""}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 pr-12 text-right font-black"
                          />
                          <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                            {item.unit}
                          </span>
                        </div>
                      </label>
                    )}
                  </div>
                  {isOver && !locked && (
                    <p className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-800">
                      <AlertTriangle className="h-4 w-4" /> Melebihi Jumlah Kebutuhan dan membutuhkan konfirmasi.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              {error}
            </p>
          )}
          <footer className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500">
              {pendingItems.length} item masih menunggu keputusan.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Tutup
              </Button>
              <Button
                type="button"
                loading={saveQuantities.isPending}
                disabled={invalid || pendingItems.length === 0}
                onClick={handleSave}
                icon={<CheckCircle2 className="h-4 w-4" />}
              >
                Simpan Jumlah
              </Button>
            </div>
          </footer>
        </div>
      )}
    </Modal>
  );
}

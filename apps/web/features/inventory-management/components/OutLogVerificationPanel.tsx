"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import type { OutLogVerificationState } from "../helpers/inventory-management-rules";
import {
  approveOutLogCorrection,
  createOutLogCorrection,
  fetchOutLogVerificationQueue,
  rejectOutLogCorrection,
  setOutLogVerificationStatus,
  type OutLogVerificationQueueItem,
} from "../api/inventory-management-api";
import { useProducts } from "@/hooks/useProducts";

export type OutLogVerificationItem = OutLogVerificationQueueItem;

export function OutLogVerificationBadge({
  state,
}: {
  state: OutLogVerificationState;
}) {
  const config: Record<OutLogVerificationState, { label: string; className: string }> = {
    UNVERIFIED: {
      label: "Belum Diverifikasi",
      className: "bg-slate-100 text-slate-600",
    },
    VERIFIED: {
      label: "Sesuai",
      className: "bg-emerald-100 text-emerald-700",
    },
    MISMATCH: {
      label: "Perlu Koreksi",
      className: "bg-rose-100 text-rose-700",
    },
    CORRECTION_PENDING: {
      label: "Menunggu Approval",
      className: "bg-amber-100 text-amber-700",
    },
    CORRECTION_REJECTED: {
      label: "Perlu Koreksi",
      className: "bg-rose-100 text-rose-700",
    },
    READY_FOR_REVIEW: {
      label: "Siap Dicek Ulang",
      className: "bg-sky-100 text-sky-700",
    },
  };
  const current = config[state];

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${current.className}`}
    >
      {current.label}
    </span>
  );
}

export function OutLogVerificationRow({
  item,
  canVerify,
  onSetStatus,
  onOpenCorrection,
  mode = "queue",
}: {
  item: OutLogVerificationItem;
  canVerify: boolean;
  onSetStatus: (status: "VERIFIED" | "MISMATCH") => void;
  onOpenCorrection: () => void;
  mode?: "queue" | "history";
}) {
  const mismatch =
    item.verificationState === "MISMATCH" ||
    item.verificationState === "CORRECTION_REJECTED";
  const correctionPending = item.verificationState === "CORRECTION_PENDING";
  const readyForReview = item.verificationState === "READY_FOR_REVIEW";
  const needsDecision =
    item.verificationState === "UNVERIFIED" || readyForReview;

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        mismatch
          ? "border-rose-200 bg-rose-50/40"
          : correctionPending
          ? "border-amber-200 bg-amber-50/40"
          : readyForReview
          ? "border-sky-200 bg-sky-50/40"
          : "border-slate-200"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">
            {item.product.name}
          </p>
          <p className="text-xs font-semibold text-slate-500">
            {item.product.sku} · {item.quantity} {item.product.unit}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {item.person || "Tanpa pencatat"} · {item.note || "Tanpa catatan"}
          </p>
        </div>
        <OutLogVerificationBadge state={item.verificationState} />
      </div>

      {mode === "queue" && canVerify && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {needsDecision && (
            <>
              <button
                type="button"
                onClick={() => onSetStatus("MISMATCH")}
                className="min-h-9 rounded-xl border border-rose-200 bg-white px-4 text-xs font-bold text-rose-700 hover:bg-rose-50"
              >
                Perlu Koreksi
              </button>
              <button
                type="button"
                onClick={() => onSetStatus("VERIFIED")}
                className="min-h-9 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Setujui
              </button>
            </>
          )}
          {item.verificationState === "VERIFIED" && (
            <button
              type="button"
              onClick={() => onSetStatus("MISMATCH")}
              className="min-h-9 rounded-xl border border-rose-200 bg-white px-4 text-xs font-bold text-rose-700 hover:bg-rose-50"
            >
              Perlu Koreksi
            </button>
          )}
          {mismatch && (
          <button
            type="button"
            onClick={onOpenCorrection}
            className="min-h-9 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700"
          >
            Koreksi
          </button>
          )}
        </div>
      )}
    </article>
  );
}

export function OutLogVerificationPanel({
  dateKey,
  initialItems,
  canVerify,
  canApprove,
  currentUserId,
  onBack,
  onChanged,
}: {
  dateKey: string;
  initialItems?: OutLogVerificationItem[];
  canVerify: boolean;
  canApprove: boolean;
  currentUserId: string | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<OutLogVerificationItem[]>(initialItems ?? []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(initialItems === undefined);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | OutLogVerificationState>("ALL");
  const [correctionItem, setCorrectionItem] =
    useState<OutLogVerificationItem | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [correctedProductId, setCorrectedProductId] = useState("");
  const [correctedQuantity, setCorrectedQuantity] = useState("");
  const [correctedReason, setCorrectedReason] =
    useState<"USAGE" | "MANUAL_ADJUSTMENT">("USAGE");
  const [correctedNote, setCorrectedNote] = useState("");
  const productsQuery = useProducts(productSearch, undefined, { limit: 20 });

  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchOutLogVerificationQueue({ dateKey, page });
      setItems(response.data.items);
      setTotalPages(response.pagination.totalPages);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Gagal memuat antrean verifikasi Log OUT",
      );
    } finally {
      setIsLoading(false);
    }
  }, [dateKey, page]);

  useEffect(() => {
    if (initialItems !== undefined && page === 1) return;
    void loadQueue();
  }, [initialItems, loadQueue, page]);

  const unfinishedCount = items.filter(
    (item) => item.verificationState !== "VERIFIED",
  ).length;
  const visibleItems = useMemo(
    () =>
      filter === "ALL"
        ? items
        : items.filter((item) => item.verificationState === filter),
    [filter, items],
  );

  const refreshAfterMutation = async () => {
    await loadQueue();
    onChanged();
  };

  const handleSetStatus = async (
    item: OutLogVerificationItem,
    status: "VERIFIED" | "MISMATCH",
  ) => {
    const previous = items;
    setBusyId(item.id);
    setError(null);
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              verificationState: status,
              verification: { status },
            }
          : candidate,
      ),
    );
    try {
      await setOutLogVerificationStatus(item.id, status);
      await refreshAfterMutation();
    } catch (mutationError) {
      setItems(previous);
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Gagal memperbarui verifikasi",
      );
    } finally {
      setBusyId(null);
    }
  };

  const openCorrection = (item: OutLogVerificationItem) => {
    setCorrectionItem(item);
    setProductSearch(item.product.name);
    setCorrectedProductId(item.product.id);
    setCorrectedQuantity(String(item.quantity));
    setCorrectedReason(
      item.reason === "MANUAL_ADJUSTMENT" ? "MANUAL_ADJUSTMENT" : "USAGE",
    );
    setCorrectedNote(item.note || "");
    setError(null);
  };

  const submitCorrection = async () => {
    if (!correctionItem || !correctedProductId || !correctedQuantity || !correctedNote.trim()) {
      setError("Lengkapi produk, jumlah, dan catatan koreksi.");
      return;
    }
    setBusyId(correctionItem.id);
    setError(null);
    try {
      await createOutLogCorrection({
        inventoryLogId: correctionItem.id,
        correctedProductId,
        correctedQuantity: Number(correctedQuantity),
        correctedReason,
        correctedNote: correctedNote.trim(),
      });
      setCorrectionItem(null);
      await refreshAfterMutation();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Gagal mengajukan koreksi",
      );
    } finally {
      setBusyId(null);
    }
  };

  const decideCorrection = async (
    item: OutLogVerificationItem,
    decision: "APPROVE" | "REJECT",
  ) => {
    const correctionId = item.latestCorrection?.id;
    if (!correctionId) return;
    setBusyId(item.id);
    setError(null);
    try {
      if (decision === "APPROVE") {
        await approveOutLogCorrection(correctionId);
      } else {
        const reason = window.prompt("Tulis alasan penolakan koreksi:")?.trim();
        if (!reason) return;
        await rejectOutLogCorrection(correctionId, reason);
      }
      await refreshAfterMutation();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Gagal memproses koreksi",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 text-xs font-bold text-brand-700 hover:text-brand-800"
          >
            ← Kembali ke tugas
          </button>
          <h2 className="text-lg font-black text-slate-900">Verifikasi Log OUT</h2>
          <p className="text-sm text-slate-500">
            {dateKey} · {unfinishedCount} belum selesai
          </p>
        </div>
        <select
          value={filter}
          onChange={(event) =>
            setFilter(event.target.value as "ALL" | OutLogVerificationState)
          }
          className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
          aria-label="Filter status verifikasi"
        >
          <option value="ALL">Semua status</option>
          <option value="UNVERIFIED">Belum Diverifikasi</option>
          <option value="VERIFIED">Sesuai</option>
          <option value="MISMATCH">Perlu Koreksi</option>
          <option value="CORRECTION_PENDING">Menunggu Approval</option>
          <option value="READY_FOR_REVIEW">Siap Dicek Ulang</option>
        </select>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Memuat antrean verifikasi…
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <p className="font-bold text-emerald-800">Semua Log OUT sudah diperiksa</p>
          <p className="mt-1 text-sm text-emerald-700">Tidak ada pekerjaan pada filter ini.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleItems.map((item) => {
            const canDecide =
              canApprove &&
              item.latestCorrection?.status === "PENDING" &&
              item.latestCorrection.requestedBy !== currentUserId;
            return (
              <div key={item.id} className={busyId === item.id ? "opacity-60" : ""}>
                <OutLogVerificationRow
                  item={item}
                  canVerify={canVerify && busyId !== item.id}
                  onSetStatus={(status) => void handleSetStatus(item, status)}
                  onOpenCorrection={() => openCorrection(item)}
                />
                {canDecide && (
                  <div className="-mt-2 flex justify-end gap-2 rounded-b-2xl border border-t-0 border-amber-200 bg-amber-50 px-4 pb-3 pt-4">
                    <button
                      type="button"
                      onClick={() => void decideCorrection(item, "REJECT")}
                      className="min-h-9 rounded-xl border border-rose-200 bg-white px-4 text-xs font-bold text-rose-700"
                    >
                      Tolak Koreksi
                    </button>
                    <button
                      type="button"
                      onClick={() => void decideCorrection(item, "APPROVE")}
                      className="min-h-9 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white"
                    >
                      Setujui Koreksi
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40">
            Sebelumnya
          </button>
          <span className="text-xs font-semibold text-slate-500">{page} / {totalPages}</span>
          <button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40">
            Berikutnya
          </button>
        </div>
      )}

      {correctionItem && (
        <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-slate-900">Koreksi Log OUT</h3>
              <p className="text-xs text-slate-500">
                Data asli: {correctionItem.product.name} · {correctionItem.quantity} {correctionItem.product.unit}
              </p>
            </div>
            <button type="button" onClick={() => setCorrectionItem(null)} className="text-sm font-bold text-slate-500">
              Tutup
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              Cari produk yang benar
              <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Jumlah yang benar
              <input type="number" min="0.000001" step="any" value={correctedQuantity} onChange={(event) => setCorrectedQuantity(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" />
            </label>
          </div>
          {productsQuery.data && productsQuery.data.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {productsQuery.data.map((product) => (
                <button key={product.id} type="button" onClick={() => { setCorrectedProductId(product.id); setProductSearch(product.name); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${correctedProductId === product.id ? "bg-brand-50 text-brand-800" : "hover:bg-slate-50"}`}>
                  <span className="font-semibold">{product.name}</span>
                  <span className="text-xs text-slate-500">{product.sku} · stok {product.stock}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              Alasan yang benar
              <select value={correctedReason} onChange={(event) => setCorrectedReason(event.target.value as "USAGE" | "MANUAL_ADJUSTMENT")} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm">
                <option value="USAGE">Pemakaian internal</option>
                <option value="MANUAL_ADJUSTMENT">Penyesuaian manual</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">
              Catatan koreksi
              <input value={correctedNote} onChange={(event) => setCorrectedNote(event.target.value)} maxLength={500} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => void submitCorrection()} disabled={busyId === correctionItem.id} className="min-h-10 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white disabled:opacity-50">
              Ajukan Koreksi
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

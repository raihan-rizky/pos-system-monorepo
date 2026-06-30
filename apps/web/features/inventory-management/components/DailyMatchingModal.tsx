"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button } from "@pos/ui";
import { AlertCircle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { getDefaultProductImage } from "@/lib/utils";
import {
  approveDailyStockMatching,
  cancelInventoryBundle,
  fetchDailyStockMatching,
  submitDailyStockMatching,
  type DailyMatchingPreview,
} from "../api/inventory-management-api";
import {
  getDailyMatchingRowStatus,
  parseDailyMatchingStockInput,
  summarizeDailyMatchingStatuses,
  type DailyMatchingRowStatus,
} from "../helpers/daily-matching-status";
import { getDailyMatchingWindowStatus } from "../helpers/inventory-management-rules";
import type { InventorySummary } from "../types/inventory-management";

interface DailyMatchingModalProps {
  open: boolean;
  onClose: () => void;
  initialSummary: InventorySummary;
  onSuccess: (message: string) => void;
}

function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function rowStatusClass(status: DailyMatchingRowStatus) {
  if (status === "matched") return "border-emerald-100 bg-emerald-50/60";
  if (status === "different") return "border-rose-100 bg-rose-50/60";
  if (status === "invalid") return "border-amber-100 bg-amber-50/70";
  return "border-slate-100";
}

export function DailyMatchingModal({
  open,
  onClose,
  initialSummary,
  onSuccess,
}: DailyMatchingModalProps) {
  const { canPerform } = useRole();
  const canApprove = canPerform("inventory.approve", "update");
  const [preview, setPreview] = useState<DailyMatchingPreview | null>(null);
  const [physicalStocks, setPhysicalStocks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [checkedProductIds, setCheckedProductIds] = useState<Record<string, true>>({});
  const [matchingWindowNow, setMatchingWindowNow] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchDailyStockMatching();
      setPreview(data);
      setPhysicalStocks(
        Object.fromEntries(
          data.rows.map((row) => [
            row.productId,
            formatQty(row.expectedAfterStock),
          ]),
        ),
      );
      setNotes({});
      setCheckedProductIds({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat matching stok");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setMatchingWindowNow(new Date());
    const intervalId = window.setInterval(() => {
      setMatchingWindowNow(new Date());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [open]);

  const matchingWindowStatus = useMemo(
    () => getDailyMatchingWindowStatus(matchingWindowNow),
    [matchingWindowNow],
  );

  const rows = preview?.rows ?? [];
  const enrichedRows = useMemo(
    () =>
      rows.map((row) => {
        const stockInput = physicalStocks[row.productId] ?? "";
        const physicalStock = parseDailyMatchingStockInput(stockInput);
        const difference =
          physicalStock === null ? null : physicalStock - row.expectedAfterStock;
        const matchingStatus = getDailyMatchingRowStatus({
          expectedStock: row.expectedAfterStock,
          physicalStockInput: stockInput,
          isChecked: Boolean(checkedProductIds[row.productId]),
        });
        return { ...row, physicalStock, difference, matchingStatus };
      }),
    [checkedProductIds, physicalStocks, rows],
  );
  const differentRows = enrichedRows.filter(
    (row) => row.difference !== null && Math.abs(row.difference) > 1e-9,
  );
  const invalidRows = enrichedRows.filter((row) => row.matchingStatus === "invalid");
  const matchingStatusSummary = useMemo(
    () => summarizeDailyMatchingStatuses(enrichedRows.map((row) => row.matchingStatus)),
    [enrichedRows],
  );
  const missingNotes = differentRows.filter(
    (row) => !(notes[row.productId] ?? "").trim(),
  );

  const markRowChecked = (productId: string) => {
    setCheckedProductIds((current) =>
      current[productId] ? current : { ...current, [productId]: true },
    );
  };

  const handleSubmit = async () => {
    if (!preview) return;
    if (!matchingWindowStatus.isOpen) {
      setError(matchingWindowStatus.message);
      return;
    }
    if (invalidRows.length > 0) {
      setError("Isi stok gudang yang belum valid sebelum submit matching.");
      return;
    }
    if (missingNotes.length > 0) {
      setError("Catatan wajib diisi untuk produk yang selisih.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await submitDailyStockMatching({
        lines: enrichedRows.map((row) => ({
          productId: row.productId,
          physicalStock: row.physicalStock ?? row.expectedAfterStock,
          note: notes[row.productId]?.trim() || null,
        })),
      });
      onSuccess(
        differentRows.length > 0
          ? "Matching stok dikirim dan menunggu approval owner."
          : "Matching stok harian selesai.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim matching stok");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelPending = async () => {
    if (!preview?.pendingBundle) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await cancelInventoryBundle(preview.pendingBundle.id);
      onSuccess("Bundle matching pending dibatalkan.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membatalkan bundle");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprovePending = async () => {
    if (!preview?.pendingBundle) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await approveDailyStockMatching(preview.pendingBundle.id);
      onSuccess("Bundle matching stok harian disetujui.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal approve matching");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Matching Stok Harian" size="5xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-slate-900">
                Periode {preview?.periodKey ?? initialSummary.period.dateKey}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Semua log OUT approved hari ini digabung per produk sebelum dihitung.
              </p>
            </div>
            <span
              className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black ${
                preview?.pendingBundle
                  ? "bg-amber-100 text-amber-800"
                  : initialSummary.counts.dailyMatchingIncomplete
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {preview?.pendingBundle
                ? "Menunggu approval"
                : initialSummary.counts.dailyMatchingIncomplete
                  ? "Belum match"
                  : "Selesai"}
            </span>
          </div>
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

        {!matchingWindowStatus.isOpen && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{matchingWindowStatus.message}</span>
          </div>
        )}

        {preview?.pendingBundle && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold">Matching hari ini sedang menunggu approval.</p>
            <p className="mt-1 text-xs">
              Batalkan bundle jika inventory staff perlu submit ulang. Owner dapat approve bundle dari sini atau dari Log Stok.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {canApprove && (
                <Button
                  type="button"
                  onClick={handleApprovePending}
                  disabled={isSubmitting}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                >
                  Approve Bundle
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancelPending}
                disabled={isSubmitting}
                icon={<XCircle className="h-4 w-4" />}
              >
                Cancel & Submit Ulang
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Memuat transaksi harian...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Tidak ada log OUT approved untuk dimatching hari ini.
          </div>
        ) : (
          <>
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-slate-900">Ringkasan pengecekan stok gudang</p>
              {matchingStatusSummary.checkedCount === 0 ? (
                <p className="text-xs font-semibold text-slate-500">
                  Belum ada stok gudang yang dicek.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                    {matchingStatusSummary.matchedCount} sesuai
                  </span>
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-700">
                    {matchingStatusSummary.differentCount} selisih
                  </span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">
                    {matchingStatusSummary.invalidCount} belum valid
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="max-h-[58vh] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="sticky top-0 bg-white shadow-sm">
                <tr className="border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-3">Produk</th>
                  <th className="px-3 py-3 text-right">Stok Sebelum</th>
                  <th className="px-3 py-3 text-right">Total OUT</th>
                  <th className="px-3 py-3 text-right">Ekspektasi</th>
                  <th className="px-3 py-3 text-right">Stok Gudang</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Selisih</th>
                  <th className="px-3 py-3">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {enrichedRows.map((row) => {
                  const hasDifference =
                    row.difference !== null && Math.abs(row.difference) > 1e-9;
                  const noteMissing = hasDifference && !(notes[row.productId] ?? "").trim();
                  return (
                    <tr
                      key={row.productId}
                      className={`border-b transition-colors ${rowStatusClass(row.matchingStatus)}`}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                            <img
                              src={row.product.imageUrl || getDefaultProductImage(row.product.category?.name)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-900">{row.product.name}</p>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              {row.product.sku} - {row.logCount} log
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums">
                        {formatQty(row.stockBeforeOut)} {row.product.unit}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-amber-700 tabular-nums">
                        {formatQty(row.totalOut)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900 tabular-nums">
                        {formatQty(row.expectedAfterStock)}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={physicalStocks[row.productId] ?? ""}
                          onFocus={() => markRowChecked(row.productId)}
                          onChange={(event) =>
                            {
                              markRowChecked(row.productId);
                            setPhysicalStocks((current) => ({
                              ...current,
                              [row.productId]: event.target.value,
                            }));
                            }
                          }
                          className="ml-auto block h-10 w-28 rounded-lg border border-slate-200 px-2 text-right text-sm font-bold focus:border-slate-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-3">
                        {row.matchingStatus === "matched" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Sesuai
                          </span>
                        )}
                        {row.matchingStatus === "different" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-700">
                            <XCircle className="h-3.5 w-3.5" />
                            Selisih
                          </span>
                        )}
                        {row.matchingStatus === "invalid" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Belum valid
                          </span>
                        )}
                        {row.matchingStatus === "unchecked" && (
                          <span className="text-xs font-semibold text-slate-400">-</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-black tabular-nums ${
                          hasDifference ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {row.difference === null ? "-" : formatQty(row.difference)}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={notes[row.productId] ?? ""}
                          onChange={(event) =>
                            setNotes((current) => ({
                              ...current,
                              [row.productId]: event.target.value,
                            }))
                          }
                          placeholder={hasDifference ? "Wajib isi alasan selisih" : "Opsional"}
                          className={`h-10 w-full min-w-48 rounded-lg border px-3 text-sm focus:outline-none ${
                            noteMissing
                              ? "border-rose-300 bg-rose-50"
                              : "border-slate-200 focus:border-slate-400"
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-slate-500">
            {differentRows.length} produk selisih. {missingNotes.length} catatan wajib belum diisi.
            {invalidRows.length > 0 ? ` ${invalidRows.length} stok gudang belum valid.` : ""}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Tutup
            </Button>
            {!preview?.pendingBundle && (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={
                  isSubmitting ||
                  isLoading ||
                  rows.length === 0 ||
                  invalidRows.length > 0 ||
                  !matchingWindowStatus.isOpen
                }
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {isSubmitting ? "Memproses..." : "Submit Matching"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

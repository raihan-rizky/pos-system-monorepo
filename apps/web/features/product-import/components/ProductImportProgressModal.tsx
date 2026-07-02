"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { Button, Modal } from "@pos/ui";

import {
  type ProductImportJobResponse,
  useCancelProductImportJob,
  useRetryProductImportJob,
} from "../hooks/useProductImport";

type RefetchResult = Promise<unknown>;

const ACTIVE_STATUSES = ["PENDING", "RUNNING", "CANCEL_REQUESTED"] as const;

export function ProductImportProgressModal({
  open,
  job,
  isRefreshing,
  refreshError,
  onRefresh,
  onClose,
}: {
  open: boolean;
  job: ProductImportJobResponse | null;
  isRefreshing: boolean;
  refreshError?: unknown;
  onRefresh: () => RefetchResult;
  onClose: () => void;
}) {
  const cancelJob = useCancelProductImportJob();
  const retryJob = useRetryProductImportJob();
  const totalRows = job?.totalRows ?? 0;
  const processedRows = job?.processedRows ?? 0;
  const progress = totalRows > 0 ? Math.floor((processedRows / totalRows) * 100) : 0;
  const isActive = job ? ACTIVE_STATUSES.includes(job.status as (typeof ACTIVE_STATUSES)[number]) : false;
  const canCancel = job && isActive;
  const canRetry =
    job &&
    (job.status === "FAILED" ||
      job.status === "COMPLETED_WITH_ERRORS" ||
      (job.status === "PENDING" && Boolean(job.lastError)));
  const refreshMessage = refreshError instanceof Error ? refreshError.message : null;

  const statusLabel = useMemo(() => {
    if (!job) return "Tidak ada import aktif";
    switch (job.status) {
      case "PENDING":
        return "Menunggu antrean";
      case "RUNNING":
        return "Import berjalan";
      case "CANCEL_REQUESTED":
        return "Membatalkan import";
      case "COMPLETED":
        return "Import selesai";
      case "COMPLETED_WITH_ERRORS":
        return "Import selesai dengan error";
      case "FAILED":
        return "Import gagal";
      case "CANCELLED":
        return "Import dibatalkan";
      default:
        return job.status;
    }
  }, [job]);

  async function handleCancel() {
    if (!job) return;
    await cancelJob.mutateAsync(job.id);
    await onRefresh();
  }

  async function handleRetry() {
    if (!job) return;
    await retryJob.mutateAsync(job.id);
    await onRefresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Progress Import Produk" size="lg">
      <div className="space-y-4">
        {!job ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
            Tidak ada import produk yang sedang berjalan.
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  {isActive ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : job.status === "COMPLETED" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">{statusLabel}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    Job {job.id}
                  </div>
                </div>
              </div>
              <div className="text-right text-sm font-black tabular-nums text-slate-900">
                {Math.min(100, Math.max(0, progress))}%
              </div>
            </div>

            <div
              className="h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.max(0, progress))}
              aria-label="Progress import produk"
            >
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ProgressStat label="Diproses" value={`${processedRows}/${totalRows}`} />
              <ProgressStat label="Sukses" value={job.successRows} />
              <ProgressStat label="Gagal" value={job.failedRows} />
              <ProgressStat label="Lewati" value={job.skippedRows} />
            </div>

            {job.lastError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                {job.lastError}
              </div>
            )}

            {job.rows?.length ? (
              <div className="max-h-44 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.rows.map((row) => (
                      <tr key={`${row.rowNumber}-${row.sku}`} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-bold text-slate-700">{row.rowNumber}</td>
                        <td className="px-3 py-2 text-slate-700">{row.sku}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {row.errorMessage || row.errorCode || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}

        {refreshMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {refreshMessage}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={<RefreshCw className="h-4 w-4" />}
            loading={isRefreshing}
            disabled={isRefreshing}
            onClick={() => void onRefresh()}
          >
            Refresh
          </Button>
          {canCancel && (
            <Button
              type="button"
              variant="secondary"
              icon={<XCircle className="h-4 w-4" />}
              loading={cancelJob.isPending}
              disabled={cancelJob.isPending}
              onClick={() => void handleCancel()}
            >
              Batalkan
            </Button>
          )}
          {canRetry && (
            <Button
              type="button"
              icon={<RotateCcw className="h-4 w-4" />}
              loading={retryJob.isPending}
              disabled={retryJob.isPending}
              onClick={() => void handleRetry()}
            >
              Coba Lagi
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ProgressStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-black tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

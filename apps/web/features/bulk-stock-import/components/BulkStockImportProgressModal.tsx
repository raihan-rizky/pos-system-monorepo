"use client";

import { Button, Modal } from "@pos/ui";
import { RefreshCw } from "lucide-react";
import type { BulkStockImportJobResponse } from "../hooks/useBulkStockImport";
import { BulkStockImportProgressPanel } from "./BulkStockImportDrawer";

const STATUS_LABELS: Record<BulkStockImportJobResponse["status"], string> = {
  PENDING: "Menunggu antrean",
  RUNNING: "Impor stok berjalan",
  COMMITTED: "Impor stok selesai",
  PENDING_APPROVAL: "Menunggu persetujuan Owner",
  FAILED: "Impor stok gagal",
};

export function BulkStockImportProgressModal({ open, job, isRefreshing, refreshError, onRefresh, onClose }: {
  open: boolean;
  job: BulkStockImportJobResponse | null;
  isRefreshing: boolean;
  refreshError?: unknown;
  onRefresh: () => Promise<unknown>;
  onClose: () => void;
}) {
  const isRunning = job?.status === "PENDING" || job?.status === "RUNNING";

  return (
    <Modal open={open} onClose={onClose} title="Progres Impor Stok" size="lg">
      <div className="space-y-4">
        {job ? <>
          <p role="status" className="text-sm font-bold text-slate-900">{STATUS_LABELS[job.status]}</p>
          <BulkStockImportProgressPanel job={job} />
          {job.result && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            {job.result.inventoryLogCount === 0
              ? "Tidak ada perubahan stok. Semua produk sudah sesuai, jadi tidak ada riwayat atau persetujuan baru."
              : job.result.pendingApproval
                ? `${job.result.inventoryLogCount} perubahan stok menunggu persetujuan Owner.`
                : `${job.result.updatedProductCount} stok berhasil diperbarui.`}
          </div>}
        </> : <p className="text-sm text-slate-600">Tidak ada impor stok yang sedang berjalan.</p>}
        {Boolean(refreshError) && <p role="alert" className="text-sm text-red-700">
          {refreshError instanceof Error ? refreshError.message : "Gagal memuat progres. Silakan muat ulang."}
        </p>}
        <p className="text-xs text-slate-500">
          {isRunning ? "Panel ini boleh ditutup. Impor tetap berjalan dan bisa dipantau dari tombol Progres Impor Stok di halaman Produk." : "Periksa hasil impor sebelum menutup panel ini."}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" loading={isRefreshing}
            icon={<RefreshCw className="h-4 w-4" />} onClick={() => { void onRefresh(); }}>Muat ulang</Button>
          <Button type="button" onClick={onClose}>Tutup</Button>
        </div>
      </div>
    </Modal>
  );
}

import React from "react";
import { SuratJalanList } from "@/features/surat-jalan/components/SuratJalanList";
import { useSuratJalans, useGlobalApproveSuratJalan } from "@/features/surat-jalan/hooks/useSuratJalan";
import { useRole } from "@/components/providers/RoleProvider";
import { CheckCircle2, Clock3, Loader2, Truck } from "lucide-react";
import type { useApproveSuratJalan } from "@/features/surat-jalan/hooks/useSuratJalan";
import type { SuratJalanRecord } from "@/features/surat-jalan/types/surat-jalan";

export const InventorySuratJalanTab: React.FC = () => {
  const { data, isLoading, error } = useSuratJalans(50, 0);
  const { canPerform } = useRole();
  const canApprove = canPerform("surat_jalan", "update");
  const approveMutation = useGlobalApproveSuratJalan();

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-500 shadow-sm">
        <p className="text-sm font-semibold">Gagal memuat data Surat Jalan</p>
      </div>
    );
  }

  const records: SuratJalanRecord[] = data?.data || [];
  const pendingRecords = records.filter((record) => record.status === "PENDING");
  const confirmedRecords = records.filter((record) => record.status === "CONFIRMED");
  const pendingItemCount = pendingRecords.reduce(
    (sum, record) => sum + record.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <Truck className="h-6 w-6 text-slate-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-900">Belum ada Surat Jalan</h3>
        <p className="text-xs text-slate-500 max-w-[250px]">
          Belum ada riwayat Surat Jalan yang memengaruhi stok gudang.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Verifikasi Surat Jalan
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {pendingRecords.length > 0
                ? `${pendingRecords.length} dokumen menunggu persetujuan`
                : "Tidak ada Surat Jalan pending"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Setujui Surat Jalan untuk mengunci pengiriman dan mencatat dampak stok keluar.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[24rem]">
            <div className="rounded-xl bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-700">
                <Clock3 className="h-3.5 w-3.5" />
                Pending
              </div>
              <div className="mt-1 text-2xl font-black tabular-nums text-amber-950">
                {pendingRecords.length}
              </div>
            </div>
            <div className="rounded-xl bg-indigo-50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-indigo-700">
                <Truck className="h-3.5 w-3.5" />
                Qty
              </div>
              <div className="mt-1 text-2xl font-black tabular-nums text-indigo-950">
                {pendingItemCount}
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Selesai
              </div>
              <div className="mt-1 text-2xl font-black tabular-nums text-emerald-950">
                {confirmedRecords.length}
              </div>
            </div>
          </div>
        </div>

        {pendingRecords.length > 0 && (
          <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {pendingRecords.slice(0, 5).map((record) => {
              const totalQty = record.items.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <div
                  key={record.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{record.number}</span>
                      {record.transaction?.invoiceNumber && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          {record.transaction.invoiceNumber}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {record.recipientName} - {totalQty} item - {record.requestedByName || "Tanpa requester"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canApprove || approveMutation.isPending}
                    onClick={() => approveMutation.mutate(record.id)}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {canApprove ? "Verifikasi" : "Butuh akses"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Riwayat Surat Jalan</h2>
        <p className="text-sm text-slate-500 mb-6">Semua daftar Surat Jalan yang tercatat di sistem.</p>
        <SuratJalanList
          records={records}
          canApprove={canApprove}
          approveMutation={approveMutation as unknown as ReturnType<typeof useApproveSuratJalan>}
          groupByTransaction={true}
        />
      </div>
    </div>
  );
};

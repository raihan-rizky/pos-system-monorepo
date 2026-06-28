import React from "react";
import { SuratJalanList } from "@/features/surat-jalan/components/SuratJalanList";
import { useSuratJalans, useGlobalApproveSuratJalan } from "@/features/surat-jalan/hooks/useSuratJalan";
import { useRole } from "@/components/providers/RoleProvider";
import { Loader2, Truck } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { useApproveSuratJalan } from "@/features/surat-jalan/hooks/useSuratJalan";

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

  const records = data?.data || [];

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

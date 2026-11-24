"use client";

import { ArrowRight, Building2 } from "lucide-react";
import Link from "next/link";
import { useRole } from "@/components/providers/RoleProvider";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useSupplierDebtSummary } from "@/features/keuangan/hooks/useKeuangan";
import { formatRupiahPrecise } from "@/lib/utils";

const dateLabel = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });

export function DashboardSupplierDebtInsight() {
  const { canAccess, canPerform } = useRole();
  const enabled = canAccess("/keuangan") && canPerform("expense.giro", "read") && canPerform("expense.payable", "read");
  const { data, isLoading, isError } = useSupplierDebtSummary(enabled);

  if (!enabled) return null;

  const debt = isError ? undefined : data;

  return (
    <section aria-labelledby="dashboard-supplier-debt" className="mt-3 rounded-xl border border-brand-100 bg-white px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-surface-700">
          <Building2 className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
          <h3 id="dashboard-supplier-debt">Saldo Hutang Pemasok</h3>
          <InfoTooltip
            title="Saldo Hutang Pemasok"
            description="Saldo per tanggal yang tertera = sisa giro pembelian + sisa hutang manual. Sisa giro memperhitungkan pembayaran sampai tanggal itu dan kredit yang sudah diterapkan. Sisa hutang manual memakai hasil pencatatan pembayaran, termasuk pelunasan otomatis sesuai jatuh tempo."
          />
        </div>
        {debt && (
          <time dateTime={debt.asOf} className="text-xs text-surface-600">
            Per {dateLabel.format(new Date(`${debt.asOf}T00:00:00Z`))} · WIB
          </time>
        )}
      </div>
      {debt ? (
        <>
          <p className="mt-1 text-lg font-semibold tabular-nums text-brand-950 [overflow-wrap:anywhere]">
            {debt.total === null ? "Saldo belum lengkap" : formatRupiahPrecise(debt.total)}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-brand-100 pt-2">
            <div className="min-w-0">
              <dt className="text-xs text-surface-600">{debt.unknownGiroCount ? "Sisa Giro yang diketahui" : "Sisa Giro"}</dt>
              <dd className="text-sm font-semibold tabular-nums text-surface-800 [overflow-wrap:anywhere]">{formatRupiahPrecise(debt.giroKnown)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-surface-600">Hutang manual</dt>
              <dd className="text-sm font-semibold tabular-nums text-surface-800 [overflow-wrap:anywhere]">{formatRupiahPrecise(debt.manual)}</dd>
            </div>
          </dl>
          {debt.unknownGiroCount > 0 && (
            <p className="mt-2 text-xs text-amber-900">Saldo {debt.unknownGiroCount} pembelian giro belum diketahui.</p>
          )}
        </>
      ) : (
        <p role="status" className="mt-1 text-sm text-surface-600">
          {isLoading ? "Memuat saldo hutang pemasok…" : "Saldo hutang pemasok belum tersedia."}
        </p>
      )}
      <Link
        href="/keuangan#supplier-payables-title"
        className="-ml-2 mt-1 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 hover:text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        Lihat rincian hutang
        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </Link>
    </section>
  );
}

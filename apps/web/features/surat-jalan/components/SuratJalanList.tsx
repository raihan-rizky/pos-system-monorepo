import React, { useState, useCallback } from "react";
import { ChevronDown, FileCheck2 } from "lucide-react";
import { Button } from "@pos/ui";
import { formatDate } from "@/lib/utils";
import { SuratJalanPrintModal } from "./SuratJalanPrintModal";
import type { SuratJalanRecord } from "../types/surat-jalan";
import type { useApproveSuratJalan } from "../hooks/useSuratJalan";

interface SuratJalanListProps {
  records: SuratJalanRecord[];
  canApprove: boolean;
  approveMutation: ReturnType<typeof useApproveSuratJalan>;
}

export const SuratJalanList: React.FC<SuratJalanListProps> = ({
  records,
  canApprove,
  approveMutation,
}) => {
  if (records.length === 0) return null;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-surface-100 bg-surface-50/50 px-5 py-4">
        <h3 className="text-sm font-black text-surface-900 tracking-tight flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-brand-500" />
          Daftar Surat Jalan
        </h3>
        <p className="mt-0.5 text-xs text-surface-500">
          Riwayat semua surat jalan yang terkait dengan transaksi ini.
        </p>
      </div>
      <div className="divide-y divide-surface-100">
        {records.map((record) => (
          <SuratJalanListItem
            key={record.id}
            record={record}
            canApprove={canApprove}
            approveMutation={approveMutation}
          />
        ))}
      </div>
    </div>
  );
};

interface SuratJalanListItemProps {
  record: SuratJalanRecord;
  canApprove: boolean;
  approveMutation: ReturnType<typeof useApproveSuratJalan>;
}

const SuratJalanListItem: React.FC<SuratJalanListItemProps> = ({
  record,
  canApprove,
  approveMutation,
}) => {
  const [expanded, setExpanded] = useState(false);
  const totalQty = record.items.reduce((sum, item) => sum + item.quantity, 0);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  return (
    <div className="group transition-colors hover:bg-surface-50/50">
      {/* Header — clickable row */}
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 px-5 py-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-4 w-full sm:w-auto sm:flex-1 min-w-0">
          <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-100 text-surface-500 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600">
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-surface-900">{record.number}</span>
              <StatusPill status={record.status} />
            </div>
            <div className="mt-1 text-sm font-medium text-surface-600 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{record.recipientName}</span>
              <span className="text-surface-300 hidden sm:inline">•</span>
              <span>{totalQty} Item</span>
              <span className="text-surface-300 hidden sm:inline">•</span>
              <span>{formatDate(new Date(record.confirmedAt || record.createdAt))}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 pl-10 sm:pl-0 w-full sm:w-auto justify-start sm:justify-end" onClick={(e) => e.stopPropagation()}>
          {record.status === "CONFIRMED" && (
            <SuratJalanPrintModal suratJalan={record} />
          )}
          {record.status === "PENDING" && canApprove && (
            <Button
              variant="accent"
              size="sm"
              loading={approveMutation.isPending}
              onClick={() => approveMutation.mutate(record.id)}
              className="shadow-sm"
            >
              Setujui
            </Button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="animate-in slide-in-from-top-2 fade-in duration-300 pb-5 pl-14 pr-5 pt-1">
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <div className="flex flex-col">
              <span className="font-bold uppercase tracking-widest text-surface-400">Penerima</span>
              <span className="font-semibold text-surface-800">{record.recipientName}</span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold uppercase tracking-widest text-surface-400">Request Oleh</span>
              <span className="font-semibold text-surface-800">{record.requestedByName || "-"}</span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold uppercase tracking-widest text-surface-400">Di-approve Oleh</span>
              <span className="font-semibold text-surface-800">{record.approvedByName || "-"}</span>
            </div>
          </div>
          
          <div className="overflow-hidden rounded-xl border border-surface-200">
            <div className="overflow-x-auto">
              <table className="min-w-[480px] w-full text-sm">
                <thead className="bg-surface-50 text-[11px] font-bold uppercase tracking-wider text-surface-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Barang</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-left">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 bg-white">
                  {record.items.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-50/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-surface-900">{item.productName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-surface-700">{item.quantity} {item.unit || ""}</td>
                      <td className="px-4 py-3 text-surface-500">{item.keterangan || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function StatusPill({ status }: { status: SuratJalanRecord["status"] }) {
  const className =
    status === "CONFIRMED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm"
      : status === "PENDING"
        ? "bg-amber-50 text-amber-700 border-amber-200 shadow-sm"
        : status === "REJECTED"
          ? "bg-red-50 text-red-700 border-red-200 shadow-sm"
          : "bg-surface-100 text-surface-600 border-surface-200";
  return (
    <span className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${className}`}>
      {status}
    </span>
  );
}

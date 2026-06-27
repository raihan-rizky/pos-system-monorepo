"use client";

import React, { useEffect, useState } from "react";
import { Loader2, PackageOpen, CheckCircle, Clock, XCircle, AlertTriangle } from "lucide-react";
import { fetchInboundReceipts } from "../api/inventory-management-api";

export const InboundReceiptTab: React.FC = () => {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchInboundReceipts()
      .then((data) => {
        if (mounted) {
          setReceipts(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Gagal memuat daftar penerimaan barang");
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-500 shadow-sm">
        <p className="text-sm font-semibold">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Riwayat Penerimaan Barang</h2>
        <p className="text-sm text-slate-500 mb-6">Daftar transaksi barang masuk yang telah tercatat di sistem.</p>
        
        {receipts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <PackageOpen className="h-6 w-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Belum ada Penerimaan Barang</h3>
            <p className="text-xs text-slate-500 max-w-[250px]">
              Belum ada riwayat penerimaan barang masuk dari supplier.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Tanggal</th>
                  <th className="px-4 py-3">Supplier / Referensi</th>
                  <th className="px-4 py-3">Total Item</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 rounded-tr-lg text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.map((receipt) => {
                  let StatusIcon = Clock;
                  let statusColor = "bg-slate-100 text-slate-700";
                  const statusText = receipt.status;

                  if (receipt.status === "APPROVED") {
                    StatusIcon = CheckCircle;
                    statusColor = "bg-emerald-100 text-emerald-700";
                  } else if (receipt.status === "DRAFT" || receipt.status === "SUBMITTED") {
                    StatusIcon = Clock;
                    statusColor = "bg-amber-100 text-amber-700";
                  } else if (receipt.status === "REJECTED" || receipt.status === "CANCELLED") {
                    StatusIcon = XCircle;
                    statusColor = "bg-rose-100 text-rose-700";
                  } else if (receipt.status === "NEEDS_REVISION") {
                    StatusIcon = AlertTriangle;
                    statusColor = "bg-orange-100 text-orange-700";
                  }

                  const totalItems = receipt.lines?.length || 0;

                  return (
                    <React.Fragment key={receipt.id}>
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {new Date(receipt.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">
                            {receipt.supplier?.name || "Tanpa Supplier"}
                          </div>
                          {receipt.note && (
                            <div className="text-xs text-slate-500 truncate max-w-[200px]">
                              {receipt.note}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {totalItems} produk
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${statusColor}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusText}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button 
                            onClick={() => setExpandedId(expandedId === receipt.id ? null : receipt.id)}
                            className="text-indigo-600 hover:text-indigo-800 font-bold text-xs transition-colors cursor-pointer"
                          >
                            {expandedId === receipt.id ? "Tutup Detail" : "Lihat Detail"}
                          </button>
                        </td>
                      </tr>
                      {expandedId === receipt.id && (
                        <tr>
                          <td colSpan={5} className="px-4 py-3 bg-slate-50/50 border-t border-b border-slate-100">
                            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-100/50 text-slate-500 uppercase font-black">
                                  <tr>
                                    <th className="px-3 py-2">Produk</th>
                                    <th className="px-3 py-2">Ekspektasi</th>
                                    <th className="px-3 py-2">Diterima</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2">Catatan</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-600">
                                  {receipt.lines?.map((line: any) => (
                                    <tr key={line.id}>
                                      <td className="px-3 py-2">
                                        <div className="font-bold text-slate-800">{line.productNameSnapshot || 'Produk'}</div>
                                        <div className="text-slate-400">{line.skuSnapshot || '-'}</div>
                                      </td>
                                      <td className="px-3 py-2">{line.expectedQuantity} {line.unitSnapshot || ''}</td>
                                      <td className="px-3 py-2 font-bold">{line.receivedQuantity} {line.unitSnapshot || ''}</td>
                                      <td className="px-3 py-2">
                                        <span className={`inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600`}>
                                          {line.status}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 max-w-[150px] truncate">{line.note || '-'}</td>
                                    </tr>
                                  ))}
                                  {totalItems === 0 && (
                                    <tr>
                                      <td colSpan={5} className="px-3 py-4 text-center text-slate-400">Tidak ada item</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

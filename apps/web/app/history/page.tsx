"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ReceiptModal } from "@/components/ReceiptModal";
import { useTransactions } from "@/hooks/useTransactions";
import { formatRupiah, formatDate } from "@/lib/utils";
import { Button } from "@pos/ui";

export default function HistoryPage() {
  const { data: transactions = [], isLoading } = useTransactions();
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50">
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col ml-[72px] overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-6 bg-white border-b border-surface-100">
          <div>
            <h1 className="text-2xl font-extrabold text-surface-900">Riwayat Transaksi</h1>
            <p className="text-sm text-surface-500 mt-1">
              Daftar seluruh transaksi dan invoice toko
            </p>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
            {isLoading ? (
              <div className="p-8 flex items-center justify-center">
                <p className="text-surface-400">Loading history data...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-surface-400">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-50">
                  <path d="M12 8v4l3 3" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <p className="font-medium text-surface-600">Belum ada transaksi.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    <th className="py-4 px-6 font-semibold text-sm text-surface-600">Tanggal</th>
                    <th className="py-4 px-6 font-semibold text-sm text-surface-600">No. Invoice</th>
                    <th className="py-4 px-6 font-semibold text-sm text-surface-600">Pelanggan</th>
                    <th className="py-4 px-6 font-semibold text-sm text-surface-600">Item</th>
                    <th className="py-4 px-6 font-semibold text-sm text-surface-600">Total</th>
                    <th className="py-4 px-6 font-semibold text-sm text-surface-600 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {transactions.map((tx: any) => (
                    <tr key={tx.id} className="hover:bg-surface-50 transition-colors">
                      <td className="py-4 px-6 text-sm text-surface-900">
                        {formatDate(new Date(tx.createdAt))}
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-surface-100 text-surface-700">
                          {tx.invoiceNumber}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-surface-700 font-medium">
                        {tx.customerName || "Pelanggan Umum"}
                      </td>
                      <td className="py-4 px-6 text-sm text-surface-600">
                        {tx.items.length} Barang
                      </td>
                      <td className="py-4 px-6 text-sm font-bold text-brand-600">
                        {formatRupiah(Number(tx.total))}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedTransaction(tx)}
                          className="!py-1.5 !px-3 text-sm h-auto"
                        >
                          Lihat Struk
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Receipt View Modal */}
      {selectedTransaction && (
        <ReceiptModal
          open={!!selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          transaction={selectedTransaction}
        />
      )}
    </div>
  );
}

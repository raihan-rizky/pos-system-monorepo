"use client";

import React from "react";
import { Modal, Button } from "@pos/ui";
import { formatRupiah, formatDate } from "@/lib/utils";
import type { Transaction } from "@/hooks/useTransactions";

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
}

export function ReceiptModal({ open, onClose, transaction }: ReceiptModalProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal open={open} onClose={onClose} title="Transaksi Berhasil" size="xl">
      <div className="space-y-6">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page { size: 210mm 110mm; margin: 0; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body * { visibility: hidden; }
            #print-receipt, #print-receipt * { visibility: visible; }
            #print-receipt {
              position: fixed;
              left: 0;
              top: 0;
              width: 210mm;
              height: 110mm;
              overflow: hidden;
              padding: 4mm 6mm;
              margin: 0;
              page-break-inside: avoid;
              break-inside: avoid;
            }
          }
        `}} />
        {/* The receipt area, styled for A4 (1/3 F4) document */}
        <div className="w-full overflow-x-auto overflow-y-auto max-h-[65vh] pb-4">
          <div id="print-receipt" className="p-4 bg-white text-black font-sans text-xs mx-auto min-w-[210mm] max-w-[210mm] min-h-[110mm] print:w-[210mm] print:h-[110mm] print:-mt-4 print:p-4 print:pt-6 flex flex-col box-border border border-surface-200 print:border-none shadow-sm print:shadow-none">
            
            {/* Header */}
          <div className="flex flex-col mb-2">
            <div className="flex items-baseline">
              <h1 className="text-[28px] leading-none font-serif font-extrabold text-[#003366] tracking-wider uppercase">
                <span className="text-[36px]">T</span>OKO{" "}
                <span className="text-[36px] ml-1">T</span>ELADAN
              </h1>
            </div>
            <p className="text-[11px] text-black mt-1">
              Jl. Temu Putih No.30 Cilegon | Telp: 0254 393022 | tokoteladancv@gmail.com
            </p>
          </div>

          <div className="h-0.5 bg-[#cc0000] w-full mb-3"></div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-4 mb-3 text-[12px]">
            <div className="space-y-2">
              <div className="flex">
                <span className="w-32">Transaction ID</span>
                <span className="mr-4">:</span>
                <span className="font-bold text-[#cc0000]">{transaction.invoiceNumber}</span>
              </div>
              <div className="flex">
                <span className="w-32">Customer</span>
                <span className="mr-4">:</span>
                <span className="font-bold">{transaction.customerName || 'Pelanggan Umum'}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex">
                <span className="w-24">Date</span>
                <span className="mr-4">:</span>
                <span>{formatDate(transaction.createdAt || new Date().toISOString())}</span>
              </div>
              <div className="flex">
                <span className="w-24">Payment</span>
                <span className="mr-4">:</span>
                <span>{transaction.paymentMethod === 'CASH' ? 'Cash' : transaction.paymentMethod}</span>
              </div>
            </div>
          </div>

          {/* Table */}
          {(() => {
            const hasSize = transaction.items.some(item => item.size);
            const hasMaterial = transaction.items.some(item => item.material);
            return (
            <table className="w-full border-collapse border border-black text-[11px] mb-2 flex-grow-0">
            <thead>
              <tr className="bg-[#000080] text-white">
                <th className="border border-black py-2 px-3 text-center w-10 font-normal">No</th>
                <th className="border border-black py-2 px-3 text-center w-64 font-normal">Item Name</th>
                {hasSize && <th className="border border-black py-2 px-3 text-center w-20 font-normal">Size</th>}
                {hasMaterial && <th className="border border-black py-2 px-3 text-center w-32 font-normal">Material</th>}
                <th className="border border-black py-2 px-3 text-center w-16 font-normal">Qty</th>
                <th className="border border-black py-2 px-3 text-center w-28 font-normal">Price Per Item</th>
                <th className="border border-black py-2 px-3 text-center w-32 font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {transaction.items.map((item, index) => (
                <tr key={item.id}>
                  <td className="border border-black py-2 px-3 text-center">{index + 1}</td>
                  <td className="border border-black py-2 px-3">{item.productName}</td>
                  {hasSize && <td className="border border-black py-2 px-3 text-center">{item.size || ''}</td>}
                  {hasMaterial && <td className="border border-black py-2 px-3 text-center">{item.material || ''}</td>}
                  <td className="border border-black py-2 px-3 text-center">{item.quantity}</td>
                  <td className="border border-black py-2 px-3 text-right">{Number(item.unitPrice).toLocaleString('id-ID')}</td>
                  <td className="border border-black py-2 px-3 text-right">{Number(item.subtotal).toLocaleString('id-ID')}</td>
                </tr>
              ))}
              </tbody>
            </table>
            );
          })()}

            {/* Notes + Totals */}
            <div className="flex justify-between text-[12px] mt-auto">
              <div className="flex-1">
                {transaction.note && (
                  <div className="text-[12px]">
                    <span className="font-bold">Catatan: </span>
                    <span>{transaction.note}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end">
                <div className="flex w-[350px]">
                  <div className="flex-1 flex items-center justify-end font-bold pr-4 py-2">GRAND TOTAL</div>
                  <div className="border border-black bg-[#e5e7eb] py-2 px-4 font-bold text-center w-[180px]">
                    Rp {Number(transaction.total).toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="flex w-[350px]">
                  <div className="flex-1 flex items-center justify-end font-bold pr-4 py-2">TUNAI</div>
                  <div className="border-l border-r border-b border-black py-2 px-4 font-bold text-center w-[180px]">
                    Rp {Number(transaction.amountPaid).toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="flex w-[350px]">
                  <div className="flex-1 flex items-center justify-end font-bold pr-4 py-2">KEMBALI</div>
                  <div className="border-l border-r border-b border-black py-2 px-4 font-bold text-center w-[180px]">
                    Rp {Number(transaction.change).toLocaleString('id-ID')}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Actions (Not Printed) */}
        <div className="flex gap-3 print:hidden">
          <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">
            Tutup
          </Button>
          <Button variant="accent" size="lg" onClick={handlePrint} className="flex-1">
            🖨️ Cetak Invoice
          </Button>
        </div>
      </div>
    </Modal>
  );
}

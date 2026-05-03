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

  // When 4+ items, use compact sizing so everything fits in the 210mm × 110mm page
  const compact = transaction.items.length >= 4;

  return (
    <Modal open={open} onClose={onClose} title="Transaksi Berhasil" size="xl">
      <div className="space-y-6">
       <style dangerouslySetInnerHTML={{ __html: `
  @media print {
    /* Set ukuran kertas spesifik (210x110mm) */
    @page { 
      size: 210mm 110mm; 
      margin: 0; 
    }
    
    /* Sembunyikan semua elemen kecuali area struk */
    body * { 
      visibility: hidden; 
    }
    
    #print-receipt, #print-receipt * { 
      visibility: visible; 
    }

    /* MATIKAN SEMUA POSITION & TRANSFORM DARI PARENT MODAL! 
       Ini penting supaya absolute position bisa nempel ke ujung kertas,
       bukan ke pembungkus modal asalnya. */
    body *:not(#print-receipt):not(#print-receipt *) {
      position: static !important;
      transform: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    #print-receipt {
      position: absolute !important; /* Pake absolute biar nempel ke top-left kertas */
      left: 0 !important;
      top: 0 !important;
      width: 210mm !important;
      height: 110mm !important;
      margin: 0 !important;
      padding: ${compact ? '2mm 5mm' : '4mm 6mm'} !important;
      border: none !important;
      box-shadow: none !important;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      page-break-after: avoid;
      page-break-before: avoid;
    }

    /* Fix buat Chrome biar gak munculin header/footer default (tgl/url) */
    body {
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`}} />
        {/* The receipt area, styled for A4 (1/3 F4) document */}
        <div className="w-full overflow-x-auto pb-4">
          <div id="print-receipt" className={`p-4 bg-white text-black font-sans mx-auto min-w-[210mm] max-w-[210mm] min-h-[110mm] print:w-[210mm] print:h-[110mm] print:-mt-4 print:p-4 print:pt-6 flex flex-col box-border border border-surface-200 print:border-none shadow-sm print:shadow-none ${compact ? 'text-[9px]' : 'text-xs'}`}>
            
            {/* Header */}
          <div className={`flex flex-col ${compact ? 'mb-1' : 'mb-2'}`}>
            <div className="flex items-baseline">
              <h1 className={`leading-none font-serif font-extrabold text-[#003366] tracking-wider uppercase ${compact ? 'text-[20px]' : 'text-[28px]'}`}>
                <span className={compact ? 'text-[26px]' : 'text-[36px]'}>T</span>OKO{" "}
                <span className={`${compact ? 'text-[26px]' : 'text-[36px]'} ml-1`}>T</span>ELADAN
              </h1>
            </div>
            <p className={`text-black ${compact ? 'text-[9px] mt-0.5' : 'text-[11px] mt-1'}`}>
              Jl. Temu Putih No.30 Cilegon | Telp: 0254 393022 | tokoteladancv@gmail.com
            </p>
          </div>

          <div
            className={`w-full ${compact ? 'mb-1.5' : 'mb-3'}`}
            style={{ borderTop: '2.5px solid #cc0000', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } as React.CSSProperties}
          />


          {/* Info */}
          <div className={`grid grid-cols-2 gap-4 ${compact ? 'mb-1.5 text-[10px]' : 'mb-3 text-[12px]'}`}>
            <div className={compact ? 'space-y-0.5' : 'space-y-2'}>
              <div className="flex">
                <span className={compact ? 'w-24' : 'w-32'}>Transaction ID</span>
                <span className="mr-4">:</span>
                <span className="font-bold text-[#cc0000]">{transaction.invoiceNumber}</span>
              </div>
              <div className="flex">
                <span className={compact ? 'w-24' : 'w-32'}>Customer</span>
                <span className="mr-4">:</span>
                <span className="font-bold">{transaction.customerName || 'Pelanggan Umum'}</span>
              </div>
              <div className="flex">
                <span className={compact ? 'w-24' : 'w-32'}>Sales</span>
                <span className="mr-4">:</span>
                <span className="font-bold">{transaction.salesName || '-'}</span>
              </div>
            </div>
            <div className={compact ? 'space-y-0.5' : 'space-y-2'}>
              <div className="flex">
                <span className={compact ? 'w-20' : 'w-24'}>Date</span>
                <span className="mr-4">:</span>
                <span>{formatDate(transaction.createdAt || new Date().toISOString())}</span>
              </div>
              <div className="flex">
                <span className={compact ? 'w-20' : 'w-24'}>Payment</span>
                <span className="mr-4">:</span>
                <span>{transaction.paymentMethod === 'CASH' ? 'Cash' : transaction.paymentMethod}</span>
              </div>
              <div className="flex">
                <span className={compact ? 'w-20' : 'w-24'}>Status</span>
                <span className="mr-4">:</span>
                <span className={`font-bold ${transaction.status === 'DP' ? 'text-[#b45309]' : 'text-[#047857]'}`}>
                  {transaction.status === 'DP' ? 'UANG MUKA (DP)' : 'LUNAS'}
                </span>
              </div>
            </div>
          </div>

          {/* Table */}
          {(() => {
            const hasSize = transaction.items.some(item => item.size);
            const hasMaterial = transaction.items.some(item => item.material);
            const cellPad = compact ? 'py-0.5 px-1.5' : 'py-2 px-3';
            return (
            <table className={`w-full border-collapse border border-black ${compact ? 'text-[9px] mb-1' : 'text-[11px] mb-2'} flex-grow-0`}>
            <thead>
              <tr className="bg-[#000080] text-white">
                <th className={`border border-black ${cellPad} text-center w-10 font-normal`}>No</th>
                <th className={`border border-black ${cellPad} text-center w-64 font-normal`}>Item Name</th>
                {hasSize && <th className={`border border-black ${cellPad} text-center w-20 font-normal`}>Size</th>}
                {hasMaterial && <th className={`border border-black ${cellPad} text-center w-32 font-normal`}>Material</th>}
                <th className={`border border-black ${cellPad} text-center w-16 font-normal`}>Qty</th>
                <th className={`border border-black ${cellPad} text-center w-28 font-normal`}>Price Per Item</th>
                <th className={`border border-black ${cellPad} text-center w-32 font-normal`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {transaction.items.map((item, index) => (
                <tr key={item.id}>
                  <td className={`border border-black ${cellPad} text-center`}>{index + 1}</td>
                  <td className={`border border-black ${cellPad}`}>{item.productName}</td>
                  {hasSize && <td className={`border border-black ${cellPad} text-center`}>{item.size || ''}</td>}
                  {hasMaterial && <td className={`border border-black ${cellPad} text-center`}>{item.material || ''}</td>}
                  <td className={`border border-black ${cellPad} text-center`}>{item.quantity}</td>
                  <td className={`border border-black ${cellPad} text-right`}>{Number(item.unitPrice).toLocaleString('id-ID')}</td>
                  <td className={`border border-black ${cellPad} text-right`}>{Number(item.subtotal).toLocaleString('id-ID')}</td>
                </tr>
              ))}
              </tbody>
            </table>
            );
          })()}

            {/* Notes + Totals */}
            <div className={`flex justify-between mt-auto ${compact ? 'text-[10px]' : 'text-[12px]'}`}>
              <div className="flex-1">
                {transaction.note && (
                  <div className={compact ? 'text-[10px]' : 'text-[12px]'}>
                    <span className="font-bold">Catatan: </span>
                    <span>{transaction.note}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end">
                <div className={`flex ${compact ? 'w-[300px]' : 'w-[350px]'}`}>
                  <div className={`flex-1 flex items-center justify-end font-bold pr-4 ${compact ? 'py-0.5' : 'py-2'}`}>GRAND TOTAL</div>
                  <div className={`border border-black bg-[#e5e7eb] ${compact ? 'py-0.5 px-3' : 'py-2 px-4'} font-bold text-center ${compact ? 'w-[150px]' : 'w-[180px]'}`}>
                    Rp {Number(transaction.total).toLocaleString('id-ID')}
                  </div>
                </div>
                <div className={`flex ${compact ? 'w-[300px]' : 'w-[350px]'}`}>
                  <div className={`flex-1 flex items-center justify-end font-bold pr-4 ${compact ? 'py-0.5' : 'py-2'}`}>
                    {transaction.status === 'DP' ? 'UANG MUKA' : 'TUNAI'}
                  </div>
                  <div className={`border-l border-r border-b border-black ${compact ? 'py-0.5 px-3' : 'py-2 px-4'} font-bold text-center ${compact ? 'w-[150px]' : 'w-[180px]'}`}>
                    Rp {Number(transaction.amountPaid).toLocaleString('id-ID')}
                  </div>
                </div>
                <div className={`flex ${compact ? 'w-[300px]' : 'w-[350px]'}`}>
                  <div className={`flex-1 flex items-center justify-end font-bold pr-4 ${compact ? 'py-0.5' : 'py-2'}`}>
                    {transaction.status === 'DP' ? 'SISA' : 'KEMBALI'}
                  </div>
                  <div className={`border-l border-r border-b border-black ${compact ? 'py-0.5 px-3' : 'py-2 px-4'} font-bold text-center ${compact ? 'w-[150px]' : 'w-[180px]'} ${transaction.status === 'DP' ? 'text-[#b45309]' : ''}`}>
                    Rp {transaction.status === 'DP'
                      ? (Number(transaction.total) - Number(transaction.amountPaid)).toLocaleString('id-ID')
                      : Number(transaction.change).toLocaleString('id-ID')
                    }
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

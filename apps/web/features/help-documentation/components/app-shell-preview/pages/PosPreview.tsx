import React from "react";
import { Banknote, CalendarDays, Check, DollarSign, Pencil, Search, ShoppingCart, WalletCards } from "lucide-react";

import { GuideTarget } from "../GuideTarget";
import { PreviewButton, PreviewField, PreviewModal, PreviewPageRoot } from "../PreviewPrimitives";
import type { PreviewContext } from "../types";

export function PosPreview(ctx: PreviewContext) {
  const showPayment = ctx.state === "pos-payment";

  return (
    <PreviewPageRoot ctx={ctx} className="bg-white">
      <GuideTarget ctx={ctx} target="pos-primary" className="flex min-h-[768px]">
        <section className="min-w-0 flex-1 bg-surface-50">
          <div className="border-b border-surface-100 bg-white px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex rounded-xl bg-surface-100 p-1">
                <span className="rounded-lg bg-white px-6 py-2.5 text-sm font-black text-surface-950 shadow-sm">Produk</span>
                <span className="px-6 py-2.5 text-sm font-bold text-surface-500">Layanan</span>
              </div>
              <PreviewButton ctx={ctx} target="pos-expense-button" tone="light" icon={WalletCards}>Pengeluaran</PreviewButton>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-500"><Search className="h-5 w-5" />Cari produk, SKU, atau barcode...</div>
          </div>

          <GuideTarget ctx={ctx} target="pos-products" className="grid grid-cols-4 gap-4 p-6">
            {[
              ['Kertas A4 80gsm','Rp68.000','128 rim'],
              ['Tinta Epson Black','Rp95.000','34 botol'],
              ['Art Carton A3','Rp42.000','56 pack'],
              ['Laminating Film','Rp88.000','21 roll'],
              ['Kertas Foto Glossy','Rp55.000','45 pack'],
              ['Amplop Cokelat F4','Rp32.000','73 pack'],
              ['Spiral Binding','Rp18.000','96 box'],
              ['Sticker Vinyl','Rp75.000','28 roll'],
            ].map(([name, price, stock], index) => (
              <article key={name} className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm">
                <div className={`h-24 rounded-xl ${index % 2 ? 'bg-amber-50' : 'bg-blue-50'}`} />
                <h3 className="mt-3 text-sm font-black text-surface-900">{name}</h3><p className="mt-1 text-sm font-bold text-brand-600">{price}</p><p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="h-3 w-3" />Stok tersedia · {stock}</p>
              </article>
            ))}
          </GuideTarget>
        </section>

        <GuideTarget ctx={ctx} target="pos-cart" className="flex w-[340px] shrink-0 flex-col border-l border-surface-200 bg-white">
          <div className="flex items-center justify-between border-b border-surface-100 px-5 py-4"><span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-brand-600" /><h2 className="text-base font-black">Keranjang</h2></span><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700" title="Edit Cepat"><Pencil className="h-4 w-4" /></span></div>
          <div className="flex-1 space-y-3 p-4">
            {[['Kertas A4 80gsm','2','Rp136.000','Rp68.000','Rp64.000','Rp72.000'],['Tinta Epson Black','1','Rp95.000','Rp95.000','Rp90.000','Belum diatur']].map(([name, qty, total, normal, agen, dinas]) => <div key={name} className="rounded-xl border border-surface-100 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">{name}</p><span className="flex gap-1 text-brand-700"><Pencil className="h-3.5 w-3.5" /><DollarSign className="h-3.5 w-3.5" /></span></div><div className="mt-2 grid grid-cols-3 gap-1 text-[9px] text-surface-500"><span>Normal<br/><strong>{normal}</strong></span><span>Agen<br/><strong>{agen}</strong></span><span>Dinas<br/><strong>{dinas}</strong></span></div><div className="mt-2 flex justify-between text-xs"><span>Qty {qty}</span><strong>{total}</strong></div></div>)}
          </div>
          <div className="border-t border-surface-100 p-4"><div className="mb-4 flex justify-between text-sm"><span>Total</span><strong className="text-lg">Rp231.000</strong></div><PreviewButton ctx={ctx} target="pos-pay-button" tone="brand" icon={Banknote} className="w-full">Bayar Sekarang</PreviewButton></div>
        </GuideTarget>
      </GuideTarget>

      {showPayment ? <PaymentModal ctx={ctx} /> : null}
    </PreviewPageRoot>
  );
}

function PaymentModal({ ctx }: { ctx: PreviewContext }) {
  return (
    <PreviewModal ctx={ctx} target="pos-payment-modal" title="Modal Pembayaran" width="max-w-2xl">
      <div data-help-step-state="pos-payment-modal-open" className="space-y-5">
        <div className="rounded-xl bg-brand-50 p-4 text-center"><p className="text-xs font-bold text-brand-700">Total Pembayaran</p><p className="mt-1 text-3xl font-black text-brand-950">Rp231.000</p></div>
        <GuideTarget ctx={ctx} target="pos-payment-method" className="grid grid-cols-4 gap-2">
          {['Tunai','Transfer','QRIS','Debit'].map((method, index) => <span key={method} className={`rounded-xl border p-3 text-center text-xs font-bold ${index === 0 ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-200'}`}>{method}</span>)}
          <span className="col-span-4 text-xs font-bold text-surface-600">Metode Bayar</span>
        </GuideTarget>
        <GuideTarget ctx={ctx} target="pos-invoice-date"><PreviewField label="Tanggal Invoice" value="09 Juli 2026 · 20:31" /></GuideTarget>
        <div className="grid grid-cols-2 gap-3"><span className="rounded-xl border p-3 text-center text-sm font-bold">Simpan Transaksi</span><GuideTarget ctx={ctx} target="pos-print" className="rounded-xl bg-slate-900 p-3 text-center text-sm font-bold text-white">Cetak Struk</GuideTarget></div>
      </div>
    </PreviewModal>
  );
}

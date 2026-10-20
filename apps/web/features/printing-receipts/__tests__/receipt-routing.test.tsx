import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReceiptModal } from "@/components/ReceiptModal";
import type { Transaction } from "@/hooks/useTransactions";

vi.mock("@pos/ui", () => ({Modal:({children}:{children:React.ReactNode})=><section>{children}</section>,Button:()=>null}));
vi.mock("@/hooks/useSettings", () => ({useStoreSettings:()=>({data:{name:"Toko Teladan"}})}));
vi.mock("@/features/transaction-tax/hooks/useReceiptTax", () => ({useReceiptTax:(transaction:Transaction)=>({transaction})}));
vi.mock("@/features/transaction-tax/components/TaxField", () => ({TaxField:()=>null}));
vi.mock("@/components/InvoicePrintModal", () => ({InvoicePrintModal:()=>null}));
vi.mock("@/components/DraftReceiptModal", () => ({DraftReceiptModal:()=>null}));
vi.mock("@/features/surat-jalan/components/SuratJalanBundleButton", () => ({SuratJalanBundleButton:()=>null}));
vi.mock("@/features/printing-receipts/components/PrintingReceiptTransactionModal", () => ({
  PrintingReceiptTransactionModal:()=> <section aria-label="Nota Percetakan asli"/>,
}));

const transaction = {id:"tx-1",invoiceNumber:"PL-20261020-00001",items:[],subtotal:100000,
  discount:0,tax:0,total:100000,paymentMethod:"CASH",amountPaid:25000,change:0,status:"DP",
  createdAt:"2026-10-20T03:00:00Z",customerName:"Pelanggan",note:null,salesName:null,
  salespersonId:null,draftNumber:null} satisfies Transaction;

describe("cetak ulang nota asal", () => {
  it("membuka template asli dari transaksi Percetakan", () => {
    const html=renderToStaticMarkup(<ReceiptModal open onClose={()=>{}} transaction={{...transaction,
      transactionCategory:"PERCETAKAN",printingSubcategory:"PLAT",printingReceipt:{id:"receipt-1",number:"PL-20261020-00001",subcategory:"PLAT"}}}/>);
    expect(html).toContain('aria-label="Nota Percetakan asli"');
    expect(html).not.toContain('id="print-receipt"');
  });
  it("tetap memakai nota umum untuk transaksi ATK", () => {
    const html=renderToStaticMarkup(<ReceiptModal open onClose={()=>{}} transaction={{...transaction,transactionCategory:"ATK"}}/>);
    expect(html).toContain('id="print-receipt"');
    expect(html).not.toContain('aria-label="Nota Percetakan asli"');
  });
});

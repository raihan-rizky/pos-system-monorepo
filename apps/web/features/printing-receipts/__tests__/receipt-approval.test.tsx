import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import {PrintingReceiptApprovalModal, buildPrintingReceiptApprovalInput} from "../components/PrintingReceiptApprovalModal";
import type {Transaction} from "@/hooks/useTransactions";

vi.mock("@pos/ui",()=>({Modal:({children}:{children:React.ReactNode})=><section>{children}</section>,Button:({children}:{children:React.ReactNode})=><button>{children}</button>}));
vi.mock("@/hooks/useTransactions",()=>({useApproveTransaction:()=>({mutateAsync:vi.fn(),isPending:false})}));

const tx={id:"tx-1",printingSubcategory:"PLAT",invoiceNumber:"PL-20261020-00001",total:100000,amountPaid:25000,
  paymentMethod:"CASH",payments:[{method:"CASH",amount:15000},{method:"TRANSFER",amount:10000}],
  items:[{productName:"Plat nomor pesanan",quantity:2,unitPrice:50000,subtotal:100000}],status:"PENDING_APPROVAL"} as Transaction;

describe("persetujuan nota tersimpan",()=>{
  it("memakai pembayaran tersimpan dan mengizinkan sisa DP tanpa mengirim ulang item/harga",()=>{
    expect(buildPrintingReceiptApprovalInput(tx)).toEqual({id:"tx-1",isPayLater:true});
  });
  it("tidak mengubah pembayaran terpisah saat sudah lunas",()=>{
    expect(buildPrintingReceiptApprovalInput({...tx,amountPaid:100000})).toEqual({id:"tx-1",isPayLater:false});
  });
  it("menampilkan konfirmasi nota asli tanpa editor item atau tanggal",()=>{
    const html=renderToStaticMarkup(<PrintingReceiptApprovalModal tx={tx} onClose={()=>{}} onSuccess={()=>{}}/>);
    expect(html).toContain("PL-20261020-00001");
    expect(html).toContain("Plat nomor pesanan");
    expect(html).toContain("Setujui nota");
    expect(html).not.toContain("<input");
  });
});

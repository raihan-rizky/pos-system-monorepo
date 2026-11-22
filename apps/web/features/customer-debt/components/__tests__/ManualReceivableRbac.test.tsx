import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
vi.mock("../../hooks/useCustomerReceivables",()=>({
  useCustomerReceivables:()=>({data:{data:[{id:"d1",customerId:"c1",customer:{id:"c1",name:"Budi"},amount:100,amountPaid:0,debtDate:"2026-11-10",dueDate:"2026-11-11",payments:[]}],pagination:{total:1,totalPages:1}},isLoading:false}),
  useCreateCustomerReceivable:()=>({}),usePayCustomerReceivable:()=>({})
}));
import {CustomerReceivablesSection} from "../CustomerReceivablesSection";
it("defaults manual piutang to view-only",()=>{
  const html=renderToStaticMarkup(<CustomerReceivablesSection customerId="c1"/>);
  expect(html).not.toContain('Tambah Piutang');expect(html).not.toContain('Bayar Piutang');
});
it("uses independent explicit add and pay grants",()=>{
  const html=renderToStaticMarkup(<CustomerReceivablesSection customerId="c1" canAdd canPay/>);
  expect(html).toContain('Tambah Piutang');expect(html).toContain('Bayar Piutang');
});

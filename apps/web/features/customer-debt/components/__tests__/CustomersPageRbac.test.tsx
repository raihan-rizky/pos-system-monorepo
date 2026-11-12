import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach,expect,it,vi} from "vitest";
import {buildDefaultRolePermissions,canRolePerformAction} from "@/features/rbac/helpers/rbac-core";
const m=vi.hoisted(()=>({can:vi.fn(),customers:vi.fn()}));
vi.mock("@/components/providers/RoleProvider",()=>({useRole:()=>({canPerform:m.can})}));
vi.mock("@/hooks/useCustomers",()=>({useCustomers:m.customers,useDeleteCustomer:()=>({}),useCustomerDetail:()=>({}),useCreateCustomer:()=>({}),useUpdateCustomer:()=>({}),usePayTransactionDebt:()=>({}),useCustomerDpTransactions:()=>({})}));
vi.mock("@/hooks/useDebounce",()=>({useDebounce:(v:unknown)=>v}));
vi.mock("@/features/ai-assistant/hooks/useAssistantModalAction",()=>({useAssistantModalAction:()=>{}}));
vi.mock("next/dynamic",()=>({default:(loader:()=>unknown)=>{
  const source=loader.toString();
  return (props: {canPay?:boolean})=><div data-section={source.includes("DebtTransactionsList")?"invoices":source.includes("CustomerRecapSection")?"recap":"other"} data-can-pay={String(props.canPay)}/>;
}}));
vi.mock("../CustomerReceivablesSection",()=>({CustomerReceivablesSection:(props:{canPay?:boolean})=><div data-section="manual" data-can-pay={String(props.canPay)}/>}));
import CustomersClientPage from "@/app/(main)/customers/CustomersClientPage";
beforeEach(()=>{vi.resetAllMocks();m.customers.mockReturnValue({data:{data:[],pagination:{total:0,totalPages:1}},isLoading:false,isFetching:false});});
it.each(["SALES","CASHIER"] as const)("defaults %s to profile access and view-only debt",role=>{
  const permissions=buildDefaultRolePermissions();m.can.mockImplementation((r,a)=>canRolePerformAction(role,r,a,permissions));
  const html=renderToStaticMarkup(<CustomersClientPage/>);
  expect(html).toContain('role="tab"');expect(html).toContain('>Piutang</span>');
  expect(html).not.toContain('data-can-pay="true"');
});
it("hides debt tabs, badges, and metrics when only customer-profile reading is granted",()=>{
  m.customers.mockReturnValue({data:{data:[{id:"customer-1",name:"Pelanggan A",type:"UMUM",phone:null,email:null,company:null,lastVisitAt:null,totalDebt:0,totalSpent:10000,totalOrders:1}],pagination:{total:1,totalPages:1,page:1}},isLoading:false,isFetching:false});
  m.can.mockImplementation((r,a)=>r==="customer" && a==="read");
  const html=renderToStaticMarkup(<CustomersClientPage/>);
  expect(html).toContain("Pelanggan A");expect(html).not.toContain('>Piutang</span>');expect(html).not.toContain('>Piutang</p>');expect(html).not.toContain('data-section="manual"');
});
it("starts debt-only accounts on Piutang without profile or recap queries",()=>{
  m.can.mockImplementation((r,a)=>r==="customer.receivable" && a==="read");
  const html=renderToStaticMarkup(<CustomersClientPage/>);
  expect(html).toContain('data-section="invoices"');expect(html).toContain('data-section="manual"');
  expect(html).not.toContain('data-section="recap"');expect(html).not.toContain('Semua Pelanggan');
  expect(m.customers).toHaveBeenCalledWith(expect.objectContaining({enabled:false}));
});

import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission:vi.fn(), page:vi.fn(), customer:vi.fn(), legacy:vi.fn(), linked:vi.fn(), history:vi.fn(), write:vi.fn(), remove:vi.fn(), unlink:vi.fn(), transaction:vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({requirePermission:m.permission,canAuthenticatedUserAccessPage:m.page,canAuthenticatedUserPerform:async()=>true,handleAuthError:(e: unknown)=>e instanceof Error ? new Response(null,{status:403}):null,AuthError:class extends Error { constructor(public statusCode: number, message: string) { super(message); } }}));
vi.mock("@pos/db", () => ({db:{customer:{findFirst:m.customer,update:m.write},$transaction:m.transaction}}));
import { PATCH, DELETE } from "@/app/api/customers/[id]/route";
const debt = {id:"tx",customerId:null,customerName:"Budi",status:"DP",paymentMethod:"CASH",total:100,amountPaid:25};
const context={params:Promise.resolve({id:"c1"})};
const request=(body: unknown)=>new Request("http://localhost",{method:"PATCH",body:JSON.stringify(body)});
beforeEach(()=>{
  vi.resetAllMocks();
  m.permission.mockImplementation(async(resource: string)=>{if(resource==="customer.receivable")throw new Error("Forbidden");return{id:"sales",role:"SALES",storeId:"store"};});
  m.page.mockResolvedValue(true);
  m.customer.mockImplementation(async({where})=>where.phone ? null : {id:"c1",name:"Budi"});m.legacy.mockResolvedValue([debt]);m.linked.mockResolvedValue([]);m.history.mockResolvedValue(0);
  m.write.mockResolvedValue({id:"c1",name:"Agus"});m.unlink.mockResolvedValue({count:1});
  m.transaction.mockImplementation(fn=>fn({$queryRaw:vi.fn().mockResolvedValue([{id:"c1"}]),$queryRawUnsafe:vi.fn().mockResolvedValue([{id:"tx"}]),customer:{findFirst:m.customer,update:m.write,delete:m.remove},transaction:{findMany:m.legacy,updateMany:m.unlink},customerReceivable:{count:async()=>0},debtPaymentLog:{count:m.history}}));
});
it("blocks legacy name reassignment without receivable-edit access",async()=>{
  expect((await PATCH(request({name:"Agus"}),context)).status).toBe(403);
  expect(m.write).not.toHaveBeenCalled();
});
it("keeps ordinary profile editing available when the name has no debt attribution",async()=>{
  expect((await PATCH(request({phone:"081234"}),context)).status).toBe(200);
  expect(m.write).toHaveBeenCalled();
  expect(m.page).not.toHaveBeenCalled();
});
it("requires Pelanggan page access before receivable permissions for attributed debt changes",async()=>{
  m.page.mockResolvedValue(false);
  const response=await PATCH(request({name:"Agus"}),context);
  expect(response.status).toBe(403);
  expect(m.page).toHaveBeenCalledWith({id:"sales",role:"SALES",storeId:"store"},"/customers");
  expect(m.permission).not.toHaveBeenCalledWith("customer.receivable","read");
  expect(m.permission).not.toHaveBeenCalledWith("customer.receivable","update");
  expect(m.write).not.toHaveBeenCalled();
});
it("protects invoice debt attribution when deleting a customer",async()=>{
  m.legacy.mockResolvedValue([{...debt,customerId:"c1"}]);
  expect((await DELETE(request({}),context)).status).toBe(403);
  expect(m.unlink).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();
});
it("protects settled payment history from cascading customer deletion",async()=>{
  m.legacy.mockResolvedValue([]);m.history.mockResolvedValue(1);
  expect((await DELETE(request({}),context)).status).toBe(403);
  expect(m.remove).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), find: vi.fn(), locked: vi.fn(), write: vi.fn(), customer: vi.fn(), stock: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: m.permission, getCurrentUser: async () => ({id:"sales", role:"SALES", storeId:"store"}),
  handleAuthError: (e: unknown) => e instanceof Error && e.message === "Forbidden" ? Response.json({message:"Forbidden"},{status:403}) : null,
}));
vi.mock("@pos/db", () => ({ db: { transaction: {findFirst: m.find}, $transaction: m.transaction } }));
vi.mock("@/features/product-stock-groups/stock-mutations", () => ({applyProductStockDeltas:m.stock, StockMutationError:class extends Error {}}));
vi.mock("@/features/receipt-changes/server/receipt-change-audit", () => ({shouldRecordReceiptChange:() => false, captureReceiptSnapshot:vi.fn(), recordReceiptChange:m.audit}));
import { PATCH as items } from "@/app/api/transactions/[id]/items/route";
import { PATCH as tax } from "@/app/api/transactions/[id]/tax/route";

const row = {id:"tx",storeId:"store",customerId:"c1",customerName:"Budi",status:"DP",paymentMethod:"CASH",subtotal:100,discount:0,tax:0,taxRate:0,taxMethod:"STANDARD",total:100,amountPaid:25,change:0,stockDeductionSource:"TRANSACTION",items:[{id:"i1",productId:"p1",productName:"Kertas",quantity:1,unitPrice:100,appliedUnitPrice:100,originalUnitPrice:100,discount:0,subtotal:100}]};
const context = {params:Promise.resolve({id:"tx"})};
const request = (body: unknown) => new Request("http://localhost",{method:"PATCH",body:JSON.stringify(body)});
beforeEach(() => {
  vi.resetAllMocks();
  m.permission.mockImplementation(async (resource: string) => {if(resource.startsWith("customer.receivable")) throw new Error("Forbidden"); return {id:"sales", role:"SALES",storeId:"store"};});
  m.find.mockResolvedValue(row); m.locked.mockResolvedValue(row); m.write.mockResolvedValue({count:1});
  m.transaction.mockImplementation(fn => fn({$queryRaw:vi.fn().mockResolvedValue([{id:"tx"}]),$queryRawUnsafe:vi.fn().mockResolvedValue([{id:"tx"}]),transaction:{findFirst:m.locked,update:m.write,updateMany:m.write},customer:{updateMany:m.customer},suratJalanItem:{findMany:vi.fn().mockResolvedValue([])},inventoryLog:{findMany:vi.fn().mockResolvedValue([])}}));
});
it("rejects item corrections before changing stock, invoices, customers or audit", async () => {
  const response = await items(request({items:[{sourceItemId:"i1",productId:"p1",productName:"Kertas",quantity:2,unitPrice:100,appliedUnitPrice:100,originalUnitPrice:100,subtotal:200}]}),context);
  expect(response.status).toBe(403);
  expect(m.stock).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled(); expect(m.customer).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
});
it("rejects tax corrections before any invoice or customer write", async () => {
  const response = await tax(request({taxRate:10,expected:{total:100,tax:0,taxRate:0,taxMethod:"STANDARD",amountPaid:25,change:0,status:"DP"}}),context);
  expect(response.status).toBe(403); expect(m.write).not.toHaveBeenCalled(); expect(m.customer).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
});
it("rejects a payment that changes between preview and locked item edit", async () => {
  m.locked.mockResolvedValue({...row,amountPaid:50});
  expect((await items(request({items:[{sourceItemId:"i1",productId:"p1",productName:"Kertas",quantity:2,unitPrice:100,appliedUnitPrice:100,originalUnitPrice:100,subtotal:200}]}),context)).status).toBe(409);
  expect(m.stock).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled(); expect(m.customer).not.toHaveBeenCalled();
});

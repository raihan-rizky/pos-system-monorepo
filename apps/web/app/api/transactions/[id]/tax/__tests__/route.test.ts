import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(), permission: vi.fn(), find: vi.fn(), update: vi.fn(), customer: vi.fn(), raw: vi.fn(), transaction: vi.fn(), auth: vi.fn(),
}));
vi.mock("@pos/db", () => ({ db: { transaction: { findFirst: mocks.find }, $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ getCurrentUser: mocks.currentUser, requirePermission: mocks.permission, handleAuthError: mocks.auth }));
import { GET, PATCH } from "../route";

const base = { id: "tx-1", storeId: "store-1", customerId: "customer-1", subtotal: 706000, discount: 0, tax: 0, taxRate: null, taxMethod: "STANDARD", total: 706000, amountPaid: 706000, change: 0, status: "COMPLETED", paymentMethod: "CASH" };
const context = { params: Promise.resolve({ id: "tx-1" }) };
function expected(row = base) {
  return { total: row.total, tax: row.tax, taxRate: row.taxRate, taxMethod: row.taxMethod, amountPaid: row.amountPaid, change: row.change, status: row.status };
}
function request(taxRate: number, row = base) { return new Request("http://localhost/api/transactions/tx-1/tax", { method: "PATCH", body: JSON.stringify({ taxRate, expected: expected(row) }) }); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue(null);
  mocks.currentUser.mockResolvedValue({ id: "user-1", storeId: "store-1" });
  mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
  mocks.find.mockResolvedValue(base);
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.customer.mockResolvedValue({ count: 1 });
  mocks.raw.mockResolvedValue([]);
  mocks.transaction.mockImplementation(callback => callback({ transaction: { findFirst: mocks.find, updateMany: mocks.update }, customer: { updateMany: mocks.customer }, $queryRawUnsafe: mocks.raw }));
});

describe("transaction tax endpoint", () => {
  it("keeps read-only receipt access for surat jalan users without tax editing permission", async () => {
    const forbidden = new Error("forbidden");
    mocks.permission.mockImplementation(async (resource: string) => { if (resource !== "surat_jalan") throw forbidden; });
    mocks.auth.mockImplementation((error: unknown) => error === forbidden ? new Response(null, { status: 403 }) : null);
    expect((await GET(new Request("http://localhost"), context)).status).toBe(200);
    expect((await PATCH(request(12), context)).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("requires a customer before creating new debt on a paid anonymous receipt", async () => {
    mocks.find.mockResolvedValue({ ...base, customerId: null });
    const response = await PATCH(request(12), context);
    expect(response.status).toBe(422);
    expect((await response.json()).message).toMatch(/pelanggan/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("loads only the current store and requires read access", async () => {
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "tx-1", storeId: "store-1" } }));
    expect(mocks.permission).toHaveBeenCalledWith("transaction", "read");
  });
  it("adds tax and customer debt atomically without inventing a payment", async () => {
    const response = await PATCH(request(12), context);
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ taxRate: 12, taxMethod: "STANDARD", tax: 84720, total: 790720, status: "DP", amountPaid: 706000 }) }));
    expect(mocks.customer).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalDebt: { increment: 84720 } }) }));
  });
  it("preserves tender and change when saving the same zero tax", async () => {
    const row = { ...base, subtotal: 90000, total: 90000, amountPaid: 100000, change: 10000 };
    mocks.find.mockResolvedValue(row);
    expect((await PATCH(request(0, row), context)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountPaid: 100000, change: 10000, total: 90000 }) }));
    expect(mocks.customer).not.toHaveBeenCalled();
  });
  it("stores the DPP method on drafts without booking customer debt", async () => {
    const draft = { ...base, status: "DRAFT", amountPaid: 0 };
    mocks.find.mockResolvedValue(draft);
    expect((await PATCH(request(12, draft), context)).status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("transaction.draft", "update");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ taxMethod: "DPP_NILAI_LAIN", tax: 77660, total: 783660, status: "DRAFT" }) }));
    expect(mocks.customer).not.toHaveBeenCalled();
  });
  it.each([-1, 101, 1.234])("rejects invalid rate %s", async rate => {
    expect((await PATCH(request(rate), context)).status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects stale snapshots", async () => {
    mocks.find.mockResolvedValue({ ...base, total: 800000 });
    expect((await PATCH(request(12), context)).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects concurrent writes and cancelled invoices", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    expect((await PATCH(request(12), context)).status).toBe(409);
    mocks.find.mockResolvedValue({ ...base, status: "VOIDED" });
    expect((await PATCH(request(12), context)).status).toBe(409);
  });
  it("does not expose another store's invoice", async () => {
    mocks.find.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), context)).status).toBe(404);
  });
  it("requires authentication", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect((await PATCH(request(12), context)).status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });
});

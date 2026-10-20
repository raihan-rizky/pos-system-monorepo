import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";
import { POST as PAY } from "../[id]/payments/route";
import { ReceivableError } from "@/features/customer-debt/helpers/manual-receivables";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), customer: vi.fn(), findMany: vi.fn(), count: vi.fn(), transaction: vi.fn(), create: vi.fn(), pay: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@pos/db", () => ({ db: { customer: { findFirst: mocks.customer }, customerReceivable: { findMany: mocks.findMany, count: mocks.count, fields: { amount: "AMOUNT_FIELD" } }, $transaction: mocks.transaction } }));
vi.mock("@/features/customer-debt/helpers/manual-receivables", async (original) => ({ ...await original<object>(), createReceivable: mocks.create, payReceivable: mocks.pay }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

const body = { customerId: "customer-1", amount: 100000, debtDate: "2026-09-01", dueDate: "2026-10-01", clientMutationId: "9e70ff2c-9401-4edb-91a6-d0637ed226ad" };
function request(payload: unknown) { return new Request("http://localhost/api/customer-receivables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
describe("customer receivables API", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" }); mocks.authError.mockReturnValue(null);
    mocks.customer.mockResolvedValue({ id: "customer-1" }); mocks.findMany.mockResolvedValue([]); mocks.count.mockResolvedValue(0);
    mocks.transaction.mockImplementation((callback) => callback("transaction-client")); mocks.create.mockResolvedValue({ id: "debt-1" }); mocks.pay.mockResolvedValue({ id: "debt-1", amountPaid: "50000" });
  });
  it("creates manual debt in an atomic transaction with customer update permission", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(201);
    expect(mocks.permission).toHaveBeenCalledWith("customer", "update");
    expect(mocks.create).toHaveBeenCalledWith("transaction-client", body, { id: "user-1", storeId: "store-1" });
  });
  it("rejects impossible dates before opening a transaction", async () => {
    expect((await POST(request({ ...body, dueDate: "2026-02-30" }))).status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("handles malformed JSON as a friendly client error", async () => {
    expect((await POST(new Request("http://localhost/api/customer-receivables", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("lists open manual debts only within the current store and with bounded pages", async () => {
    const response = await GET(new Request("http://localhost/api/customer-receivables?page=2&status=open&search=Budi"));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("customer", "read");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-1", amountPaid: { lt: "AMOUNT_FIELD" }, OR: [{ customer: { name: { contains: "Budi", mode: "insensitive" } } }, { note: { contains: "Budi", mode: "insensitive" } }] }, skip: 20, take: 20 }));
    expect(await response.json()).toMatchObject({ data: [], pagination: { page: 2, total: 0, totalPages: 0 } });
  });
  it("does not list a customer's ledger from another store", async () => {
    mocks.customer.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://localhost/api/customer-receivables?customerId=foreign"))).status).toBe(404);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("rejects an invalid page or status without querying private data", async () => {
    expect((await GET(new Request("http://localhost/api/customer-receivables?page=0"))).status).toBe(422);
    expect((await GET(new Request("http://localhost/api/customer-receivables?status=unknown"))).status).toBe(422);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("settles via customer permission and the scoped transaction service", async () => {
    const payment = { amount: 50000, method: "CASH", clientMutationId: body.clientMutationId };
    const response = await PAY(request(payment), { params: Promise.resolve({ id: "debt-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.pay).toHaveBeenCalledWith("transaction-client", "debt-1", payment, { id: "user-1", storeId: "store-1" });
  });
  it("returns auth denial without writing or listing data", async () => {
    mocks.permission.mockRejectedValue(new Error("Forbidden")); mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    expect((await POST(request(body))).status).toBe(403);
    expect((await GET(new Request("http://localhost/api/customer-receivables"))).status).toBe(403);
    expect((await PAY(request({}), { params: Promise.resolve({ id: "debt-1" }) })).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("defaults customer history to all entries with stable bounded pagination", async () => {
    mocks.count.mockResolvedValueOnce(41);
    const response = await GET(new Request("http://localhost/api/customer-receivables?customerId=customer-1&page=3"));
    expect(await response.json()).toEqual({ data: [], pagination: { page: 3, total: 41, totalPages: 3 } });
    expect(mocks.customer).toHaveBeenCalledWith({ where: { id: "customer-1", storeId: "store-1" }, select: { id: true } });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-1", customerId: "customer-1" }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], skip: 40, take: 20 }));
  });

  it("defaults the global list to open debts and does not look up an arbitrary customer", async () => {
    await GET(new Request("http://localhost/api/customer-receivables"));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-1", amountPaid: { lt: "AMOUNT_FIELD" } }, skip: 0, take: 20 }));
    expect(mocks.customer).not.toHaveBeenCalled();
  });

  it.each(["page=-1", "page=1.5", "page=1000001", "page=NaN", "search=" + "x".repeat(101), "customerId="])("rejects invalid list bounds %s", async query => {
    expect((await GET(new Request(`http://localhost/api/customer-receivables?${query}`))).status).toBe(422);
    expect(mocks.count).not.toHaveBeenCalled(); expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("binds creation to the authenticated actor and ignores forged balance fields", async () => {
    const response = await POST(request({ ...body, storeId: "other-store", createdById: "other-user", amountPaid: 99000, note: "  Utang lama  " }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith("transaction-client", { ...body, note: "Utang lama" }, { id: "user-1", storeId: "store-1" });
  });

  it.each([0, -1, 0.001, 10000000000])("rejects invalid payment amount %s before opening a transaction", async amount => {
    const response = await PAY(request({ amount, method: "CASH", clientMutationId: body.clientMutationId }), { params: Promise.resolve({ id: "debt-1" }) });
    expect(response.status).toBe(422); expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid payment JSON and unsupported methods without writing", async () => {
    const params = { params: Promise.resolve({ id: "debt-1" }) };
    expect((await PAY(new Request("http://localhost/payment", { method: "POST", body: "{" }), params)).status).toBe(400);
    expect((await PAY(request({ amount: 1, method: "TEMPO", clientMutationId: body.clientMutationId }), params)).status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([404, 409])("preserves ledger service status %s and its friendly message", async status => {
    const failure = new ReceivableError("Saldo piutang berubah.", status);
    mocks.create.mockRejectedValueOnce(failure); mocks.pay.mockRejectedValueOnce(failure);
    const created = await POST(request(body));
    const paid = await PAY(request({ amount: 1, method: "CASH", clientMutationId: body.clientMutationId }), { params: Promise.resolve({ id: "debt-1" }) });
    expect(created.status).toBe(status); expect(paid.status).toBe(status);
    expect(await created.json()).toEqual({ message: failure.message }); expect(await paid.json()).toEqual({ message: failure.message });
  });

  it("returns a retry conflict for unique mutation collisions on either write endpoint", async () => {
    mocks.create.mockRejectedValueOnce({ code: "P2002" }); mocks.pay.mockRejectedValueOnce({ code: "P2002" });
    expect((await POST(request(body))).status).toBe(409);
    expect((await PAY(request({ amount: 1, method: "CASH", clientMutationId: body.clientMutationId }), { params: Promise.resolve({ id: "debt-1" }) })).status).toBe(409);
  });

  it("keeps unexpected database details out of public errors", async () => {
    const failure = new Error("PRIVATE_DATABASE_FAILURE");
    mocks.findMany.mockRejectedValueOnce(failure); mocks.create.mockRejectedValueOnce(failure); mocks.pay.mockRejectedValueOnce(failure);
    const responses = [await GET(new Request("http://localhost/api/customer-receivables")), await POST(request(body)), await PAY(request({ amount: 1, method: "CASH", clientMutationId: body.clientMutationId }), { params: Promise.resolve({ id: "debt-1" }) })];
    for (const response of responses) { expect(response.status).toBe(500); expect(await response.text()).not.toContain(failure.message); }
  });
});

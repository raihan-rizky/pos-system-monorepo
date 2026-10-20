import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";
import { GET as getOne, PATCH, DELETE } from "../[id]/route";

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(), requireRole: vi.fn(), canRolePerformAction: vi.fn(),
  findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(),
  updateMany: vi.fn(), deleteMany: vi.fn(), counter: vi.fn(), invoiceFind: vi.fn(),
  customerFind: vi.fn(), productFind: vi.fn(), stockUpdate: vi.fn(), transactionCreate: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@pos/db", () => {
  const client = {
    printingReceipt: { findFirst: h.findFirst, findUnique: h.findUnique, findMany: h.findMany,
      count: h.count, create: h.create, updateMany: h.updateMany, deleteMany: h.deleteMany },
    printingReceiptCounter: { upsert: h.counter },
    transaction: { findUnique: h.invoiceFind, create: h.transactionCreate },
    customer: { findFirst: h.customerFind }, product: { findMany: h.productFind, update: h.stockUpdate },
  };
  return { db: { ...client, $transaction: h.transaction }, Prisma: {} };
});
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: h.requirePermission, requireRole: h.requireRole,
  AuthError: class AuthError extends Error { constructor(public statusCode: number, message: string) { super(message); } },
  handleAuthError: (error: { statusCode?: number; message?: string }) => error.statusCode
    ? Response.json({ message: error.message }, { status: error.statusCode }) : null,
}));
vi.mock("@/features/rbac/helpers/rbac-core", () => ({ canRolePerformAction: h.canRolePerformAction }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: vi.fn().mockResolvedValue({}) }));

const document = { customerName: "Pelanggan", customerPhone: "", customerId: null,
  date: "2026-10-20", note: "", completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "",
  lines: [{ id: "l1", name: "Cetak bebas", material: "Kertas", quantity: 1, price: 2000, stockLink: null }] };
const record = (overrides: Record<string, unknown> = {}) => ({ id: "r1", storeId: "s1", subcategory: "SPANDUK",
  number: "NT-SP-20261020-000001", revision: 1, document, createdById: "u1", transactionId: null,
  transaction: null, createdAt: new Date("2026-10-20T01:00:00Z"), updatedAt: new Date("2026-10-20T01:00:00Z"), ...overrides });
const params = (id = "r1") => ({ params: Promise.resolve({ id }) });
const request = (method: string, body?: unknown, suffix = "") => new Request(`http://localhost/api/printing-receipts${suffix}`, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

beforeEach(() => {
  vi.clearAllMocks();
  const user = { id: "u1", storeId: "s1", role: "CASHIER", name: "Kasir" };
  h.requirePermission.mockResolvedValue(user); h.requireRole.mockResolvedValue(user); h.canRolePerformAction.mockReturnValue(true);
  h.findFirst.mockResolvedValue(record()); h.findUnique.mockResolvedValue(null); h.findMany.mockResolvedValue([record()]);
  h.count.mockResolvedValue(1); h.create.mockImplementation(async ({ data }) => record(data));
  h.updateMany.mockResolvedValue({ count: 1 }); h.deleteMany.mockResolvedValue({ count: 1 });
  h.counter.mockResolvedValue({ key: "20261020", value: 1 }); h.invoiceFind.mockResolvedValue(null);
  h.customerFind.mockResolvedValue({ id: "c1" }); h.productFind.mockResolvedValue([]);
  h.transaction.mockImplementation(async callback => callback({
    printingReceipt: { findFirst: h.findFirst, findUnique: h.findUnique, findMany: h.findMany,
      count: h.count, create: h.create, updateMany: h.updateMany, deleteMany: h.deleteMany },
    printingReceiptCounter: { upsert: h.counter }, transaction: { findUnique: h.invoiceFind, create: h.transactionCreate },
    customer: { findFirst: h.customerFind }, product: { findMany: h.productFind, update: h.stockUpdate },
  }));
});

describe("printing receipts API", () => {
  it.each([["SPANDUK", "SP"], ["PERCETAKAN", "CT"], ["PLAT", "PL"], ["STEMPEL", "ST"], ["PRINT", "PR"]])("persists an empty %s receipt with its own number prefix", async (subcategory, prefix) => {
    const response = await POST(request("POST", { subcategory }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ subcategory, storeId: "s1", transactionId: null, document: { lines: [] } });
    expect(body.number).toMatch(new RegExp(`^NT-${prefix}-\\d{8}-000001$`));
  });
  it.each(["{", "null", "[]", "42", '"nota"'])("rejects malformed or non-object JSON %s without a write", async body => {
    const response = await POST(new Request("http://localhost/api/printing-receipts", { method: "POST", body }));
    expect(response.status).toBe(422);
    expect(h.transaction).not.toHaveBeenCalled();
  });
  it("rejects oversized JSON before allocation or persistence", async () => {
    const response = await POST(new Request("http://localhost/api/printing-receipts", { method: "POST", body: JSON.stringify({ subcategory: "PRINT", note: "x".repeat(250001) }) }));
    expect(response.status).toBe(422);
    expect(h.counter).not.toHaveBeenCalled();
  });
  it.each([undefined, null, "1", 0, -1, 1.5, 2_147_483_647, Number.MAX_SAFE_INTEGER])("rejects invalid PATCH revision %j before a database write", async revision => {
    const response = await PATCH(request("PATCH", { revision, number: "PL-1", document }), params());
    expect(response.status).toBe(422);
    expect(h.updateMany).not.toHaveBeenCalled();
  });
  it.each(["", "0", "-1", "1.5", "NaN", "2147483647"])("rejects invalid DELETE revision %j before deletion", async revision => {
    expect((await DELETE(request("DELETE", undefined, `/r1?revision=${revision}`), params())).status).toBe(422);
    expect(h.deleteMany).not.toHaveBeenCalled();
  });
  it.each([undefined, null, "", "spanduk", "UNKNOWN"])("rejects an unavailable receipt subtype %j", async subcategory => {
    expect((await POST(request("POST", { subcategory }))).status).toBe(422);
    expect(h.create).not.toHaveBeenCalled();
  });
  it("caps list size and rejects an oversized search", async () => {
    expect((await GET(request("GET", undefined, "?subcategory=STEMPEL&limit=999"))).status).toBe(200);
    expect(h.findMany.mock.calls[0][0].take).toBe(50);
    h.findMany.mockClear();
    expect((await GET(request("GET", undefined, `?subcategory=STEMPEL&search=${"x".repeat(201)}`))).status).toBe(422);
    expect(h.findMany).not.toHaveBeenCalled();
  });
  it("retries a database unique collision with a fresh counter", async () => {
    h.create.mockRejectedValueOnce({ code: "P2002" });
    h.counter.mockResolvedValueOnce({ value: 1 }).mockResolvedValueOnce({ value: 2 });
    const response = await POST(request("POST", { subcategory: "PLAT" }));
    expect(response.status).toBe(201);
    expect((await response.json()).number).toMatch(/000002$/);
  });
  it("returns a retryable conflict when unique collisions persist", async () => {
    h.create.mockRejectedValue({ code: "P2002" });
    expect((await POST(request("POST", { subcategory: "PLAT" }))).status).toBe(409);
    expect(h.create).toHaveBeenCalledTimes(4);
  });
  it("rejects deletion if another save wins the revision comparison", async () => {
    h.deleteMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(request("DELETE", undefined, "/r1?revision=1"), params())).status).toBe(409);
  });
  it("creates a blank draft with an atomic counter without sales or stock mutation", async () => {
    const response = await POST(request("POST", { subcategory: "SPANDUK" }));
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toMatchObject({ subcategory: "SPANDUK", revision: 1, transactionId: null, document: { lines: [] } });
    expect(data.number).toMatch(/^NT-SP-\d{8}-000001$/);
    expect(h.counter).toHaveBeenCalledWith(expect.objectContaining({ update: { value: { increment: 1 } } }));
    expect(h.create.mock.calls[0][0].data).toMatchObject({ storeId: "s1", createdById: "u1" });
    expect(h.transactionCreate).not.toHaveBeenCalled(); expect(h.stockUpdate).not.toHaveBeenCalled();
  });

  it("allocates again when an existing transaction owns the automatic candidate", async () => {
    h.counter.mockResolvedValueOnce({ value: 1 }).mockResolvedValueOnce({ value: 2 });
    h.invoiceFind.mockResolvedValueOnce({ id: "tx1" }).mockResolvedValueOnce(null);
    const response = await POST(request("POST", { subcategory: "SPANDUK" }));
    expect(response.status).toBe(201);
    expect((await response.json()).number).toMatch(/000002$/);
  });

  it("lists only current store and selected subtab with server pagination and search", async () => {
    const response = await GET(request("GET", undefined, "?subcategory=PLAT&search=ACME&page=2&limit=5"));
    expect(response.status).toBe(200);
    expect(h.findMany.mock.calls[0][0]).toMatchObject({ where: { storeId: "s1", subcategory: "PLAT" }, skip: 5, take: 5 });
    expect(h.count.mock.calls[0][0].where).toEqual(h.findMany.mock.calls[0][0].where);
    expect(h.findMany.mock.calls[0][0].where.OR).toEqual(expect.arrayContaining([{ number: { contains: "ACME", mode: "insensitive" } }]));
    expect((await response.json()).pagination).toMatchObject({ total: 1, page: 2, limit: 5 });
    expect(h.requirePermission).toHaveBeenCalledWith("transaction", "read");
  });

  it("hides records belonging to another store on read, write and delete", async () => {
    h.findFirst.mockResolvedValue(null);
    for (const [handler, req] of [
      [getOne, request("GET")], [PATCH, request("PATCH", { revision: 1, number: "CUSTOM-1", document })],
      [DELETE, request("DELETE", undefined, "/r1?revision=1")],
    ] as const) expect((await handler(req, params())).status).toBe(404);
    for (const [args] of h.findFirst.mock.calls) expect(args.where).toMatchObject({ id: "r1", storeId: "s1" });
    expect(h.updateMany).not.toHaveBeenCalled(); expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it("saves document and custom number using optimistic concurrency", async () => {
    h.findFirst.mockResolvedValueOnce(record()).mockResolvedValueOnce(record({ revision: 2, number: "CUSTOM-1" }));
    const response = await PATCH(request("PATCH", { revision: 1, number: "CUSTOM-1", document }), params());
    expect(response.status).toBe(200);
    expect((await response.json()).revision).toBe(2);
    expect(h.updateMany).toHaveBeenCalledWith({ where: { id: "r1", storeId: "s1", revision: 1, transactionId: null },
      data: { number: "CUSTOM-1", document: { ...document, title: "CUSTOM-1" }, revision: { increment: 1 } } });
    expect(h.stockUpdate).not.toHaveBeenCalled();
  });

  it("rejects stale revisions and an intervening checkout without overwriting", async () => {
    h.findFirst.mockResolvedValue(record({ revision: 3 }));
    expect((await PATCH(request("PATCH", { revision: 1, number: "CUSTOM-1", document }), params())).status).toBe(409);
    expect(h.updateMany).not.toHaveBeenCalled();
    h.findFirst.mockResolvedValue(record()); h.updateMany.mockResolvedValue({ count: 0 });
    expect((await PATCH(request("PATCH", { revision: 1, number: "CUSTOM-1", document }), params())).status).toBe(409);
  });

  it.each(["receipt", "transaction", "race"])("rejects custom numbers used by another %s", async kind => {
    if (kind === "receipt") h.findUnique.mockResolvedValue(record({ id: "other" }));
    if (kind === "transaction") h.invoiceFind.mockResolvedValue({ id: "tx1" });
    if (kind === "race") h.updateMany.mockRejectedValue({ code: "P2002" });
    expect((await PATCH(request("PATCH", { revision: 1, number: "CUSTOM-1", document }), params())).status).toBe(409);
  });

  it("rejects reserved numbers and invalid documents with 422", async () => {
    expect((await PATCH(request("PATCH", { revision: 1, number: "INV-custom", document }), params())).status).toBe(422);
    expect((await PATCH(request("PATCH", { revision: 1, number: "OK-1", document: { ...document, lines: [{ ...document.lines[0], quantity: -1 }] } }), params())).status).toBe(422);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("requires write permissions and uses transaction.request for SALES", async () => {
    h.requireRole.mockResolvedValue({ id: "u1", storeId: "s1", role: "SALES" });
    expect((await POST(request("POST", { subcategory: "PRINT" }))).status).toBe(201);
    expect(h.canRolePerformAction).toHaveBeenCalledWith("SALES", "transaction.request", "create", expect.anything());
    h.canRolePerformAction.mockReturnValue(false);
    expect((await POST(request("POST", { subcategory: "PRINT" }))).status).toBe(403);
    expect((await PATCH(request("PATCH", { revision: 1, number: "OK-1", document }), params())).status).toBe(403);
    expect((await DELETE(request("DELETE", undefined, "/r1?revision=1"), params())).status).toBe(403);
  });

  it("requires update permission to change a draft even when create is allowed", async () => {
    h.canRolePerformAction.mockImplementation((_role, _resource, action) => action === "create");
    const response = await PATCH(request("PATCH", { revision: 1, number: "OK-1", document }), params());
    expect(response.status).toBe(403);
    expect(h.canRolePerformAction).toHaveBeenCalledWith("CASHIER", "transaction", "update", expect.anything());
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("requires delete permission to remove a draft even when create is allowed", async () => {
    h.canRolePerformAction.mockImplementation((_role, _resource, action) => action === "create");
    const response = await DELETE(request("DELETE", undefined, "/r1?revision=1"), params());
    expect(response.status).toBe(403);
    expect(h.canRolePerformAction).toHaveBeenCalledWith("CASHIER", "transaction", "delete", expect.anything());
    expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it("uses the SALES request update permission but requires transaction delete", async () => {
    h.requireRole.mockResolvedValue({ id: "u1", storeId: "s1", role: "SALES" });
    h.canRolePerformAction.mockImplementation((_role, resource, action) => resource === "transaction.request" && action === "update");
    expect((await PATCH(request("PATCH", { revision: 1, number: "OK-1", document }), params())).status).toBe(200);
    expect(h.canRolePerformAction).toHaveBeenCalledWith("SALES", "transaction.request", "update", expect.anything());
    expect((await DELETE(request("DELETE", undefined, "/r1?revision=1"), params())).status).toBe(403);
    expect(h.canRolePerformAction).toHaveBeenCalledWith("SALES", "transaction", "delete", expect.anything());
    expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it("propagates read authorization errors before reading database", async () => {
    h.requirePermission.mockRejectedValue({ statusCode: 403, message: "Akses ditolak" });
    expect((await GET(request("GET", undefined, "?subcategory=PRINT"))).status).toBe(403);
    expect((await getOne(request("GET"), params())).status).toBe(403);
    expect(h.findMany).not.toHaveBeenCalled(); expect(h.findFirst).not.toHaveBeenCalled();
  });

  it("prevents changes and deletion once processed", async () => {
    h.findFirst.mockResolvedValue(record({ transactionId: "tx1" }));
    expect((await PATCH(request("PATCH", { revision: 1, number: "OK-1", document }), params())).status).toBe(409);
    expect((await DELETE(request("DELETE", undefined, "/r1?revision=1"), params())).status).toBe(409);
    expect(h.updateMany).not.toHaveBeenCalled(); expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes a draft only at its current revision", async () => {
    expect((await DELETE(request("DELETE", undefined, "/r1?revision=1"), params())).status).toBe(204);
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { id: "r1", storeId: "s1", revision: 1, transactionId: null } });
    expect((await DELETE(request("DELETE", undefined, "/r1?revision=2"), params())).status).toBe(409);
    expect((await DELETE(request("DELETE", undefined, "/r1?revision=NaN"), params())).status).toBe(422);
  });

  it("rejects cross-store customer and stock links", async () => {
    h.customerFind.mockResolvedValue(null);
    expect((await PATCH(request("PATCH", { revision: 1, number: "OK-1", document: { ...document, customerId: "foreign" } }), params())).status).toBe(422);
    const linked = { ...document, lines: [{ ...document.lines[0], stockLink: { productId: "foreign", quantity: 1, unit: "pcs" } }] };
    expect((await PATCH(request("PATCH", { revision: 1, number: "OK-1", document: linked }), params())).status).toBe(422);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("returns a live linked transaction with numeric payments for reprinting", async () => {
    h.findFirst.mockResolvedValue(record({ transactionId: "t1", transaction: { id: "t1", total: "2500", subtotal: "2500", discount: "0", tax: "0", amountPaid: "1500", change: "0", invoiceDate: new Date(),
      createdAt: new Date(), payments: [{ method: "CASH", amount: "1500" }], debtPaymentLogs: [{ id: "pay1", amount: "500", paymentMethod: "CASH", createdAt: new Date() }], items: [] } }));
    const response = await getOne(request("GET"), params());
    expect(response.status).toBe(200);
    expect((await response.json()).transaction).toMatchObject({ total: 2500, amountPaid: 1500,
      payments: [{ amount: 1500 }], debtPaymentLogs: [{ amount: 500 }] });
  });
});

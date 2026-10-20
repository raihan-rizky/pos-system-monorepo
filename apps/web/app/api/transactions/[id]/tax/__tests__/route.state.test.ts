import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  find: vi.fn(), transaction: vi.fn(), user: vi.fn(), permission: vi.fn(), authError: vi.fn(),
}));

vi.mock("@pos/db", () => ({ db: { transaction: { findFirst: boundary.find }, $transaction: boundary.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({
  getCurrentUser: boundary.user, requirePermission: boundary.permission, handleAuthError: boundary.authError,
}));

import { GET, PATCH } from "../route";

const invoice = {
  id: "tx-1", storeId: "store-1", customerId: "customer-1" as string | null,
  subtotal: 100000, discount: 0, tax: 0, taxRate: null as number | null, taxMethod: "STANDARD",
  total: 100000, amountPaid: 100000, change: 0, status: "COMPLETED", paymentMethod: "CASH",
  printingSubcategory: null as string | null,
};
type Invoice = typeof invoice;
type Customer = { id: string; storeId: string; totalDebt: number; totalSpent: number };
type State = { invoice: Invoice | null; customer: Customer | null };
type Where = Record<string, unknown>;
const context = { params: Promise.resolve({ id: "tx-1" }) };

let state: State;
let atTransactionStart: (() => void) | undefined;
let rejectInvoiceWrite: boolean;
let transactionFailure: unknown;

function matches(row: object | null, where: Where): boolean {
  return row !== null && Object.entries(where).every(([key, expected]) => {
    const actual = (row as Where)[key];
    return typeof expected === "object" && expected !== null && "gte" in expected
      ? Number(actual) >= Number(expected.gte)
      : actual === expected;
  });
}

function snapshot(row: Invoice = invoice) {
  return {
    total: row.total, tax: row.tax, taxRate: row.taxRate, taxMethod: row.taxMethod,
    amountPaid: row.amountPaid, change: row.change, status: row.status,
  };
}

function bodyRequest(body: unknown) {
  return new Request("http://localhost/api/transactions/tx-1/tax", { method: "PATCH", body: JSON.stringify(body) });
}

function save(taxRate: number, row: Invoice = state.invoice!) {
  return PATCH(bodyRequest({ taxRate, expected: snapshot(row) }), context);
}

beforeEach(() => {
  vi.resetAllMocks();
  state = {
    invoice: { ...invoice },
    customer: { id: "customer-1", storeId: "store-1", totalDebt: 0, totalSpent: 100000 },
  };
  atTransactionStart = undefined;
  rejectInvoiceWrite = false;
  transactionFailure = undefined;
  boundary.user.mockResolvedValue({ id: "user-1", storeId: "store-1" });
  boundary.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
  boundary.authError.mockImplementation(error => error instanceof Response ? error : null);
  boundary.find.mockImplementation(async ({ where }: { where: Where }) =>
    matches(state.invoice, where) ? structuredClone(state.invoice) : null);

  // Only the external Prisma boundary is replaced. The route, calculations, guards,
  // compare-and-swap predicates, and customer deltas execute against mutable rows.
  // Publish the working copy only on success, matching interactive DB rollback.
  boundary.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    atTransactionStart?.();
    if (transactionFailure) throw transactionFailure;
    const working = structuredClone(state);
    const result = await callback({
      $queryRawUnsafe: async () => [],
      transaction: {
        findFirst: async ({ where }: { where: Where }) =>
          matches(working.invoice, where) ? structuredClone(working.invoice) : null,
        updateMany: async ({ where, data }: { where: Where; data: Partial<Invoice> }) => {
          if (rejectInvoiceWrite || !matches(working.invoice, where)) return { count: 0 };
          Object.assign(working.invoice!, data);
          return { count: 1 };
        },
      },
      customer: {
        updateMany: async ({ where, data }: { where: Where; data: Record<string, { increment: number }> }) => {
          if (!matches(working.customer, where)) return { count: 0 };
          for (const [key, value] of Object.entries(data)) {
            const field = key as "totalDebt" | "totalSpent";
            working.customer![field] += value.increment;
          }
          return { count: 1 };
        },
      },
    });
    state = working;
    return result;
  });
});

describe("transaction tax HTTP access and validation", () => {
  it.each([GET, PATCH])("rejects unauthenticated requests before revealing an invoice", async handler => {
    boundary.user.mockResolvedValue(null);
    const before = structuredClone(state);
    expect((await handler(bodyRequest({ taxRate: 12, expected: snapshot() }), context)).status).toBe(401);
    expect(state).toEqual(before);
  });

  it.each([GET, PATCH])("rejects a user denied both invoice and delivery access", async handler => {
    boundary.permission.mockRejectedValue(new Response(null, { status: 403 }));
    const before = structuredClone(state);
    expect((await handler(bodyRequest({ taxRate: 12, expected: snapshot() }), context)).status).toBe(403);
    expect(state).toEqual(before);
  });

  it("does not grant draft access through delivery-note permission", async () => {
    state.invoice!.status = "DRAFT";
    boundary.permission.mockImplementation(async (resource: string) => {
      if (resource !== "surat_jalan") throw new Response(null, { status: 403 });
    });
    expect((await GET(new Request("http://localhost"), context)).status).toBe(403);
    expect((await save(12)).status).toBe(403);
  });

  it.each([GET, PATCH])("hides invoices belonging to another store", async handler => {
    state.invoice!.storeId = "other-store";
    const before = structuredClone(state);
    expect((await handler(bodyRequest({ taxRate: 12, expected: snapshot() }), context)).status).toBe(404);
    expect(state).toEqual(before);
  });

  it.each([GET, PATCH])("returns 404 for a missing invoice", async handler => {
    state.invoice = null;
    expect((await handler(bodyRequest({ taxRate: 12, expected: snapshot() }), context)).status).toBe(404);
  });

  it("uses the default store for an authenticated account without a store assignment", async () => {
    boundary.user.mockResolvedValue({ id: "user-1", storeId: null });
    state.invoice!.storeId = "store-main";
    state.customer!.storeId = "store-main";
    const response = await save(12);
    expect(response.status).toBe(200);
    expect(state.invoice).toMatchObject({ total: 112000, status: "DP" });
    expect(state.customer).toMatchObject({ totalDebt: 12000 });
  });

  it("returns 400 for malformed JSON without changing any balances", async () => {
    const before = structuredClone(state);
    const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: "{broken" }), context);
    expect(response.status).toBe(400);
    expect(state).toEqual(before);
  });

  it.each([
    {}, { taxRate: 12 }, { taxRate: "12", expected: snapshot() },
    { taxRate: null, expected: snapshot() }, { taxRate: 12, expected: null },
    { taxRate: 12, expected: { ...snapshot(), amountPaid: "100000" } },
    { taxRate: 12, expected: { ...snapshot(), taxRate: undefined } },
    { taxRate: -0.01, expected: snapshot() }, { taxRate: 100.01, expected: snapshot() },
    { taxRate: 11.111, expected: snapshot() },
  ])("rejects invalid request %# without changing financial state", async body => {
    const before = structuredClone(state);
    expect((await PATCH(bodyRequest(body), context)).status).toBe(422);
    expect(state).toEqual(before);
  });

  it.each([
    [0, 0, 100000], [0.01, 10, 100010], [12.34, 12340, 112340], [100, 100000, 200000],
  ])("accepts rate %s and exposes independently calculated totals", async (rate, tax, total) => {
    const response = await save(rate);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.transaction).toMatchObject({ id: "tx-1", taxRate: rate, tax, total });
    expect(state.invoice).toMatchObject({ taxRate: rate, tax, total });
    expect(result.snapshot).toEqual(snapshot(state.invoice!));
  });
});

describe("transaction tax atomic state transitions", () => {
  it.each(["SPANDUK", "PERCETAKAN", "PLAT", "STEMPEL", "PRINT"])("keeps processed %s receipt totals and customer balances immutable", async printingSubcategory => {
    state.invoice!.printingSubcategory = printingSubcategory;
    const before = structuredClone(state);
    expect((await save(11)).status).toBe(409);
    expect(state).toEqual(before);
    expect(boundary.transaction).not.toHaveBeenCalled();
  });
  it.each(["DP", "PENDING_APPROVAL"])("rejects generic tax editing on a %s printing receipt", async status => {
    Object.assign(state.invoice!, { printingSubcategory: "PLAT", status, amountPaid: 25000 });
    const before = structuredClone(state);
    expect((await save(11)).status).toBe(409);
    expect(state).toEqual(before);
  });
  it("rejects a printing snapshot attached before the locked reread", async () => {
    atTransactionStart = () => { state.invoice!.printingSubcategory = "PLAT"; };
    expect((await save(11)).status).toBe(409);
    expect(state.invoice).toMatchObject({ printingSubcategory: "PLAT", total: 100000, tax: 0 });
    expect(state.customer).toMatchObject({ totalDebt: 0, totalSpent: 100000 });
  });
  it.each(["VOIDED", "REFUNDED"])("keeps %s invoice and balances immutable", async status => {
    state.invoice!.status = status;
    const before = structuredClone(state);
    expect((await save(12)).status).toBe(409);
    expect(state).toEqual(before);
  });

  it.each([
    ["total", 100001], ["tax", 1], ["taxRate", 0], ["taxMethod", "DPP_NILAI_LAIN"],
    ["amountPaid", 99999], ["change", 1], ["status", "DP"],
  ])("rejects a stale %s snapshot", async (field, value) => {
    const before = structuredClone(state);
    const response = await PATCH(bodyRequest({ taxRate: 12, expected: { ...snapshot(), [field]: value } }), context);
    expect(response.status).toBe(409);
    expect(state).toEqual(before);
  });

  it.each(["VOIDED", "REFUNDED", "DP"])("rejects a concurrent status change to %s", async status => {
    atTransactionStart = () => { state.invoice!.status = status; };
    expect((await save(12)).status).toBe(409);
    expect(state.invoice).toMatchObject({ status, total: 100000, tax: 0 });
    expect(state.customer).toMatchObject({ totalDebt: 0, totalSpent: 100000 });
  });

  it("rejects concurrent customer reassignment without charging either customer", async () => {
    atTransactionStart = () => { state.invoice!.customerId = "customer-2"; };
    expect((await save(12)).status).toBe(409);
    expect(state.invoice).toMatchObject({ customerId: "customer-2", total: 100000 });
    expect(state.customer).toMatchObject({ totalDebt: 0, totalSpent: 100000 });
  });

  it("rejects an invoice removed before the locked reread", async () => {
    atTransactionStart = () => { state.invoice = null; };
    expect((await save(12)).status).toBe(409);
    expect(state.invoice).toBeNull();
    expect(state.customer).toMatchObject({ totalDebt: 0, totalSpent: 100000 });
  });

  it("does not charge the customer when the invoice compare-and-swap loses", async () => {
    rejectInvoiceWrite = true;
    const before = structuredClone(state);
    expect((await save(12)).status).toBe(409);
    expect(state).toEqual(before);
  });

  it.each(["missing", "other-store"])("rolls back the invoice when its customer is %s", async kind => {
    if (kind === "missing") state.customer = null;
    else state.customer!.storeId = "other-store";
    const before = structuredClone(state);
    expect((await save(12)).status).toBe(409);
    expect(state).toEqual(before);
  });

  it("maps a database serialization conflict to a retryable HTTP conflict", async () => {
    transactionFailure = { code: "P2034" };
    const before = structuredClone(state);
    expect((await save(12)).status).toBe(409);
    expect(state).toEqual(before);
  });

  it("increases debt after a partial payment without recording another payment", async () => {
    Object.assign(state.invoice!, { status: "DP", amountPaid: 50000 });
    Object.assign(state.customer!, { totalDebt: 50000, totalSpent: 50000 });
    expect((await save(12)).status).toBe(200);
    expect(state.invoice).toMatchObject({ tax: 12000, total: 112000, amountPaid: 50000, change: 0, status: "DP" });
    expect(state.customer).toMatchObject({ totalDebt: 62000, totalSpent: 50000 });
  });

  it("reduces existing debt when tax is removed after a partial payment", async () => {
    Object.assign(state.invoice!, { status: "DP", taxRate: 12, tax: 12000, total: 112000, amountPaid: 50000 });
    Object.assign(state.customer!, { totalDebt: 62000, totalSpent: 50000 });
    expect((await save(0)).status).toBe(200);
    expect(state.invoice).toMatchObject({ tax: 0, total: 100000, amountPaid: 50000, change: 0, status: "DP" });
    expect(state.customer).toMatchObject({ totalDebt: 50000, totalSpent: 50000 });
  });

  it("settles debt and returns excess payment when the reduced total falls below payment", async () => {
    Object.assign(state.invoice!, { status: "DP", taxRate: 20, tax: 20000, total: 120000, amountPaid: 110000 });
    Object.assign(state.customer!, { totalDebt: 10000, totalSpent: 110000 });
    expect((await save(0)).status).toBe(200);
    expect(state.invoice).toMatchObject({ total: 100000, amountPaid: 110000, change: 10000, status: "COMPLETED" });
    expect(state.customer).toMatchObject({ totalDebt: 0, totalSpent: 100000 });
  });

  it.each(["totalDebt", "totalSpent"])("rolls back a tax reduction when %s cannot cover the ledger adjustment", async field => {
    Object.assign(state.invoice!, { status: "DP", taxRate: 20, tax: 20000, total: 120000, amountPaid: 110000 });
    Object.assign(state.customer!, { totalDebt: 10000, totalSpent: 110000, [field]: 0 });
    const before = structuredClone(state);
    expect((await save(0)).status).toBe(409);
    expect(state).toEqual(before);
  });

  it("keeps an approved quotation's saved DPP method on later tax edits", async () => {
    Object.assign(state.invoice!, { taxMethod: "DPP_NILAI_LAIN", taxRate: 12, tax: 11000, total: 111000, amountPaid: 111000 });
    state.customer!.totalSpent = 111000;
    expect((await save(10)).status).toBe(200);
    expect(state.invoice).toMatchObject({ taxMethod: "DPP_NILAI_LAIN", taxRate: 10, tax: 9167, total: 109167, amountPaid: 111000, change: 1833 });
    expect(state.customer).toMatchObject({ totalDebt: 0, totalSpent: 109167 });
  });

  it("preserves tender, change, and customer balances on an unchanged tax save", async () => {
    Object.assign(state.invoice!, { taxRate: 12, tax: 12000, total: 112000, amountPaid: 120000, change: 8000 });
    state.customer!.totalSpent = 112000;
    const before = structuredClone(state);
    expect((await save(12)).status).toBe(200);
    expect(state).toEqual(before);
  });

  it.each(["DRAFT", "PENDING_APPROVAL"])("updates %s totals without posting customer ledger entries", async status => {
    Object.assign(state.invoice!, { status, amountPaid: 0 });
    const customerBefore = structuredClone(state.customer);
    expect((await save(12)).status).toBe(200);
    expect(state.invoice).toMatchObject({ status, total: status === "DRAFT" ? 111000 : 112000, amountPaid: 0, change: 0 });
    expect(state.customer).toEqual(customerBefore);
  });

  it("retains TEMPO status while adjusting outstanding debt", async () => {
    state.invoice!.paymentMethod = "TEMPO";
    state.invoice!.amountPaid = 0;
    Object.assign(state.customer!, { totalDebt: 100000, totalSpent: 0 });
    expect((await save(12)).status).toBe(200);
    expect(state.invoice).toMatchObject({ status: "COMPLETED", total: 112000, amountPaid: 0 });
    expect(state.customer).toMatchObject({ totalDebt: 112000, totalSpent: 0 });
  });

  it("requires a customer when an anonymous paid receipt would gain debt", async () => {
    state.invoice!.customerId = null;
    const before = structuredClone(state);
    expect((await save(12)).status).toBe(422);
    expect(state).toEqual(before);
  });

  it("allows anonymous draft tax without creating debt", async () => {
    Object.assign(state.invoice!, { customerId: null, status: "DRAFT", amountPaid: 0 });
    const customerBefore = structuredClone(state.customer);
    expect((await save(12)).status).toBe(200);
    expect(state.invoice).toMatchObject({ taxMethod: "DPP_NILAI_LAIN", total: 111000, status: "DRAFT" });
    expect(state.customer).toEqual(customerBefore);
  });
});

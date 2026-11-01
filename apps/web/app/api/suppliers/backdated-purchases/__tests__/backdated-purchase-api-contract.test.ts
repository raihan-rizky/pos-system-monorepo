import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  handleAuthError: vi.fn(),
  transaction: vi.fn(),
  findPurchase: vi.fn(),
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: dependencies.requirePermission,
  handleAuthError: dependencies.handleAuthError,
}));
vi.mock("@pos/db", () => ({
  db: {
    $transaction: dependencies.transaction,
    backdatedPurchase: { findFirst: dependencies.findPurchase },
  },
}));

import { POST as createPurchase } from "../route";
import { GET as getPurchase } from "../[id]/route";
import { POST as addPayment } from "../[id]/payments/route";

type PaymentRow = {
  id: string;
  purchaseId: string;
  requestId: string;
  amount: string;
  paidAt: Date;
  createdById: string;
  createdAt: Date;
};

type PurchaseRow = {
  id: string;
  storeId: string;
  purchaseDate: Date;
  paymentMethod: "GIRO" | "TRANSFER";
  dueDate: Date;
  reference: string;
  amount: string;
  requestId: string;
  requestFingerprint: string;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
  payments: PaymentRow[];
};

type ExpenseRow = {
  storeId: string;
  amount: string;
  occurredAt: Date;
  backdatedPurchasePaymentId?: string;
  backdatedPurchaseDueId?: string;
  deletedAt?: Date | null;
};

type PaymentData = Omit<PaymentRow, "id" | "createdAt">;
type PurchaseData = Omit<PurchaseRow, "id" | "createdAt" | "payments"> & {
  payments: { create: Omit<PaymentData, "purchaseId">[] };
};

function makeDatabase() {
  const purchases: PurchaseRow[] = [];
  const expenses = new Map<string, ExpenseRow>();
  let paymentNumber = 0;
  const copy = <T,>(value: T): T => structuredClone(value);
  const findFirst = vi.fn(async ({ where }: { where: { id: string; storeId: string } }) =>
    copy(purchases.find((row) => row.id === where.id && row.storeId === where.storeId) ?? null));
  const tx = {
    $queryRaw: vi.fn(async (sql: TemplateStringsArray, ...values: string[]) => {
      if (sql.join("?").includes('"pos_stores"')) {
        return ["store-a", "store-b"].includes(values[0]) ? [{ id: values[0] }] : [];
      }
      const row = purchases.find((item) => item.id === values[0] && item.storeId === values[1]);
      return row ? [{ id: row.id }] : [];
    }),
    backdatedPurchase: {
      findFirst,
      findUnique: vi.fn(async ({ where }: { where: { storeId_requestId: { storeId: string; requestId: string } } }) => {
        const { storeId, requestId } = where.storeId_requestId;
        return copy(purchases.find((row) => row.storeId === storeId && row.requestId === requestId) ?? null);
      }),
      create: vi.fn(async ({ data }: { data: PurchaseData }) => {
        const id = `purchase-${purchases.length + 1}`;
        const { payments, ...purchase } = data;
        const row: PurchaseRow = {
          ...purchase,
          id,
          createdAt: new Date(),
          payments: payments.create.map((payment) => ({
            ...payment,
            id: `payment-${++paymentNumber}`,
            purchaseId: id,
            createdAt: new Date(),
          })),
        };
        purchases.push(row);
        return copy(row);
      }),
    },
    backdatedPurchasePayment: {
      create: vi.fn(async ({ data }: { data: PaymentData }) => {
        const payment = { ...data, id: `payment-${++paymentNumber}`, createdAt: new Date() };
        const purchase = purchases.find((row) => row.id === data.purchaseId);
        if (!purchase) throw new Error("Missing test purchase");
        purchase.payments.push(payment);
        return copy(payment);
      }),
    },
    expense: {
      upsert: vi.fn(async ({ where, create, update }: {
        where: { backdatedPurchasePaymentId?: string; backdatedPurchaseDueId?: string };
        create: ExpenseRow;
        update: Pick<ExpenseRow, "amount" | "occurredAt" | "deletedAt">;
      }) => {
        const key = where.backdatedPurchasePaymentId ?? where.backdatedPurchaseDueId;
        if (!key) throw new Error("Missing test expense key");
        expenses.set(key, expenses.has(key) ? { ...expenses.get(key)!, ...update } : copy(create));
        return copy(expenses.get(key)!);
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { backdatedPurchaseDueId: string };
        data: { deletedAt: Date };
      }) => {
        const expense = expenses.get(where.backdatedPurchaseDueId);
        if (expense) expense.deletedAt = data.deletedAt;
        return { count: expense ? 1 : 0 };
      }),
    },
  };
  dependencies.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  dependencies.findPurchase.mockImplementation(findFirst);
  return { tx, purchases, expenses };
}

const basePurchase = {
  purchaseDate: "2026-10-15",
  paymentMethod: "GIRO",
  dueDate: "2026-11-10",
  reference: "GIRO-123",
  amount: "100.00",
  requestId: "purchase-request-1",
  payments: [
    { amount: "40.00", paidAt: "2026-10-20", requestId: "initial-payment-1" },
    { amount: "20.00", paidAt: "2026-10-31", requestId: "initial-payment-2" },
  ],
};

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/suppliers/backdated-purchases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function purchaseParams(id = "purchase-1") {
  return { params: Promise.resolve({ id }) };
}

describe("backdated purchase API contracts", () => {
  let database: ReturnType<typeof makeDatabase>;
  let actor: { id: string; name: string; storeId: string | null };
  let deniedPermissions: Set<string>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T17:30:00.000Z"));
    actor = { id: "user-1", name: "Admin", storeId: "store-a" };
    deniedPermissions = new Set();
    dependencies.requirePermission.mockImplementation(async (resource: string, action: string) => {
      if (deniedPermissions.has(`${resource}.${action}`)) throw new Error("permission-denied");
      return actor;
    });
    dependencies.handleAuthError.mockImplementation((error: unknown) =>
      error instanceof Error && error.message === "permission-denied"
        ? Response.json({ code: "Forbidden" }, { status: 403 })
        : null);
    database = makeDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(["supplier.create", "expense.create"])("rejects creation without %s permission", async (permission) => {
    deniedPermissions.add(permission);
    const response = await createPurchase(jsonRequest(basePurchase));
    expect(response.status).toBe(403);
    expect(database.purchases).toHaveLength(0);
    expect(dependencies.transaction).not.toHaveBeenCalled();
  });

  it.each(["supplier.read", "expense.update"])("rejects payment without %s permission", async (permission) => {
    await createPurchase(jsonRequest(basePurchase));
    deniedPermissions.add(permission);
    const response = await addPayment(jsonRequest({ amount: "1", paidAt: "2026-10-31", requestId: "new" }), purchaseParams());
    expect(response.status).toBe(403);
    expect(database.purchases[0].payments).toHaveLength(2);
    expect(database.tx.backdatedPurchasePayment.create).not.toHaveBeenCalled();
  });

  it("rejects reads without supplier access", async () => {
    deniedPermissions.add("supplier.read");
    const response = await getPurchase(new Request("http://localhost"), purchaseParams());
    expect(response.status).toBe(403);
    expect(dependencies.findPurchase).not.toHaveBeenCalled();
  });

  it("rejects all operations for a user without a store", async () => {
    actor.storeId = null;
    const responses = [
      await createPurchase(jsonRequest(basePurchase)),
      await getPurchase(new Request("http://localhost"), purchaseParams()),
      await addPayment(jsonRequest({ amount: "1", paidAt: "2026-10-31", requestId: "new" }), purchaseParams()),
    ];
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
    expect(dependencies.transaction).not.toHaveBeenCalled();
    expect(dependencies.findPurchase).not.toHaveBeenCalled();
  });

  it("uses the authenticated store and hides purchases from another store", async () => {
    const created = await createPurchase(jsonRequest({ ...basePurchase, storeId: "store-b" }));
    expect(created.status).toBe(201);
    expect(database.purchases[0].storeId).toBe("store-a");
    expect([...database.expenses.values()].every((expense) => expense.storeId === "store-a")).toBe(true);
    expect((await getPurchase(new Request("http://localhost"), purchaseParams())).status).toBe(200);

    actor.storeId = "store-b";
    const read = await getPurchase(new Request("http://localhost"), purchaseParams());
    const payment = await addPayment(jsonRequest({ amount: "1", paidAt: "2026-10-31", requestId: "other-store" }), purchaseParams());
    expect(read.status).toBe(404);
    expect(payment.status).toBe(404);
    expect(database.purchases[0].payments).toHaveLength(2);
  });

  it.each([
    [{ purchaseDate: "2026-11-01", payments: [] }, "purchaseDate"],
    [{ purchaseDate: "2026-02-30", payments: [] }, "purchaseDate"],
    [{ dueDate: "2026-10-14", payments: [] }, "dueDate"],
    [{ amount: "0", payments: [] }, "amount"],
    [{ amount: "1.001", payments: [] }, "amount"],
    [{ payments: [{ amount: "1", paidAt: "2026-10-14", requestId: "p" }] }, "paidAt"],
    [{ payments: [{ amount: "1", paidAt: "2026-11-02", requestId: "p" }] }, "paidAt"],
    [{ payments: [{ amount: "101", paidAt: "2026-10-31", requestId: "p" }] }, "payments"],
    [{ payments: [basePurchase.payments[0], basePurchase.payments[0]] }, "payments"],
  ])("returns a field error for invalid purchase input %#", async (overrides, field) => {
    const response = await createPurchase(jsonRequest({ ...basePurchase, ...overrides }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "ValidationError", errors: { [field]: expect.any(Array) } });
    expect(database.purchases).toHaveLength(0);
    expect(dependencies.transaction).not.toHaveBeenCalled();
  });

  it.each([
    [{ amount: "0", paidAt: "2026-10-31", requestId: "p" }, "amount"],
    [{ amount: "1.001", paidAt: "2026-10-31", requestId: "p" }, "amount"],
    [{ amount: "1", paidAt: "2026-10-14", requestId: "p" }, "paidAt"],
    [{ amount: "1", paidAt: "2026-11-02", requestId: "p" }, "paidAt"],
    [{ amount: "1", paidAt: "2026-02-30", requestId: "p" }, "paidAt"],
  ])("returns a field error for invalid payment input %#", async (body, field) => {
    await createPurchase(jsonRequest(basePurchase));
    const response = await addPayment(jsonRequest(body), purchaseParams());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "ValidationError", errors: { [field]: expect.any(Array) } });
    expect(database.purchases[0].payments).toHaveLength(2);
    expect(database.tx.backdatedPurchasePayment.create).not.toHaveBeenCalled();
  });

  it("retries the same creation without duplicate purchases or expenses and rejects changed data", async () => {
    const first = await createPurchase(jsonRequest(basePurchase));
    const retry = await createPurchase(jsonRequest({ ...basePurchase, payments: [...basePurchase.payments].reverse() }));
    const conflict = await createPurchase(jsonRequest({ ...basePurchase, amount: "101.00" }));

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(await retry.json()).toEqual(await first.json());
    expect(conflict.status).toBe(409);
    expect(database.purchases).toHaveLength(1);
    expect(database.expenses.size).toBe(3);
    expect(database.tx.backdatedPurchase.create).toHaveBeenCalledTimes(1);
    expect(database.tx.expense.upsert).toHaveBeenCalledTimes(3);
  });

  it("scopes creation request identifiers to each store", async () => {
    expect((await createPurchase(jsonRequest(basePurchase))).status).toBe(201);
    actor.storeId = "store-b";
    expect((await createPurchase(jsonRequest(basePurchase))).status).toBe(201);
    expect(database.purchases.map((row) => row.storeId)).toEqual(["store-a", "store-b"]);
    expect(database.expenses.size).toBe(6);
  });

  it("records partial Giro payments once and rejects conflicts and payments beyond the balance", async () => {
    await createPurchase(jsonRequest(basePurchase));
    const body = { amount: "25.00", paidAt: "2026-11-01", requestId: "partial-retry" };
    const first = await addPayment(jsonRequest(body), purchaseParams());
    const retry = await addPayment(jsonRequest(body), purchaseParams());
    const conflict = await addPayment(jsonRequest({ ...body, amount: "24.00" }), purchaseParams());
    const tooMuch = await addPayment(jsonRequest({ ...body, amount: "15.01", requestId: "too-much" }), purchaseParams());

    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ data: { paidCents: 8500, remainingCents: 1500, paymentStatus: "PARTIAL" } });
    expect(retry.status).toBe(201);
    expect(await retry.json()).toMatchObject({ data: { paidCents: 8500, remainingCents: 1500 } });
    expect(conflict.status).toBe(409);
    expect(tooMuch.status).toBe(422);
    expect(database.purchases[0].payments).toHaveLength(3);
    expect(database.tx.backdatedPurchasePayment.create).toHaveBeenCalledTimes(1);
    expect(database.expenses.get("purchase-1")).toMatchObject({ amount: "15.00", storeId: "store-a" });
    expect(database.expenses.get("payment-3")).toMatchObject({ amount: "25.00", storeId: "store-a" });

    const locked = database.tx.$queryRaw.mock.calls.find(([sql]) => sql.join("?").includes('"pos_backdated_purchases"'));
    expect(locked?.[0].join("?")).toContain("FOR UPDATE");
    expect(locked?.slice(1)).toEqual(["purchase-1", "store-a"]);

    const finalPayment = await addPayment(jsonRequest({ ...body, amount: "15.00", requestId: "settle" }), purchaseParams());
    expect(await finalPayment.json()).toMatchObject({ data: { paidCents: 10000, remainingCents: 0, paymentStatus: "PAID" } });
    expect(database.expenses.get("purchase-1")?.deletedAt).toBeInstanceOf(Date);
    const afterPaid = await addPayment(jsonRequest({ ...body, amount: "0.01", requestId: "after-paid" }), purchaseParams());
    expect(afterPaid.status).toBe(422);
    expect(database.purchases[0].payments).toHaveLength(4);
  });

  it("records a late payment without a second payment expense", async () => {
    vi.setSystemTime(new Date("2026-11-20T04:00:00.000Z"));
    await createPurchase(jsonRequest(basePurchase));
    const response = await addPayment(jsonRequest({ amount: "20.00", paidAt: "2026-11-15", requestId: "late" }), purchaseParams());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ data: { paidCents: 8000, remainingCents: 2000, paymentStatus: "PARTIAL" } });
    expect(database.expenses.has("payment-3")).toBe(false);
    expect(database.expenses.get("purchase-1")).toMatchObject({ amount: "40.00" });
  });

  it("updates the due expense when an on-time payment is entered after a late payment", async () => {
    await createPurchase(jsonRequest({ ...basePurchase, dueDate: "2026-10-31", payments: [] }));
    const late = await addPayment(jsonRequest({ amount: "20.00", paidAt: "2026-11-01", requestId: "late" }), purchaseParams());
    expect(late.status).toBe(201);
    expect(database.expenses.get("purchase-1")).toMatchObject({ amount: "100.00" });

    const historical = await addPayment(jsonRequest({ amount: "30.00", paidAt: "2026-10-31", requestId: "on-due" }), purchaseParams());
    expect(historical.status).toBe(201);
    expect(await historical.json()).toMatchObject({ data: { paidCents: 5000, remainingCents: 5000, paymentStatus: "PARTIAL" } });
    expect(database.expenses.get("purchase-1")).toMatchObject({ amount: "70.00" });
    expect(database.expenses.get("payment-2")).toMatchObject({ amount: "30.00" });
    expect(database.expenses.get("payment-2")?.occurredAt.toISOString()).toBe("2026-10-30T17:00:00.000Z");
    expect(database.expenses.get("purchase-1")?.occurredAt.toISOString()).toBe("2026-10-30T17:00:00.000Z");
    expect(database.expenses.has("payment-1")).toBe(false);
  });

  it("rejects a reused payment request identifier with a different date", async () => {
    await createPurchase(jsonRequest(basePurchase));
    const first = { amount: "5.00", paidAt: "2026-10-30", requestId: "payment-retry" };
    expect((await addPayment(jsonRequest(first), purchaseParams())).status).toBe(201);
    const conflict = await addPayment(jsonRequest({ ...first, paidAt: "2026-10-31" }), purchaseParams());
    expect(conflict.status).toBe(409);
    expect(database.purchases[0].payments).toHaveLength(3);
    expect(database.tx.backdatedPurchasePayment.create).toHaveBeenCalledTimes(1);
  });

  it("returns a validation response for malformed JSON", async () => {
    const request = new Request("http://localhost", { method: "POST", body: "{" });
    const response = await createPurchase(request);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "ValidationError" });
    expect(database.purchases).toHaveLength(0);
  });

  it("returns a generic server error when persistence fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dependencies.transaction.mockRejectedValueOnce(new Error("private database details"));
    const response = await createPurchase(jsonRequest(basePurchase));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ code: "InternalError" });
    expect(JSON.stringify(body)).not.toContain("private database details");
  });
});

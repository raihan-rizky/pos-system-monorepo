import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createManual } from "@/app/api/customer-receivables/route";
import { POST as payManual } from "@/app/api/customer-receivables/[id]/payments/route";
import { POST as payCustomer } from "@/app/api/customers/[id]/pay-debt/route";
import { POST as payInvoice } from "@/app/api/transactions/[id]/pay-debt/route";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), transaction: vi.fn(), customer: vi.fn(), invoice: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: mocks.permission,
  handleAuthError: (error: unknown) => error instanceof Error && error.message === "Forbidden" ? new Response(null, { status: 403 }) : null,
  canAuthenticatedUserPerform: vi.fn().mockResolvedValue(false),
  canAuthenticatedUserAccessPage: vi.fn().mockResolvedValue(true),
}));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction, customer: { findFirst: mocks.customer }, transaction: { findFirst: mocks.invoice } }, Prisma: {} }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

const context = { params: Promise.resolve({ id: "record-1" }) };
function request(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("receivable write authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockResolvedValue({ id: "record-1", amountPaid: 50000 });
    mocks.customer.mockResolvedValue(null);
    mocks.invoice.mockResolvedValue(null);
  });

  it.each(["SALES", "CASHIER"])("denies %s all direct writes despite legacy edit grants", async (role) => {
    const allowed = new Set(["customer:update", "transaction:update", "customer.receivable:read"]);
    mocks.permission.mockImplementation(async (target: string, action: string) => {
      if (!allowed.has(`${target}:${action}`)) throw new Error("Forbidden");
      return { id: "user-1", role, storeId: "store-1" };
    });

    const create = await createManual(request("/api/customer-receivables", {
      customerId: "customer-1", amount: 100000, debtDate: "2026-09-01", dueDate: "2026-10-01", clientMutationId: "9e70ff2c-9401-4edb-91a6-d0637ed226ad",
    }));
    const manual = await payManual(request("/api/customer-receivables/record-1/payments", {
      amount: 50000, method: "CASH", clientMutationId: "9e70ff2c-9401-4edb-91a6-d0637ed226ad",
    }), context);
    const customer = await payCustomer(request("/api/customers/record-1/pay-debt", { amount: 50000, paymentMethod: "CASH" }), context);
    const invoice = await payInvoice(request("/api/transactions/record-1/pay-debt", { amount: 50000, paymentMethod: "CASH" }), context);

    expect([create.status, manual.status, customer.status, invoice.status]).toEqual([403, 403, 403, 403]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("accepts payment access without unrelated customer or transaction update grants", async () => {
    const allowed = new Set(["customer.receivable:read", "customer.receivable.payment:create"]);
    mocks.permission.mockImplementation(async (target: string, action: string) => {
      if (!allowed.has(`${target}:${action}`)) throw new Error("Forbidden");
      return { id: "user-1", role: "SALES", storeId: "store-1" };
    });

    const manual = await payManual(request("/api/customer-receivables/record-1/payments", {
      amount: 50000, method: "CASH", clientMutationId: "9e70ff2c-9401-4edb-91a6-d0637ed226ad",
    }), context);
    const invoice = await payInvoice(request("/api/transactions/record-1/pay-debt", { amount: 50000, paymentMethod: "CASH" }), context);
    expect(manual.status).toBe(200);
    expect(invoice.status).toBe(404);
  });
});

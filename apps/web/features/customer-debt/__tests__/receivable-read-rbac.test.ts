import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listManual } from "@/app/api/customer-receivables/route";
import { GET as listCustomers } from "@/app/api/customers/route";
import { GET as getCustomer, PATCH as updateCustomer } from "@/app/api/customers/[id]/route";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), canPerform: vi.fn(), canAccessPage: vi.fn(),
  identityPermission: vi.fn(),
  customerCount: vi.fn(), customerList: vi.fn(), customer: vi.fn(), customerUpdate: vi.fn(), transaction: vi.fn(),
  receivableCount: vi.fn(), receivableList: vi.fn(), loadDebt: vi.fn(),
}));
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: mocks.permission,
  canAuthenticatedUserPerform: mocks.canPerform,
  canAuthenticatedUserAccessPage: mocks.canAccessPage,
  handleAuthError: (error: unknown) => error instanceof Error && error.message === "Forbidden" ? new Response(null, { status: 403 }) : null,
  AuthError: class extends Error { constructor(public statusCode: number) { super("Forbidden"); } },
}));
vi.mock("@pos/db", () => ({
  db: {
    customer: { count: mocks.customerCount, findMany: mocks.customerList, findFirst: mocks.customer, update: mocks.customerUpdate },
    customerReceivable: { count: mocks.receivableCount, findMany: mocks.receivableList, fields: { amount: "AMOUNT_FIELD" } },
    $transaction: mocks.transaction,
  },
  Prisma: {},
}));
vi.mock("@/features/customer-debt/server/customer-identity-authorization", () => ({
  requireCustomerDebtIdentityPermission: mocks.identityPermission,
}));
vi.mock("@/features/customer-debt/helpers/customer-debt-summary", () => ({
  loadCustomerDebtByActiveDp: mocks.loadDebt,
  applyComputedCustomerDebt: (customers: unknown[]) => customers,
}));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

const profile = {
  id: "customer-1", name: "Budi", phone: null, email: null, company: null, address: null,
  type: "UMUM", notes: null, totalSpent: 8000, totalOrders: 1, totalDebt: 4000,
  loyaltyPoint: 0, lastVisitAt: null, createdAt: "2026-10-01T00:00:00Z",
};

describe("receivable read authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canAccessPage.mockResolvedValue(true);
    mocks.canPerform.mockResolvedValue(false);
    mocks.identityPermission.mockResolvedValue(undefined);
    mocks.customerCount.mockResolvedValue(1);
    mocks.customerList.mockResolvedValue([profile]);
    mocks.customer.mockResolvedValue({ ...profile, transactions: [{ id: "invoice-1", total: 8000, amountPaid: 4000, paymentMethod: "CASH", status: "DP" }] });
    mocks.customerUpdate.mockResolvedValue(profile);
    mocks.transaction.mockImplementation((operation: unknown) => {
      if (Array.isArray(operation)) return Promise.all(operation);
      if (typeof operation === "function") {
        return (operation as (tx: Record<string, unknown>) => unknown)({
          $queryRaw: vi.fn(),
          customer: { findFirst: mocks.customer, update: mocks.customerUpdate },
        });
      }
      return Promise.resolve(operation);
    });
    mocks.receivableCount.mockResolvedValue(0);
    mocks.receivableList.mockResolvedValue([]);
    mocks.loadDebt.mockResolvedValue(new Map());
  });

  it("allows manual receivable read without customer profile permission", async () => {
    mocks.permission.mockImplementation(async (target: string, action: string) => {
      if (target !== "customer.receivable" || action !== "read") throw new Error("Forbidden");
      return { id: "user-1", role: "SALES", storeId: "store-1" };
    });
    mocks.receivableList.mockResolvedValue([{
      id: "debt-1", customerId: "customer-1", customer: { id: "customer-1", name: "Budi" },
      amount: 10000, amountPaid: 1000, debtDate: "2026-10-01", dueDate: "2026-10-31", note: null, createdAt: "2026-10-01",
      createdById: "private-user", clientMutationId: "private-mutation",
      payments: [{ id: "payment-1", amount: 1000, method: "CASH", note: null, createdAt: "2026-10-02", createdById: "private-user" }],
    }]);
    const response = await listManual(new Request("http://localhost/api/customer-receivables"));
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data[0]).not.toHaveProperty("createdById");
    expect(data[0]).not.toHaveProperty("clientMutationId");
    expect(data[0].payments[0]).not.toHaveProperty("createdById");
    expect(mocks.receivableList).toHaveBeenCalled();
  });

  it("hides balances and blocks debt filters while preserving profile access", async () => {
    mocks.permission.mockResolvedValue({ id: "user-1", role: "SALES", storeId: "store-1" });
    const response = await listCustomers(new Request("http://localhost/api/customers"));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.data[0]).toMatchObject({ id: "customer-1", name: "Budi" });
    expect(result.data[0]).not.toHaveProperty("totalDebt");
    expect(mocks.loadDebt).not.toHaveBeenCalled();
    const filtered = await listCustomers(new Request("http://localhost/api/customers?hasDebt=true"));
    expect(filtered.status).toBe(403);
  });

  it("does not return debt balances or payment details in a customer profile", async () => {
    mocks.permission.mockResolvedValue({ id: "user-1", role: "SALES", storeId: "store-1" });
    const response = await getCustomer(new Request("http://localhost/api/customers/customer-1"), { params: Promise.resolve({ id: "customer-1" }) });
    const customer = await response.json();
    expect(response.status).toBe(200);
    expect(customer).not.toHaveProperty("totalDebt");
    expect(customer).not.toHaveProperty("transactions");
  });

  it("shows only active invoice details when receivables are visible without transaction history", async () => {
    mocks.permission.mockResolvedValue({ id: "user-1", role: "SALES", storeId: "store-1" });
    mocks.canPerform.mockImplementation(async (_user: unknown, target: string, action: string) =>
      target === "customer.receivable" && action === "read",
    );

    const response = await getCustomer(new Request("http://localhost/api/customers/customer-1"), { params: Promise.resolve({ id: "customer-1" }) });
    const customer = await response.json();
    expect(response.status).toBe(200);
    expect(customer.transactions).toMatchObject([{ id: "invoice-1", total: 8000, amountPaid: 4000, status: "DP" }]);
    expect(customer.transactions[0]).not.toHaveProperty("paymentMethod");
    expect(customer.transactions[0]).not.toHaveProperty("items");
  });

  it("does not reveal a balance in a profile-update response", async () => {
    mocks.permission.mockResolvedValue({ id: "user-1", role: "SALES", storeId: "store-1" });
    const response = await updateCustomer(new Request("http://localhost/api/customers/customer-1", { method: "PATCH", body: JSON.stringify({ notes: "Catatan" }) }), { params: Promise.resolve({ id: "customer-1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("totalDebt");
  });
});

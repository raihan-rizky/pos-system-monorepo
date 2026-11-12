import { beforeEach, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH } from "../route";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  canAuthenticatedUserPerform: vi.fn(),
  handleAuthError: vi.fn(),
  requireCustomerDebtIdentityPermission: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  transaction: vi.fn(),
  lockedCustomer: vi.fn(),
  lock: vi.fn(),
  receivableCount: vi.fn(),
  unlink: vi.fn(),
  loadDebt: vi.fn(),
  applyDebt: vi.fn(),
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: mocks.requirePermission,
  canAuthenticatedUserPerform: mocks.canAuthenticatedUserPerform,
  handleAuthError: mocks.handleAuthError,
}));

vi.mock("@pos/db", () => ({
  db: {
    customer: { findFirst: mocks.findFirst, update: mocks.update, delete: mocks.remove },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/features/customer-debt/server/customer-identity-authorization", () => ({
  requireCustomerDebtIdentityPermission: mocks.requireCustomerDebtIdentityPermission,
}));

vi.mock("@/features/customer-debt/helpers/customer-debt-summary", () => ({
  loadCustomerDebtByActiveDp: mocks.loadDebt,
  applyComputedCustomerDebt: mocks.applyDebt,
}));

vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

const user = { id: "user-1", role: "SALES", storeId: "store-1" };
const identity = { id: "customer-1", name: "Ari" };
const customer = {
  id: "customer-1",
  name: "Ari",
  type: "RETAIL",
  totalDebt: 12_000,
  transactions: [{
    id: "invoice-1",
    invoiceNumber: "INV-1",
    total: 100_000,
    amountPaid: 25_000,
    paymentMethod: "TEMPO",
    status: "UNPAID",
    items: [{ productName: "Kopi", quantity: 1, subtotal: 100_000 }],
  }],
};
const context = { params: Promise.resolve({ id: "customer-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(user);
  mocks.canAuthenticatedUserPerform.mockResolvedValue(false);
  mocks.handleAuthError.mockImplementation((error: unknown) =>
    error instanceof Error ? new Response(null, { status: 403 }) : null,
  );
  mocks.findFirst.mockResolvedValue({ ...customer, transactions: undefined });
  mocks.update.mockResolvedValue({ id: "customer-1", name: "Ari Baru", totalDebt: 75_000, debtOutstanding: 60_000 });
  mocks.remove.mockResolvedValue(identity);
  mocks.lockedCustomer.mockResolvedValue(identity);
  mocks.lock.mockResolvedValue(undefined);
  mocks.receivableCount.mockResolvedValue(0);
  mocks.unlink.mockResolvedValue({ count: 0 });
  mocks.requireCustomerDebtIdentityPermission.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation((callback) => callback({
    $queryRaw: mocks.lock,
    customer: {
      findFirst: mocks.lockedCustomer,
      update: mocks.update,
      delete: mocks.remove,
    },
    customerReceivable: { count: mocks.receivableCount },
    transaction: { updateMany: mocks.unlink },
  }));
  mocks.loadDebt.mockResolvedValue(new Map());
  mocks.applyDebt.mockImplementation((customers: Array<Record<string, unknown>>) =>
    customers.map((value) => ({
      ...value,
      totalDebt: 75_000,
      debtOutstanding: 75_000,
    })),
  );
});

it("omits transaction history and piutang balances when the user only has customer read", async () => {
  const response = await GET(
    new Request("http://localhost/api/customers/customer-1"),
    context,
  );
  const result = await response.json();

  expect(response.status).toBe(200);
  expect(result).toMatchObject({ id: "customer-1", name: "Ari", type: "RETAIL" });
  expect(result).not.toHaveProperty("totalDebt");
  expect(result).not.toHaveProperty("debtOutstanding");
  expect(result).not.toHaveProperty("transactions");
  expect(mocks.canAuthenticatedUserPerform).toHaveBeenCalledWith(
    user,
    "customer.receivable",
    "read",
  );
  expect(mocks.canAuthenticatedUserPerform).toHaveBeenCalledWith(
    user,
    "transaction",
    "read",
  );
  expect(mocks.loadDebt).not.toHaveBeenCalled();
  expect(mocks.findFirst.mock.calls[0][0].include).toBeUndefined();
});

it("returns piutang balances without transaction history when only piutang read is granted", async () => {
  mocks.canAuthenticatedUserPerform.mockImplementation((
    _user: unknown,
    target: string,
  ) =>
    Promise.resolve(target === "customer.receivable"),
  );

  const response = await GET(
    new Request("http://localhost/api/customers/customer-1"),
    context,
  );
  const result = await response.json();

  expect(result.totalDebt).toBe(75_000);
  expect(result.debtOutstanding).toBe(75_000);
  expect(result).not.toHaveProperty("transactions");
  expect(mocks.loadDebt).toHaveBeenCalledOnce();
  expect(mocks.findFirst.mock.calls[0][0].include).toBeUndefined();
});

it("returns transaction history without piutang balances when only transaction read is granted", async () => {
  mocks.canAuthenticatedUserPerform.mockImplementation((
    _user: unknown,
    target: string,
  ) =>
    Promise.resolve(target === "transaction"),
  );
  mocks.findFirst.mockResolvedValue(customer);

  const response = await GET(
    new Request("http://localhost/api/customers/customer-1"),
    context,
  );
  const result = await response.json();

  expect(result).not.toHaveProperty("totalDebt");
  expect(result).not.toHaveProperty("debtOutstanding");
  expect(result.transactions[0]).toMatchObject({
    invoiceNumber: "INV-1",
    total: 100_000,
    amountPaid: 25_000,
    items: [{ productName: "Kopi", subtotal: 100_000 }],
  });
  expect(mocks.loadDebt).not.toHaveBeenCalled();
  expect(mocks.findFirst.mock.calls[0][0].include.transactions).toBeDefined();
});

it("requires customer update permission before editing a customer", async () => {
  mocks.requirePermission.mockRejectedValue(new Error("Forbidden"));

  const response = await PATCH(
    new Request("http://localhost/api/customers/customer-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ari Baru" }),
    }),
    context,
  );

  expect(response.status).toBe(403);
  expect(mocks.requirePermission).toHaveBeenCalledWith("customer", "update");
  expect(mocks.findFirst).not.toHaveBeenCalled();
});

it("keeps ordinary renames available without attributed debt and redacts their response", async () => {
  const response = await PATCH(
    new Request("http://localhost/api/customers/customer-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ari Baru" }),
    }),
    context,
  );
  const result = await response.json();

  expect(response.status).toBe(200);
  expect(result).toMatchObject({ id: "customer-1", name: "Ari Baru" });
  expect(result).not.toHaveProperty("totalDebt");
  expect(result).not.toHaveProperty("debtOutstanding");
  expect(mocks.requireCustomerDebtIdentityPermission).toHaveBeenCalledWith(
    expect.anything(),
    "store-1",
    user,
    identity,
    "Ari Baru",
  );
  expect(mocks.update).toHaveBeenCalledWith({
    where: { id: "customer-1" },
    data: { name: "Ari Baru" },
  });
});

it("blocks a rename when legacy debt attribution requires receivable permissions", async () => {
  mocks.requireCustomerDebtIdentityPermission.mockRejectedValue(new Error("Forbidden"));

  const response = await PATCH(
    new Request("http://localhost/api/customers/customer-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nama Baru" }),
    }),
    context,
  );

  expect(response.status).toBe(403);
  expect(mocks.requireCustomerDebtIdentityPermission).toHaveBeenCalledWith(
    expect.anything(),
    "store-1",
    user,
    identity,
    "Nama Baru",
  );
  expect(mocks.update).not.toHaveBeenCalled();
});

it("requires customer delete permission before deleting a customer", async () => {
  mocks.requirePermission.mockRejectedValue(new Error("Forbidden"));

  const response = await DELETE(
    new Request("http://localhost/api/customers/customer-1", { method: "DELETE" }),
    context,
  );

  expect(response.status).toBe(403);
  expect(mocks.requirePermission).toHaveBeenCalledWith("customer", "delete");
  expect(mocks.findFirst).not.toHaveBeenCalled();
});

it("blocks deletion when legacy debt attribution requires receivable permissions", async () => {
  mocks.requireCustomerDebtIdentityPermission.mockRejectedValue(new Error("Forbidden"));

  const response = await DELETE(
    new Request("http://localhost/api/customers/customer-1", { method: "DELETE" }),
    context,
  );

  expect(response.status).toBe(403);
  expect(mocks.requireCustomerDebtIdentityPermission).toHaveBeenCalledWith(
    expect.anything(),
    "store-1",
    user,
    identity,
    null,
  );
  expect(mocks.unlink).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

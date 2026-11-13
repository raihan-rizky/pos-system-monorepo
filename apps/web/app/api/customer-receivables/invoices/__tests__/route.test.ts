import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), page: vi.fn(), count: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: mocks.permission,
  canAuthenticatedUserAccessPage: mocks.page,
  handleAuthError: (error: unknown) => error instanceof Error && error.message === "Forbidden" ? new Response(null, { status: 403 }) : null,
  AuthError: class extends Error { constructor(public statusCode: number) { super("Forbidden"); } },
}));
vi.mock("@pos/db", () => ({ db: { transaction: { count: mocks.count, findMany: mocks.findMany, fields: { total: "TOTAL_FIELD" } } }, Prisma: {} }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

describe("receivable invoice list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockImplementation(async (target: string, action: string) => {
      if (target !== "customer.receivable" || action !== "read") throw new Error("Forbidden");
      return { id: "user-1", role: "SALES", storeId: "store-1" };
    });
    mocks.page.mockResolvedValue(true);
    mocks.count.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([{
      id: "invoice-1", invoiceNumber: "INV-1", customerId: "customer-1", customerName: "Budi",
      customer: { type: "UMUM", email: "private@example.test" }, status: "DP", paymentMethod: "CASH",
      total: 100000, amountPaid: 25000, createdAt: new Date("2026-10-01T00:00:00Z"),
      invoiceDate: new Date("2026-10-01T00:00:00Z"),
      debtPaymentLogs: [{ id: "payment-1", amount: 25000, paymentMethod: "CASH", createdAt: new Date("2026-10-02T00:00:00Z") }],
      items: [{ productName: "Private product", unitCost: 123 }], cashierId: "private-user",
    }]);
  });

  it("returns only receivable fields without customer or transaction read permission", async () => {
    const response = await GET(new Request("http://localhost/api/customer-receivables/invoices?status=all"));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.data[0]).toMatchObject({ invoiceNumber: "INV-1", customerName: "Budi", total: 100000, amountPaid: 25000 });
    expect(result.data[0]).not.toHaveProperty("items");
    expect(result.data[0]).not.toHaveProperty("customer.email");
    expect(result.data[0]).not.toHaveProperty("cashierId");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store-1" }) }));
  });

  it("denies the list when the Pelanggan page permission is absent", async () => {
    mocks.page.mockResolvedValue(false);
    expect((await GET(new Request("http://localhost/api/customer-receivables/invoices"))).status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("rejects invalid filters before querying", async () => {
    expect((await GET(new Request("http://localhost/api/customer-receivables/invoices?status=invalid"))).status).toBe(422);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("does not classify an unpaid Tempo invoice as settled", async () => {
    await GET(new Request("http://localhost/api/customer-receivables/invoices?status=settled"));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([expect.objectContaining({ amountPaid: { gte: "TOTAL_FIELD" } })]),
      }),
    }));
  });
});

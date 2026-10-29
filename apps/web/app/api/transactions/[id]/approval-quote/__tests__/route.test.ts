import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/features/product-price-rounding/server/rounding-settings", () => ({ getPriceRoundingSettings: vi.fn().mockResolvedValue({ enabled: false, increment: 500, threshold: 50 }) }));
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const canRolePerformActionMock = vi.hoisted(() => vi.fn());
const getGlobalRolePermissionsMock = vi.hoisted(() => vi.fn());
const buildApprovalQuoteMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({ db: {} }));

vi.mock("@/features/rbac/helpers/rbac-core", () => ({
  canRolePerformAction: canRolePerformActionMock,
  buildDefaultRolePermissions: vi.fn(() => ({})),
}));

vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getGlobalRolePermissions: getGlobalRolePermissionsMock,
}));

vi.mock("@/features/transactions-draft/services/approval-quote", () => ({
  buildApprovalQuote: buildApprovalQuoteMock,
}));

describe("GET /api/transactions/[id]/approval-quote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    getGlobalRolePermissionsMock.mockResolvedValue({});
    canRolePerformActionMock.mockReturnValue(false);
    buildApprovalQuoteMock.mockResolvedValue({
      items: [],
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      fingerprint: "quote-fingerprint",
    });
  });

  it.each([
    { priceIntent: "AUTOMATIC", expected: 4049 },
    { priceIntent: "MANUAL", expected: 4000 },
    { priceIntent: undefined, expected: 4000 },
  ] as const)("keeps $priceIntent intent through the quote API and returns current selling totals", async ({ priceIntent, expected }) => {
    const { buildApprovalQuote } = await vi.importActual<typeof import("@/features/transactions-draft/services/approval-quote")>("@/features/transactions-draft/services/approval-quote");
    const client = {
      storeSettings: { findUnique: vi.fn().mockResolvedValue({ specialPricingEnabled: true }) },
      transaction: { findFirst: vi.fn().mockResolvedValue({ id: "tx-1", storeId: "store-main", status: "DRAFT", customerId: "customer-1", customer: { type: "INDUSTRI" }, discount: 0, tax: 0, items: [] }) },
      product: { findMany: vi.fn().mockResolvedValue([{ id: "paper", name: "Kertas", price: 4049, costPrice: 1000, hargaAgen: null, hargaDinas: null, unit: "pcs", categoryId: "paper-category", category: { name: "Kertas" }, brandId: null, brand: null }]) },
      printingService: { findMany: vi.fn().mockResolvedValue([]) },
      categoryCustomerPricingRule: { findMany: vi.fn().mockResolvedValue([]) },
    };
    buildApprovalQuoteMock.mockImplementation((_tx, input) => buildApprovalQuote(client as never, input));
    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approval-quote", { method: "POST", body: JSON.stringify({ type: "draft",
      items: [{ productId: "paper", quantity: 2, submittedPrice: 4000, priceIntent }],
    }) }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    const quote = await response.json();
    expect(quote).toMatchObject({ subtotal: expected * 2, total: expected * 2 });
    expect(quote.items[0].appliedUnitPrice).toBe(expected);
    expect(quote.items[0].input.priceIntent).toBe(priceIntent);
    expect(quote.items[0]).not.toHaveProperty("unitCost");
  });

  it("rejects unknown price intent before writing approval data", async () => {
    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approval-quote", { method: "POST", body: JSON.stringify({
      type: "draft", paymentMethod: "CASH", amountPaid: 10000, quoteFingerprint: "fresh-quote",
      items: [{ productId: "paper", quantity: 1, submittedPrice: 4000, priceIntent: "INVALID" }],
    }) }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(422);
    expect(buildApprovalQuoteMock).not.toHaveBeenCalled();
  });

  it("requires draft approval permission and does not expose modal cost by default", async () => {
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approval-quote", {
        method: "POST",
        body: JSON.stringify({
          type: "draft",
          items: [{ productId: "paper", quantity: 1 }],
        }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("transaction.draft", "update");
    expect(buildApprovalQuoteMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        transactionId: "tx-1",
        storeId: "store-main",
        actorRole: "OWNER",
        canViewCostPrice: false,
      }),
    );
  });

  it("uses pending-approval permission for temporary transactions", async () => {
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approval-quote", {
        method: "POST",
        body: JSON.stringify({
          type: "pending",
          items: [{ productId: "paper", quantity: 1 }],
        }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("transaction.approve", "update");
  });
});

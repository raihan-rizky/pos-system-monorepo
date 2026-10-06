import { beforeEach, describe, expect, it, vi } from "vitest";
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

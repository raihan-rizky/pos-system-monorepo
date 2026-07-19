import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const expenseFindFirstMock = vi.hoisted(() => vi.fn());
const expenseUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    expense: {
      findFirst: expenseFindFirstMock,
      update: expenseUpdateMock,
    },
    transaction: { findFirst: vi.fn() },
  },
}));

import { DELETE, PATCH } from "../route";

describe("automatic shopping-request expenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ id: "owner-1", storeId: "store-1" });
    handleAuthErrorMock.mockReturnValue(null);
    expenseFindFirstMock.mockResolvedValue({
      id: "expense-1",
      deletedAt: null,
      shoppingRequestId: "request-1",
    });
  });

  it("rejects editing an expense created from a shopping request", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/finance/expenses/expense-1", {
        method: "PATCH",
        body: JSON.stringify({
          applicantName: "Nama Baru",
          category: "SUPPLIES",
          amount: 10000,
          changeAmount: 0,
          occurredAt: "2026-07-01",
        }),
      }),
      { params: Promise.resolve({ id: "expense-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: expect.stringContaining("Permohonan Belanja"),
      }),
    );
    expect(expenseUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects deleting an expense created from a shopping request", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/finance/expenses/expense-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "expense-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: expect.stringContaining("Permohonan Belanja"),
      }),
    );
    expect(expenseUpdateMock).not.toHaveBeenCalled();
  });
});

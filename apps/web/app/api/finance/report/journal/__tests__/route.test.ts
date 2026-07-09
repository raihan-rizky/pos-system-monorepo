import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const expenseFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: { findMany: transactionFindManyMock },
    expense: { findMany: expenseFindManyMock },
  },
}));

describe("GET /api/finance/report/journal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    handleAuthErrorMock.mockReturnValue(null);
    transactionFindManyMock.mockResolvedValue([]);
    expenseFindManyMock.mockResolvedValue([]);
  });

  it("scopes both sales and expense rows to the current store", async () => {
    const response = await GET(
      new Request("http://localhost/api/finance/report/journal?period=monthly"),
    );

    expect(response.status).toBe(200);
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
        }),
      }),
    );
    expect(expenseFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recordedBy: { storeId: "store-1" },
          deletedAt: null,
        }),
      }),
    );
  });

  it("queries sales journal rows by invoiceDate", async () => {
    const response = await GET(
      new Request("http://localhost/api/finance/report/journal?period=monthly"),
    );

    expect(response.status).toBe(200);
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoiceDate: { gte: expect.any(Date), lt: expect.any(Date) },
        }),
        orderBy: { invoiceDate: "asc" },
        select: expect.objectContaining({ invoiceDate: true }),
      }),
    );
  });
});

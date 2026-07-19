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
          storeId: "store-1",
          deletedAt: null,
        }),
      }),
    );
  });

  it("labels shopping-request expenses and missing cost snapshots in exports", async () => {
    expenseFindManyMock.mockResolvedValueOnce([
      {
        id: "expense-1",
        occurredAt: new Date("2026-07-01T02:00:00.000Z"),
        applicantName: "CV Kertas",
        category: "SUPPLIES",
        description: "Permohonan Belanja DPB-202607-001 - 2 item",
        amount: { toString: () => "0.00" },
        changeAmount: { toString: () => "0.00" },
        hasMissingCostSnapshot: true,
        shoppingRequest: { id: "request-1", number: "DPB-202607-001" },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/finance/report/journal?period=monthly"),
    );
    const body = await response.json();

    expect(body.rows[0].products).toContain("Permohonan Belanja DPB-202607-001");
    expect(body.rows[0].products).toContain("Harga modal tidak tersedia saat approval");
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

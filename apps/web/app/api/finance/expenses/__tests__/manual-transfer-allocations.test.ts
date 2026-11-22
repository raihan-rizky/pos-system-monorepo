import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../[id]/allocations/route";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), page: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, canAuthenticatedUserAccessPage: mocks.page,
  handleAuthError: (error: unknown) => error instanceof Error && error.message === "forbidden" ? new Response(null, { status: 403 }) : null }));
vi.mock("@pos/db", () => ({ db: { expense: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

describe("alokasi transfer manual", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: "owner-1", storeId: "store-1" });
    mocks.page.mockResolvedValue(true);
    mocks.findFirst.mockResolvedValue({ id: "e1", manualTransferAllocations: [{ amount: 100, payableId: "d1", paymentId: "p1",
      payable: { supplierName: "Pemasok", reportCategory: "ATK" }, payment: { paidAt: new Date("2026-11-05T00:00:00Z"), origin: "MANUAL" } }] });
  });
  it("mengembalikan alokasi dan rincian hutang dalam toko yang sama", async () => {
    const response = await GET(new Request("http://localhost/api"), { params: Promise.resolve({ id: "e1" }) });
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("expense", "read");
    expect(mocks.permission).toHaveBeenCalledWith("expense.payable", "read");
    expect(mocks.permission).toHaveBeenCalledWith("expense.manual_transfer.allocation", "update");
    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({ id: "e1", storeId: "store-1", manualPurchasePaymentMethod: "TRANSFER", deletedAt: null });
    expect(await response.json()).toMatchObject({ allocations: [{ payableId: "d1", paymentId: "p1", amount: 100, supplierName: "Pemasok", reportCategory: "ATK", paidAt: "2026-11-05" }] });
  });
  it("tidak membaca hubungan ketika izin tidak tersedia", async () => {
    mocks.permission.mockImplementation(async (target: string) => { if (target === "expense.payable") throw new Error("forbidden"); return { id: "user-1", storeId: "store-1" }; });
    expect((await GET(new Request("http://localhost/api"), { params: Promise.resolve({ id: "e1" }) })).status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("tidak membaca alokasi tanpa akses halaman Keuangan", async () => {
    mocks.page.mockResolvedValue(false);
    expect((await GET(new Request("http://localhost/api"), { params: Promise.resolve({ id: "e1" }) })).status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), list: vi.fn(), apply: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: () => null }));
vi.mock("@/features/keuangan/repositories/supplier-credit-repository", () => ({
  SupplierCreditError: class extends Error {},
  listPayableSupplierCredits: mocks.list,
  applyExpenseSupplierCredit: mocks.apply,
}));
import { GET, POST } from "../route";

const url = "http://localhost/api/finance/supplier-payables/payable-1/credits";
const context = { params: Promise.resolve({ id: "payable-1" }) };
const actor = { id: "owner-1", storeId: "store-1" };
const body = { creditId: "credit-1", amountCents: 1200, requestId: "43c10dcf-8281-4fa0-8cfb-64e835ae9051" };

describe("API kredit pemasok pada giro", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue(actor);
    mocks.list.mockResolvedValue({ remainingCents: 1200, credits: [] });
    mocks.apply.mockResolvedValue({ applicationId: "application-1" });
  });

  it("memisahkan izin baca dan ubah serta menggunakan toko pengguna", async () => {
    expect((await GET(new Request(url), context)).status).toBe(200);
    expect((await POST(new Request(url, { method: "POST", body: JSON.stringify(body) }), context)).status).toBe(201);
    expect(mocks.permission.mock.calls).toEqual([["expense.giro", "read"], ["expense.giro", "update"]]);
    expect(mocks.list).toHaveBeenCalledWith("payable-1", "store-1");
    expect(mocks.apply).toHaveBeenCalledWith({ ...body, payableId: "payable-1" }, actor);
  });

  it("menolak nominal nol dan menolak toko yang tidak tersedia", async () => {
    expect((await POST(new Request(url, { method: "POST", body: JSON.stringify({ ...body, amountCents: 0 }) }), context)).status).toBe(422);
    mocks.permission.mockResolvedValueOnce({ ...actor, storeId: null });
    expect((await GET(new Request(url), context)).status).toBe(403);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
});

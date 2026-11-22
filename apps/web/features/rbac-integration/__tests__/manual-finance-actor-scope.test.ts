import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createReceivable } from "@/app/api/customer-receivables/route";
import { PATCH as editReceivable } from "@/app/api/customer-receivables/[id]/route";
import { POST as payReceivable } from "@/app/api/customer-receivables/[id]/payments/route";
import { PATCH as editReceivablePayment } from "@/app/api/customer-receivables/[id]/payments/[paymentId]/route";
import { PATCH as editPayable } from "@/app/api/finance/supplier-payables/[id]/route";
import { PATCH as editPayablePayment } from "@/app/api/finance/supplier-payables/[id]/payments/[paymentId]/route";
import { GET as readAllocations } from "@/app/api/finance/expenses/[id]/allocations/route";
import { GET as readGiro } from "@/app/api/finance/giro/route";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), transaction: vi.fn(), query: vi.fn(), find: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: mocks.permission,
  canAuthenticatedUserAccessPage: async () => true,
  handleAuthError: () => null,
  AuthError: class extends Error {},
}));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction, $queryRaw: mocks.query, expense: { findFirst: mocks.find } } }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

const context = { params: Promise.resolve({ id: "d1", paymentId: "p1" }) };
const request = (method: string) => new Request("http://localhost/api", { method, ...(method === "GET" ? {} : { body: "{}" }) });

describe("izin gabungan memakai identitas dan peran yang sama", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValueOnce({ id: "u1", storeId: "s1", role: "OWNER" })
      .mockResolvedValue({ id: "u1", storeId: "s1", role: "CASHIER" });
    mocks.query.mockResolvedValue([]);
  });
  it.each([
    ["buat piutang", () => createReceivable(request("POST"))],
    ["koreksi piutang", () => editReceivable(request("PATCH"), context)],
    ["pembayaran piutang", () => payReceivable(request("POST"), context)],
    ["koreksi pembayaran piutang", () => editReceivablePayment(request("PATCH"), context)],
    ["koreksi hutang", () => editPayable(request("PATCH"), context)],
    ["koreksi pembayaran hutang", () => editPayablePayment(request("PATCH"), context)],
    ["alokasi transfer", () => readAllocations(request("GET"), context)],
    ["daftar giro", () => readGiro(request("GET"))],
  ])("menolak %s jika peran berubah di antara pemeriksaan", async (_label, run) => {
    expect((await run()).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
  });
});

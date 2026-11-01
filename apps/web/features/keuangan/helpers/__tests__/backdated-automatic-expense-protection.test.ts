import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  removeProof: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@pos/db", () => ({
  db: { expense: { findFirst: mocks.findFirst, update: mocks.update }, transaction: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: mocks.requirePermission,
  handleAuthError: () => null,
}));
vi.mock("@/features/proof-upload/server/remove-stored-proof", () => ({
  removeStoredProofAsset: mocks.removeProof,
}));

import { DELETE as deleteExpense, PATCH as editExpense } from "@/app/api/finance/expenses/[id]/route";
import { DELETE as deleteAttachment } from "@/app/api/finance/expenses/[id]/attachment/route";

const params = { params: Promise.resolve({ id: "expense-1" }) };
const request = (method: string) => new Request("http://localhost/api/finance/expenses/expense-1", { method });

describe("perlindungan pengeluaran belanja terdahulu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.removeProof.mockResolvedValue({ storage: "r2" });
  });

  for (const source of ["backdatedPurchaseDueId", "backdatedPurchasePaymentId"] as const) {
    it.each([
      ["mengedit", editExpense, "PATCH"],
      ["menghapus", deleteExpense, "DELETE"],
    ] as const)(`menolak %s pengeluaran dengan ${source}`, async (_action, handler, method) => {
      const row = {
        id: "expense-1", storeId: "store-1", deletedAt: null,
        goodsPurchaseId: null, shoppingRequestId: null,
        backdatedPurchaseDueId: null, backdatedPurchasePaymentId: null,
        [source]: "source-1",
      };
      // Preserve Prisma's select behavior so omitted source fields cannot satisfy the guard.
      mocks.findFirst.mockImplementation(async ({ select }) =>
        Object.fromEntries(Object.keys(select).map((key) => [key, row[key as keyof typeof row]])),
      );

      const response = await handler(request(method), params);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ message: expect.stringContaining("Belanja Terdahulu") });
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it(`menolak menghapus lampiran pengeluaran dengan ${source}`, async () => {
      const row = {
        id: "expense-1", storeId: "store-1", deletedAt: null, attachmentUrl: "proof-1",
        goodsPurchaseId: null, shoppingRequestId: null,
        backdatedPurchaseDueId: null, backdatedPurchasePaymentId: null,
        [source]: "source-1",
      };
      mocks.findFirst.mockImplementation(async ({ select }) =>
        Object.fromEntries(Object.keys(select).map((key) => [key, row[key as keyof typeof row]])),
      );

      const response = await deleteAttachment(request("DELETE"), params);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ message: expect.stringContaining("Belanja Terdahulu") });
      expect(mocks.removeProof).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    });
  }
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => ({ requirePermission: vi.fn(), canAuthenticatedUserPerform: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({
  ...guard,
  AuthError: class extends Error {
    constructor(public readonly statusCode: number, message: string) { super(message); }
  },
}));

import { requireExpenseCorrectionAccess } from "../expense-correction-access";

const subject = {
  type: "BACKDATED_PURCHASE",
  id: "purchase-1",
  payment: { kind: "BACKDATED_PAYMENT", id: "payment-2" },
} as const;
const actor = { id: "user-1", name: "Admin", role: "ADMIN", storeId: "store-1" };

describe("akses koreksi pengeluaran", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guard.requirePermission.mockResolvedValue(actor);
    guard.canAuthenticatedUserPerform.mockResolvedValue(true);
  });

  it("memerlukan akses pengeluaran dan hak pembayaran sumber sesuai aksi", async () => {
    await expect(requireExpenseCorrectionAccess(subject, "cancel")).resolves.toMatchObject(actor);
    expect(guard.requirePermission).toHaveBeenCalledWith("expense", "read");
    expect(guard.canAuthenticatedUserPerform).toHaveBeenCalledWith(actor, "expense", "delete");
    expect(guard.canAuthenticatedUserPerform).toHaveBeenCalledWith(actor, "supplier.backdated_payment.correction", "delete");
  });

  it.each(["expense", "supplier.backdated_payment.correction"])("menolak bila izin %s tidak tersedia", async (denied) => {
    guard.canAuthenticatedUserPerform.mockImplementation(async (_actor, resource) => resource !== denied);
    await expect(requireExpenseCorrectionAccess(subject, "edit")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("menolak pengguna tanpa toko walaupun memiliki izin", async () => {
    guard.requirePermission.mockResolvedValue({ ...actor, storeId: null });
    await expect(requireExpenseCorrectionAccess(subject, "edit")).rejects.toMatchObject({ statusCode: 403 });
    expect(guard.canAuthenticatedUserPerform).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpenseCorrectionPreviewInput } from "../../helpers/expense-correction-input";

const mocks = vi.hoisted(() => ({
  purchase: vi.fn(), editor: vi.fn(), plan: vi.fn(), commit: vi.fn(),
  existing: vi.fn(), audit: vi.fn(), lock: vi.fn(),
}));
vi.mock("@pos/db", () => ({
  db: { $transaction: (fn: (tx: unknown) => unknown) => fn({
    goodsPurchase: { findFirst: mocks.purchase },
    expenseCorrection: { findUnique: mocks.existing, create: mocks.audit },
    $queryRaw: mocks.lock,
  }) },
}));
vi.mock("@/features/suppliers/shopping-requests/repositories/shopping-request-correction-editor", () => ({
  loadShoppingRequestCorrectionEditor: mocks.editor,
}));
vi.mock("@/features/suppliers/shopping-requests/repositories/shopping-request-correction-plan", () => ({
  planShoppingRequestCorrection: mocks.plan,
}));
vi.mock("@/features/suppliers/shopping-requests/repositories/shopping-request-correction-repository", () => ({
  commitShoppingRequestCorrectionRecord: mocks.commit,
}));
import { commitGoodsExpenseEdit, previewGoodsExpenseEdit } from "../goods-expense-edit-repository";

const actor = { id: "user-1", storeId: "store-1", name: "Pengguna" };
const request: ExpenseCorrectionPreviewInput = {
  subject: { type: "GOODS_PURCHASE", id: "purchase-1", payment: { kind: "SUPPLIER_PAYABLE_PAYMENT", id: "payment-1" } },
  operation: "edit",
  draft: { reason: "Perbaiki pembayaran", changes: { amountCents: 20_000 }, dispositions: [] },
};
const editor = {
  requestId: "request-1", purchaseId: "purchase-1", version: "a".repeat(64),
  header: { name: "Daftar", businessDate: "2026-11-01" }, items: [],
  payment: {
    method: "GIRO", dueDate: "2026-11-30",
    sources: [{ paymentId: "payment-1", amount: "300.00", paidAt: "2026-11-02", sourceKind: "PAYABLE_PAYMENT" }],
    allocations: [{ paymentId: "payment-1", amount: "300.00", method: "GIRO", sourceKind: "PAYABLE_PAYMENT" }],
  },
};
const corePreview = { version: "b".repeat(64), oldTotal: "1000.00", newTotal: "1000.00", paid: "200.00", stock: [], changes: [] };
const requestId = "43c10dcf-8281-4fa0-8cfb-64e835ae9051";
const now = new Date("2026-11-20T07:00:00Z");

describe("alur ubah Pembelian Barang dari Keuangan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.purchase.mockResolvedValue({ shoppingRequestId: "request-1" });
    mocks.editor.mockResolvedValue(editor);
    mocks.plan.mockResolvedValue({ editor, preview: corePreview });
    mocks.lock.mockResolvedValue([{ id: "store-1" }]);
    mocks.commit.mockResolvedValue({ correctionId: "supplier-audit", preview: corePreview });
    mocks.audit.mockResolvedValue({ id: "finance-audit" });
  });

  it("menemukan dokumen sumber dalam toko dan meninjau koreksi satu pembayaran", async () => {
    const preview = await previewGoodsExpenseEdit(request, actor, now);
    expect(mocks.purchase).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "purchase-1", storeId: "store-1", status: "APPROVED" },
    }));
    expect(preview).toMatchObject({ version: corePreview.version, blockers: [], impact: {
      before: { amountCents: 100_000, remainingCents: 70_000 },
      after: { amountCents: 100_000, remainingCents: 80_000 },
    } });
    expect(mocks.plan).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      requestId: editor.requestId,
      data: expect.objectContaining({ payment: expect.objectContaining({
        corrections: [{ paymentId: "payment-1", sourceKind: "PAYABLE_PAYMENT", amount: "200.00", paidAt: "2026-11-02" }],
      }) }),
    }));
  });

  it("menolak pembelian dari toko lain atau editor yang mengarah ke pembelian lain", async () => {
    mocks.purchase.mockResolvedValueOnce(null);
    await expect(previewGoodsExpenseEdit(request, actor, now)).rejects.toMatchObject({ status: 404 });
    mocks.editor.mockResolvedValueOnce({ ...editor, purchaseId: "other-purchase" });
    await expect(previewGoodsExpenseEdit(request, actor, now)).rejects.toMatchObject({ status: 409 });
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("menyimpan lewat mesin koreksi yang sama dan menolak pratinjau kedaluwarsa", async () => {
    await expect(commitGoodsExpenseEdit({ ...request, version: "c".repeat(64), requestId }, actor, now))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.commit).not.toHaveBeenCalled();
    await expect(commitGoodsExpenseEdit({ ...request, version: corePreview.version, requestId }, actor, now))
      .resolves.toEqual({ auditId: "finance-audit" });
    expect(mocks.commit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actor, requestId: editor.requestId, data: expect.objectContaining({ expectedPreviewVersion: corePreview.version }),
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      storeId: actor.storeId, subjectId: "purchase-1", paymentId: "payment-1", action: "EDIT",
    }) }));
  });
});

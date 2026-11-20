import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpenseCorrectionPreviewInput } from "../../helpers/expense-correction-input";

const mocks = vi.hoisted(() => ({
  editor: vi.fn(), stock: vi.fn(), cancelStock: vi.fn(), plan: vi.fn(), correct: vi.fn(),
  lock: vi.fn(), prior: vi.fn(), audit: vi.fn(),
  retireExpense: vi.fn(),
}));
vi.mock("@pos/db", () => ({ db: {
  $transaction: (fn: (tx: unknown) => unknown) => fn({
    expenseCorrection: { findUnique: mocks.prior, create: mocks.audit },
    expense: { updateMany: mocks.retireExpense },
    expenseSupplierCreditApplication: { aggregate: async () => ({ _sum: { amount: null } }) },
    $queryRaw: mocks.lock,
  }),
} }));
vi.mock("../goods-expense-edit-repository", async (original) => ({
  ...await original<typeof import("../goods-expense-edit-repository")>(),
  loadEditor: mocks.editor,
}));
vi.mock("@/features/suppliers/shopping-requests/repositories/shopping-request-deletion-repository", () => ({
  previewGoodsPurchaseStockCancellation: mocks.stock, cancelGoodsPurchaseWithStock: mocks.cancelStock,
}));
vi.mock("@/features/suppliers/shopping-requests/repositories/shopping-request-correction-plan", () => ({
  planShoppingRequestCorrection: mocks.plan,
}));
vi.mock("@/features/suppliers/shopping-requests/repositories/shopping-request-correction-repository", () => ({
  commitShoppingRequestCorrectionRecord: mocks.correct,
}));
import { commitGoodsExpenseCancellation, previewGoodsExpenseCancellation } from "../goods-expense-cancellation";

const actor = { id: "user-1", name: "Pemilik", storeId: "store-1" };
const now = new Date("2026-11-20T07:00:00Z");
const requestId = "43c10dcf-8281-4fa0-8cfb-64e835ae9051";
const purchase = { type: "GOODS_PURCHASE", id: "purchase-1" } as const;
const payment = { ...purchase, payment: { kind: "SUPPLIER_PAYABLE_PAYMENT", id: "payment-2" } } as const;
const all = [
  { kind: "refund" as const, amountCents: 20_000, paymentId: "payment-1", reference: "REF-1", date: "2026-11-20" },
  { kind: "credit" as const, amountCents: 30_000, paymentId: "payment-2", reference: "NK-1", supplierId: "supplier-1" },
] as const;
const editor = {
  requestId: "request-1", purchaseId: "purchase-1", totalAmount: "1000.00", version: "a".repeat(64),
  header: { supplierId: "supplier-1" }, items: [],
  payment: {
    method: "GIRO", dueDate: "2026-11-30",
    sources: [
      { paymentId: "payment-1", sourceKind: "PAYABLE_PAYMENT", paidAt: "2026-11-05", amount: "200.00" },
      { paymentId: "payment-2", sourceKind: "PAYABLE_PAYMENT", paidAt: "2026-11-08", amount: "300.00" },
    ],
    allocations: [
      { paymentId: "payment-1", sourceKind: "PAYABLE_PAYMENT", method: "GIRO", amount: "200.00" },
      { paymentId: "payment-2", sourceKind: "PAYABLE_PAYMENT", method: "GIRO", amount: "300.00" },
    ],
  },
};

function input(subject: ExpenseCorrectionPreviewInput["subject"], dispositions: ExpenseCorrectionPreviewInput["draft"]["dispositions"]): ExpenseCorrectionPreviewInput {
  return { subject, operation: "cancel", draft: { reason: "Pembelian tercatat ganda", dispositions } };
}

describe("pembatalan Pembelian Barang dari Keuangan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.editor.mockResolvedValue(editor);
    mocks.stock.mockResolvedValue({ id: purchase.id, number: "PB-1", movements: [{ productId: "product-1", baseQuantity: 2 }] });
    mocks.plan.mockResolvedValue({ preview: { version: "b".repeat(64) } });
    mocks.audit.mockResolvedValue({ id: "correction-1" });
    mocks.retireExpense.mockResolvedValue({ count: 1 });
  });

  it("memerlukan penyelesaian pembayaran sebelum membalik stok", async () => {
    const request = input(purchase, []);
    const preview = await previewGoodsExpenseCancellation(request, actor, now);
    expect(preview.blockers).toHaveLength(2);
    await expect(commitGoodsExpenseCancellation({ ...request, version: preview.version, requestId }, actor, now))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.cancelStock).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("membatasi kredit pada pemasok pembelian dan mencatat dua penyelesaian saat pembatalan sah", async () => {
    const wrongSupplier = input(purchase, [all[0], { ...all[1], supplierId: "supplier-other" }]);
    expect((await previewGoodsExpenseCancellation(wrongSupplier, actor, now)).blockers).toHaveLength(1);
    const request = input(purchase, [...all]);
    const preview = await previewGoodsExpenseCancellation(request, actor, now);
    expect(preview).toMatchObject({ blockers: [], impact: {
      after: { amountCents: 0, remainingCents: 0 }, stockMovements: [{ productId: "product-1", baseQuantity: 2 }],
    } });
    await expect(commitGoodsExpenseCancellation({ ...request, version: preview.version, requestId }, actor, now))
      .resolves.toEqual({ auditId: "correction-1" });
    expect(mocks.cancelStock).toHaveBeenCalledWith(expect.anything(), editor.requestId, purchase.id, request.draft.reason, actor, now);
    expect(mocks.retireExpense).toHaveBeenCalledWith({
      where: { storeId: actor.storeId, goodsPurchaseId: purchase.id, deletedAt: null },
      data: { deletedAt: now },
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ settlements: { create: [
        expect.objectContaining({ kind: "REFUND", paymentId: "payment-1", amount: "200.00" }),
        expect.objectContaining({ kind: "CREDIT", paymentId: "payment-2", amount: "300.00", supplierId: "supplier-1" }),
      ] } }),
    }));
  });

  it("membatalkan hanya pembayaran yang dipilih melalui koreksi sumber", async () => {
    const request = input(payment, [all[1]]);
    const preview = await previewGoodsExpenseCancellation(request, actor, now);
    expect(preview).toMatchObject({
      blockers: [], impact: { after: { amountCents: 100_000, remainingCents: 80_000 }, stockMovements: [] },
    });
    await commitGoodsExpenseCancellation({ ...request, version: preview.version, requestId }, actor, now);
    expect(mocks.stock).not.toHaveBeenCalled();
    expect(mocks.cancelStock).not.toHaveBeenCalled();
    expect(mocks.retireExpense).not.toHaveBeenCalled();
    expect(mocks.correct).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      data: expect.objectContaining({ payment: expect.objectContaining({
        corrections: [{ paymentId: "payment-2", sourceKind: "PAYABLE_PAYMENT", paidAt: "2026-11-08", amount: "0.00" }],
        allocations: [editor.payment.allocations[0]],
      }) }),
    }));
  });
});

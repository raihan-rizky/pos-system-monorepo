import { z } from "zod";
import type { ShoppingRequestCorrectionEditor } from "@/features/suppliers/shopping-requests/repositories/shopping-request-correction-editor";
import type { ShoppingRequestCorrectionInput } from "@/features/suppliers/shopping-requests/types/shopping-request-correction";
import type { ExpenseCorrectionOperation, ExpenseCorrectionSubject } from "./expense-correction-contract";

type GoodsPayment = NonNullable<Extract<ExpenseCorrectionSubject, { type: "GOODS_PURCHASE" }>["payment"]>;

const editInput = z.strictObject({
  amountCents: z.number().int().positive().max(999_999_999_999).optional(),
  paidAt: z.iso.date().optional(),
});

export function buildGoodsExpensePaymentCorrection(input: {
  editor: ShoppingRequestCorrectionEditor;
  payment: GoodsPayment;
  operation: ExpenseCorrectionOperation;
  changes?: Record<string, unknown>;
  reason: string;
  key: string;
  today: string;
}): ShoppingRequestCorrectionInput {
  const { editor, payment } = input;
  const isTransfer = payment.kind === "GOODS_INITIAL_TRANSFER";
  const source = editor.payment.sources.find(entry => isTransfer
    ? payment.id === editor.purchaseId && entry.sourceKind === "TRANSFER_EXPENSE"
    : entry.sourceKind === "PAYABLE_PAYMENT" && entry.paymentId === payment.id);
  if (!source || Number(source.amount) <= 0) throw new Error("Pembayaran pembelian aktif tidak ditemukan.");

  const currentCents = Math.round(Number(source.amount) * 100);
  const parsed = editInput.safeParse(input.changes ?? {});
  if (!parsed.success) throw new Error("Periksa nominal dan tanggal pembayaran.");
  const paidAt = parsed.data.paidAt ?? source.paidAt;
  if (paidAt > input.today) throw new Error("Tanggal pembayaran tidak boleh setelah hari ini.");
  const nextCents = input.operation === "cancel" ? 0 : parsed.data.amountCents ?? currentCents;
  if (nextCents === currentCents && paidAt === source.paidAt) throw new Error("Belum ada perubahan pembayaran.");

  const matches = (entry: typeof editor.payment.allocations[number]) =>
    entry.sourceKind === source.sourceKind && entry.paymentId === source.paymentId;
  const allocations = editor.payment.allocations.filter(entry => !matches(entry));
  const selected = editor.payment.allocations.filter(matches);
  let remainingCents = nextCents;
  for (const [index, allocation] of selected.entries()) {
    const allocatedCents = Math.round(Number(allocation.amount) * 100);
    const amount = index === selected.length - 1 ? remainingCents :
      Number((BigInt(nextCents) * BigInt(allocatedCents) + BigInt(Math.floor(currentCents / 2))) / BigInt(currentCents));
    if (amount > 0) allocations.push({ ...allocation, amount: (amount / 100).toFixed(2) });
    remainingCents -= amount;
  }
  if (remainingCents !== 0) throw new Error("Alokasi pembayaran tersimpan belum lengkap.");

  return {
    idempotencyKey: input.key,
    expectedVersion: editor.version,
    reason: input.reason,
    header: editor.header,
    items: editor.items,
    catalog: [],
    payment: {
      method: editor.payment.method, dueDate: editor.payment.dueDate,
      ...(editor.payment.schedule?.length ? { schedule: editor.payment.schedule } : {}),
      allocations,
      corrections: [{ ...source, amount: (nextCents / 100).toFixed(2), paidAt }],
    },
  };
}

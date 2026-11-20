import { z } from "zod";
import type { ExpenseCorrectionSubject } from "./expense-correction-contract";
import type { ExpensePaymentDisposition } from "./expense-correction-settlement";

const id = z.string().trim().min(1).max(160);

export const expenseCorrectionSubject = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("SHOPPING_REQUEST"), id }),
  z.strictObject({
    type: z.literal("GOODS_PURCHASE"),
    id,
    payment: z.strictObject({
      kind: z.enum(["GOODS_INITIAL_TRANSFER", "SUPPLIER_PAYABLE_PAYMENT"]),
      id,
    }).optional(),
  }),
  z.strictObject({
    type: z.literal("BACKDATED_PURCHASE"),
    id,
    payment: z.strictObject({ kind: z.literal("BACKDATED_PAYMENT"), id }).optional(),
  }),
]) satisfies z.ZodType<ExpenseCorrectionSubject>;

const paymentDisposition = {
  paymentId: id,
  amountCents: z.number().int().positive().max(999_999_999_999),
  reference: z.string().trim().min(1).max(160),
};
const disposition = z.discriminatedUnion("kind", [
  z.strictObject({ ...paymentDisposition, kind: z.literal("refund"), date: z.iso.date() }),
  z.strictObject({ ...paymentDisposition, kind: z.literal("credit"), supplierId: id }),
  z.strictObject({ ...paymentDisposition, kind: z.literal("entryError") }),
]) satisfies z.ZodType<ExpensePaymentDisposition>;

export const expenseCorrectionOperation = z.enum(["edit", "cancel"]);

const draftRequest = z.strictObject({
  subject: expenseCorrectionSubject,
  operation: expenseCorrectionOperation,
  draft: z.strictObject({
    reason: z.string().trim().min(1).max(500),
    changes: z.record(z.string(), z.unknown()).optional(),
    dispositions: z.array(disposition).default([]),
  }),
});

function validChangeShape({ operation, draft }: z.infer<typeof draftRequest>): boolean {
  return operation === "edit"
    ? !!draft.changes && Object.keys(draft.changes).length > 0
    : draft.changes === undefined;
}

const changeRule = { path: ["draft", "changes"], message: "Isi perubahan sesuai aksi yang dipilih." };

export const expenseCorrectionPreview = draftRequest.refine(validChangeShape, changeRule);
export const expenseCorrectionConfirmation = draftRequest.extend({
  version: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.uuid(),
}).refine(validChangeShape, changeRule);

export type ExpenseCorrectionPreviewInput = z.infer<typeof expenseCorrectionPreview>;
export type ExpenseCorrectionConfirmationInput = z.infer<typeof expenseCorrectionConfirmation>;

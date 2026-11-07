import { z } from "zod";
import {
  planCorrectionPayments,
  type CorrectionPaymentAllocation,
  type CorrectionPaymentSource,
} from "../helpers/shopping-request-correction";

const source = z.object({
  paymentId: z.string().min(1),
  sourceKind: z.enum(["TRANSFER_EXPENSE", "PAYABLE_PAYMENT"]),
  amount: z.string(),
  paidAt: z.string(),
}).strict();
const allocation = z.object({
  paymentId: z.string().min(1),
  sourceKind: z.enum(["TRANSFER_EXPENSE", "PAYABLE_PAYMENT"]),
  method: z.enum(["TRANSFER", "GIRO"]),
  amount: z.string(),
}).strict();
const snapshot = z.object({
  paymentSnapshot: z.object({ sources: z.array(source), allocations: z.array(allocation) }).strict(),
});

export function readCorrectionPaymentSnapshot(value: unknown): {
  sources: CorrectionPaymentSource[];
  allocations: CorrectionPaymentAllocation[];
} {
  const result = snapshot.safeParse(value);
  if (!result.success) throw new Error("Riwayat pembayaran koreksi tidak lengkap. Periksa pembayaran secara manual.");
  const plan = planCorrectionPayments(result.data.paymentSnapshot.sources, result.data.paymentSnapshot.allocations, []);
  return { sources: plan.sources, allocations: plan.allocations };
}

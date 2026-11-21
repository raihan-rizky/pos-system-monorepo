import { z } from "zod";

const id = z.string().min(1);
const amount = z.number().finite().nonnegative();
const snapshotSchema = z.object({
  action: z.literal("VOID"),
  previousStatus: z.enum(["DRAFT", "PENDING_APPROVAL", "COMPLETED", "DP"]),
  transaction: z.object({ id, customerId: id.nullable(), invoiceNumber: z.string().nullable(), draftNumber: z.string().nullable() }),
  stockReturns: z.array(z.object({ productId: id, stockGroupIdSnapshot: id.nullable(), baseDelta: amount.positive() })),
  stockResults: z.array(z.object({ productId: id, stockGroupId: id.nullable(), baseDelta: amount.positive(), beforeStock: z.number().finite().optional(), afterStock: z.number().finite().optional(), beforeBaseStock: z.number().finite().optional(), afterBaseStock: z.number().finite().optional() })),
  suratJalan: z.array(z.object({ id, status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "REJECTED"]) })),
  financialReversal: z.object({ amountPaid: amount, debtRemoved: amount }).nullable(),
});

export function buildUnvoidPlan(transactionId: string, snapshot: unknown) {
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success || parsed.data.transaction.id !== transactionId) {
    throw new Error("Audit void tidak lengkap. Transaksi perlu diperiksa.");
  }
  const data = parsed.data;
  const returns = new Map(data.stockReturns.map((item) => [JSON.stringify([item.productId, item.stockGroupIdSnapshot]), item.baseDelta]));
  const results = new Map(data.stockResults.map((item) => [JSON.stringify([item.productId, item.stockGroupId]), item.baseDelta]));
  if (returns.size !== data.stockReturns.length || results.size !== data.stockResults.length ||
      returns.size !== results.size || [...returns].some(([key, value]) => results.get(key) !== value) ||
      data.stockResults.some((item) => {
        const before = item.stockGroupId ? item.beforeBaseStock : item.beforeStock;
        const after = item.stockGroupId ? item.afterBaseStock : item.afterStock;
        return before === undefined || after === undefined || Math.abs(after - before - item.baseDelta) > 1e-8;
      }) ||
      new Set(data.suratJalan.map((shipment) => shipment.id)).size !== data.suratJalan.length ||
      (data.financialReversal !== null && data.transaction.customerId === null) ||
      (data.transaction.customerId !== null && data.financialReversal === null &&
       ["COMPLETED", "DP"].includes(data.previousStatus) &&
       (Boolean(data.transaction.invoiceNumber?.trim()) || !data.transaction.draftNumber?.trim()))) {
    throw new Error("Audit void tidak konsisten. Transaksi perlu diperiksa.");
  }
  return {
    previousStatus: data.previousStatus,
    customerId: data.transaction.customerId,
    stockReturns: data.stockReturns,
    shipments: data.suratJalan.filter((shipment) => shipment.status === "PENDING" || shipment.status === "CONFIRMED"),
    financialReversal: data.financialReversal,
  };
}

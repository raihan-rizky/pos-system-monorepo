import type { Prisma } from "@pos/db";
import { z } from "zod";

const voidStockAudit = z.object({
  action: z.literal("VOID"),
  transaction: z.object({ invoiceNumber: z.string().nullable() }),
  stockReturns: z.array(z.object({
    productId: z.string(),
    stockGroupIdSnapshot: z.string().nullable(),
    baseDelta: z.number().finite().positive(),
  })),
});

type StockReturn = {
  productId: string;
  stockGroupIdSnapshot: string | null;
  type: string;
  reason: string | null;
  unitMultiplierSnapshot: number | null;
  stockBaseDelta: number | null;
  quantity: number;
  note: string | null;
};

export async function hasAuditedVoidStockReturns(
  tx: Pick<Prisma.TransactionClient, "transactionLifecycleAudit">,
  storeId: string,
  transactionId: string,
  rows: StockReturn[],
) {
  if (!rows.length) return true;
  const audits = await tx.transactionLifecycleAudit.findMany({
    where: { storeId, transactionId, action: "VOID" },
    select: { snapshot: true },
  });
  const allowed = new Map<string, number>();
  for (const audit of audits) {
    const parsed = voidStockAudit.safeParse(audit.snapshot);
    if (!parsed.success) return false;
    const note = `Void transaksi ${parsed.data.transaction.invoiceNumber ?? transactionId}`;
    for (const item of parsed.data.stockReturns) {
      const key = JSON.stringify([item.productId, item.stockGroupIdSnapshot, item.baseDelta, note]);
      allowed.set(key, (allowed.get(key) ?? 0) + 1);
    }
  }
  for (const row of rows) {
    const key = JSON.stringify([row.productId, row.stockGroupIdSnapshot, row.stockBaseDelta, row.note]);
    const remaining = allowed.get(key) ?? 0;
    if (row.type !== "IN" || row.reason !== "SALE_RETURN" || row.unitMultiplierSnapshot !== 1 ||
        row.stockBaseDelta !== row.quantity || !remaining) return false;
    allowed.set(key, remaining - 1);
  }
  return true;
}

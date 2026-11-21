import type { Prisma } from "@pos/db";
import type { ManualTransferAllocationInput } from "./manual-transfer-allocation-service";

export async function lockTransferAllocationPayables(
  tx: Pick<Prisma.TransactionClient, "manualTransferAllocation" | "$queryRaw">,
  scope: { storeId: string; expenseId?: string },
  allocations: ManualTransferAllocationInput[],
) {
  const previous = scope.expenseId
    ? await tx.manualTransferAllocation.findMany({ where: { storeId: scope.storeId, expenseId: scope.expenseId }, select: { payableId: true } })
    : [];
  const ids = [...new Set([
    ...previous.map(row => row.payableId),
    ...allocations.flatMap(row => row && typeof row.payableId === "string" && row.payableId ? [row.payableId] : []),
  ])].sort();
  for (const id of ids) {
    await tx.$queryRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = ${id} AND "storeId" = ${scope.storeId} AND "goodsPurchaseId" IS NULL FOR UPDATE`;
  }
}

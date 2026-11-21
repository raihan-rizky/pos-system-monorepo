import type { Prisma } from "@pos/db";

/** Load complete ledgers so a payment corrected to another date keeps its history. */
export async function loadManualReceivablePeriod(client: Pick<Prisma.TransactionClient, "customerReceivable">, storeId: string, from: string, to: string) {
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000);
  return client.customerReceivable.findMany({
    where: { storeId, payments: { some: { OR: [
      { paidAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      { paidAt: null, createdAt: { gte: start, lt: end } },
    ] } } },
    select: { id: true, amount: true, reportCategory: true,
      payments: { select: { id: true, method: true, amount: true, paidAt: true, createdAt: true } } },
  });
}

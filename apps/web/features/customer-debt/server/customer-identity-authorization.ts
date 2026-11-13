import type { Prisma } from "@pos/db";
import {
  AuthError,
  canAuthenticatedUserAccessPage,
  requirePermission,
} from "@/lib/rbac/guard";
import { normalizeCustomerDebtName } from "../helpers/customer-debt-summary";
import { effectiveReceivable } from "../helpers/receivable-authorization";

export async function requireCustomerDebtIdentityPermission(
  tx: Prisma.TransactionClient,
  storeId: string,
  user: Parameters<typeof canAuthenticatedUserAccessPage>[0],
  customer: { id: string; name: string },
  nextName: string | null,
): Promise<void> {
  const deleting = nextName === null;
  if (!deleting && normalizeCustomerDebtName(customer.name) === normalizeCustomerDebtName(nextName)) return;
  const invoices = await tx.transaction.findMany({
    where: { storeId, OR: [{ customerId: customer.id }, { customerId: null }] },
    select: {id:true, customerId:true, customerName:true, status:true, paymentMethod:true, total:true, amountPaid:true},
    orderBy: {id:"asc"},
  });
  const relevant = invoices.filter(row => {
    if (effectiveReceivable({...row,total:Number(row.total),amountPaid:Number(row.amountPaid)}).amountCents === 0) return false;
    if (row.customerId) return deleting && row.customerId === customer.id;
    const name = normalizeCustomerDebtName(row.customerName);
    return name === normalizeCustomerDebtName(customer.name) || (!deleting && name === normalizeCustomerDebtName(nextName));
  });
  const destroysHistory = deleting && await tx.debtPaymentLog.count({where:{customerId:customer.id,storeId}}) > 0;
  if (relevant.length === 0 && !destroysHistory) return;
  if (!await canAuthenticatedUserAccessPage(user, "/customers")) {
    throw new AuthError(403, "Akses halaman Pelanggan diperlukan.");
  }
  await requirePermission("customer.receivable", "read");
  await requirePermission("customer.receivable", "update");
  for (const row of relevant) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "pos_transactions" WHERE "id" = $1 AND "storeId" = $2 FOR UPDATE', row.id, storeId);
  }
}

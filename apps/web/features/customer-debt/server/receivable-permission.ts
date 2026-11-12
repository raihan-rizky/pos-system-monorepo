import { requirePermission } from "@/lib/rbac/guard";
import { effectiveReceivable, type ReceivableSnapshot } from "../helpers/receivable-authorization";

export async function requireReceivableChangePermission(before: ReceivableSnapshot, after: ReceivableSnapshot): Promise<void> {
  const previous = effectiveReceivable(before);
  const next = effectiveReceivable(after);
  if (previous.amountCents === next.amountCents && previous.attribution === next.attribution) return;
  await requirePermission("customer.receivable", "read");
  await requirePermission("customer.receivable", "update");
}

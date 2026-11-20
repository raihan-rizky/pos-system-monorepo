import { AuthError, canAuthenticatedUserPerform, requirePermission } from "@/lib/rbac/guard";
import {
  expenseCorrectionPermission,
  type ExpenseCorrectionOperation,
  type ExpenseCorrectionSubject,
} from "../helpers/expense-correction-contract";

export async function requireExpenseCorrectionAccess(
  subject: ExpenseCorrectionSubject,
  operation: ExpenseCorrectionOperation,
) {
  const user = await requirePermission("expense", "read");
  const storeId = user.storeId;
  if (!storeId) throw new AuthError(403, "Toko pengguna belum tersedia.");

  const [resource, action] = expenseCorrectionPermission(subject, operation);
  const [expenseAllowed, sourceAllowed] = await Promise.all([
    canAuthenticatedUserPerform(user, "expense", action),
    canAuthenticatedUserPerform(user, resource, action),
  ]);
  if (!expenseAllowed || !sourceAllowed) {
    throw new AuthError(403, "Anda tidak memiliki izin untuk mengoreksi transaksi ini.");
  }
  return { ...user, storeId };
}

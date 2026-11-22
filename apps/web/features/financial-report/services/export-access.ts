import { getCurrentUser } from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";
import { canRoleAccessPage, canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";

export async function getFinancialExportAccess(request: Request): Promise<
  { response: ReturnType<typeof apiError> } | {
    user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
    canReadManualIncome: boolean;
    canReadTransactions: boolean;
    canReadExpenses: boolean;
    canReadCustomers: boolean;
    canReadReceivables: boolean;
    canReadPurchases: boolean;
    canReadInventory: boolean;
  }
> {
  const user = await getCurrentUser();
  if (!user) return { response: apiError("Silakan masuk untuk mengekspor laporan.", 401, { code: "Unauthorized" }) };
  const params = new URL(request.url).searchParams;
  const views = params.getAll("view");
  if (views.length > 1 || (views.length === 1 && views[0] !== "sales")) {
    return { response: apiError("Pilih tampilan laporan yang valid.", 422, { code: "ValidationError" }) };
  }
  if (views.length && user.role !== "OWNER") return { response: apiError("Pratinjau hanya tersedia untuk Owner.", 403, { code: "Forbidden" }) };
  let permissions;
  try { permissions = await getGlobalRolePermissions(); }
  catch { return { response: apiError("Hak akses belum dapat diverifikasi. Silakan coba lagi.", 503, { code: "ServiceUnavailable" }) }; }
  const role = views.length ? "SALES" : user.role;
  if (!canRoleAccessPage(role, "/financial-report", permissions)
    || !canRolePerformAction(role, "financial-report", "read", permissions)
    || !canRolePerformAction(role, "financial-report.export", "read", permissions)) {
    return { response: apiError("Akses ekspor laporan belum diizinkan.", 403, { code: "Forbidden" }) };
  }
  const canReadExpenses = canRolePerformAction(role, "expense", "read", permissions);
  return {
    user,
    canReadManualIncome: canRolePerformAction(role, "income", "read", permissions),
    canReadTransactions: canRoleAccessPage(role, "/history", permissions) && canRolePerformAction(role, "transaction", "read", permissions),
    canReadExpenses,
    canReadCustomers: canRolePerformAction(role, "customer", "read", permissions),
    canReadReceivables: canRoleAccessPage(role, "/customers", permissions)
      && canRolePerformAction(role, "customer", "read", permissions)
      && canRolePerformAction(role, "customer.receivable", "read", permissions),
    canReadInventory: canRoleAccessPage(role, "/products", permissions) && canRolePerformAction(role, "product", "read", permissions),
    canReadPurchases: canRoleAccessPage(role, "/keuangan", permissions) && canReadExpenses && canRolePerformAction(role, "supplier", "read", permissions)
      && canRolePerformAction(role, "expense.payable", "read", permissions)
      && canRolePerformAction(role, "expense.giro", "read", permissions),
  };
}

import { canRoleAccessPage, canRolePerformAction, type Role, type RolePermissions } from "@/features/rbac/helpers/rbac-core";

export function resolveIncomeAccess(role: Role, permissions: RolePermissions) {
  const canRead = (target: string) => canRolePerformAction(role, target, "read", permissions);
  const reportPage = canRoleAccessPage(role, "/financial-report", permissions);
  const fullReport = reportPage && canRead("financial-report");
  const income = canRead("income");
  return {
    dailyTotal: income || fullReport || (reportPage && canRead("financial-report.daily-income")),
    dailyMethods: income || fullReport || (reportPage && canRead("financial-report.daily-payment-method")),
    periodTotals: income || fullReport,
    outstandingDp: canRead("transaction"),
    manualDetails: income,
  };
}

export function resolveReceiptHistoryAccess(role: Role, permissions: RolePermissions) {
  const canRead = (target: string) => canRolePerformAction(role, target, "read", permissions);
  const gate = canRoleAccessPage(role, "/history", permissions)
    && canRead("transaction")
    && canRoleAccessPage(role, "/financial-report", permissions);
  const full = gate && canRead("financial-report");
  const section = (target: string) => gate && (full || canRead(target));
  const total = section("financial-report.daily-income");
  const category = section("financial-report.daily-category");
  const subcategory = section("financial-report.daily-subcategory");
  const method = section("financial-report.daily-payment-method");
  const outstandingDp = section("financial-report.daily-outstanding-dp");
  return {
    total,
    category,
    subcategory,
    method,
    outstandingDp,
    manualDetails: canRead("income") && (total || category || subcategory || method),
  };
}

import { InventoryWorkspace, getInventorySummary } from "@/features/inventory-management";
import { InventoryManagementRepository } from "@/features/inventory-management/repositories/InventoryManagementRepository";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { requirePermission } from "@/lib/rbac/guard";

export default async function InventoryPage() {
  const user = await requirePermission("inventory", "read");
  const summary = await getInventorySummary({
    user: user as InventoryManagementUser,
    repository: new InventoryManagementRepository(),
  });

  return <InventoryWorkspace initialSummary={summary} />;
}

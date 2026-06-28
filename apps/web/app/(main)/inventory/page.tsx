import { InventoryWorkspace, getInventorySummary } from "@/features/inventory-management";
import { InventoryManagementRepository } from "@/features/inventory-management/repositories/InventoryManagementRepository";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { requirePermission } from "@/lib/rbac/guard";

export default async function InventoryPage() {
  const user = await requirePermission("inventory", "read");
  if (!user.storeId) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
          <h1 className="text-lg font-bold">Akun inventory belum terhubung ke toko</h1>
          <p className="mt-2 text-sm text-amber-800">
            Hubungkan akun ini ke toko terlebih dahulu sebelum membuka workspace inventory.
          </p>
        </section>
      </main>
    );
  }

  const summary = await getInventorySummary({
    user: user as InventoryManagementUser,
    repository: new InventoryManagementRepository(),
  });

  return <InventoryWorkspace initialSummary={summary} />;
}

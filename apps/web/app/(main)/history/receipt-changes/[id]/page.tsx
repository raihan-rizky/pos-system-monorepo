import { ReceiptChangesPage } from "@/features/receipt-changes/components/ReceiptChangesPage";
import { requireRole } from "@/lib/rbac/guard";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ change?: string }>;
}) {
  await requireRole("OWNER");
  const [{ id }, { change }] = await Promise.all([params, searchParams]);
  return <ReceiptChangesPage transactionId={id} initialChangeId={change} />;
}

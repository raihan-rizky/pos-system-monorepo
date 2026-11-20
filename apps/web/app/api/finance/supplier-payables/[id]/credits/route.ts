import { z } from "zod";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  applyExpenseSupplierCredit,
  listPayableSupplierCredits,
  SupplierCreditError,
} from "@/features/keuangan/repositories/supplier-credit-repository";

export const dynamic = "force-dynamic";

const log = getLogger("api:finance:supplier-payable-credits");
const idSchema = z.string().trim().min(1).max(128);
const applicationSchema = z.strictObject({
  creditId: idSchema,
  amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  requestId: z.string().uuid().transform(value => value.toLowerCase()),
});
type RouteContext = { params: Promise<{ id: string }> };

function creditError(error: unknown) {
  const authError = handleAuthError(error);
  if (authError) return authError;
  if (error instanceof SupplierCreditError) return apiError(error.message, error.status);
  log.error("Gagal memproses kredit pemasok", error);
  return apiError("Kredit pemasok belum dapat diproses. Silakan coba lagi.", 500);
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await requirePermission("expense.giro", "read");
    if (!actor.storeId) return apiError("Toko pengguna belum tersedia.", 403);
    const id = idSchema.safeParse((await context.params).id);
    if (!id.success) return apiError("Tagihan tidak valid.", 422);
    return Response.json({ data: await listPayableSupplierCredits(id.data, actor.storeId) });
  } catch (error) {
    return creditError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requirePermission("expense.giro", "update");
    if (!actor.storeId) return apiError("Toko pengguna belum tersedia.", 403);
    const id = idSchema.safeParse((await context.params).id);
    const application = applicationSchema.safeParse(await request.json().catch(() => null));
    if (!id.success || !application.success) return apiError("Periksa tagihan dan nominal kredit.", 422);
    const data = await applyExpenseSupplierCredit(
      { ...application.data, payableId: id.data },
      { id: actor.id, storeId: actor.storeId },
    );
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return creditError(error);
  }
}

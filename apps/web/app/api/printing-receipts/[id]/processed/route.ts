import { NextResponse } from "next/server";
import { AuthError, canAuthenticatedUserPerform } from "@/lib/rbac/guard";
import { PrintingReceiptValidationError } from "@/features/printing-receipts/domain";
import type { ProcessedPrintingReceiptInput } from "@/features/printing-receipts/processed-edit";
import { requireProcessedPrintingReceiptPermission } from "@/features/printing-receipts/server/processed-permission";
import { reviewProcessedPrintingReceipt, saveProcessedPrintingReceipt } from "@/features/printing-receipts/server/processed-edit-service";
import { printingReceiptErrorResponse, readPrintingReceiptJson } from "@/features/printing-receipts/server/route-support";

type Context = { params: Promise<{ id: string }> };
type AuthenticatedUser = Awaited<ReturnType<typeof requireProcessedPrintingReceiptPermission>>;
export const dynamic = "force-dynamic";

function hasAdditionalPayments(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const transaction = (body as Record<string, unknown>).transaction;
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) return false;
  const payments = (transaction as Record<string, unknown>).additionalPayments;
  return Array.isArray(payments) && payments.length > 0;
}

async function requireAdditionalPaymentAccess(user: AuthenticatedUser, body: unknown): Promise<boolean> {
  if (!hasAdditionalPayments(body)) return false;
  const canView = await canAuthenticatedUserPerform(user, "customer.receivable", "read");
  const canCreatePayment = await canAuthenticatedUserPerform(user, "customer.receivable.payment", "create");
  if (!canView || !canCreatePayment) {
    throw new AuthError(403, "Belum diizinkan mencatat pembayaran tambahan.");
  }
  return true;
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireProcessedPrintingReceiptPermission();
    const { id } = await context.params;
    const body = await readPrintingReceiptJson(request);
    await requireAdditionalPaymentAccess(user, body);
    const data = await reviewProcessedPrintingReceipt(user.storeId || "store-main", id, body as unknown as ProcessedPrintingReceiptInput);
    return NextResponse.json({ data });
  } catch (error) { return printingReceiptErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireProcessedPrintingReceiptPermission();
    const { id } = await context.params;
    const body = await readPrintingReceiptJson(request);
    if (body.acknowledged !== true || typeof body.reviewToken !== "string" || !body.reviewToken) throw new PrintingReceiptValidationError("Setujui dampak perubahan dan tinjau nota sebelum menyimpan.");
    const canCreatePayment = await requireAdditionalPaymentAccess(user, body);
    const receivableAccess = {
      canView: await canAuthenticatedUserPerform(user, "customer.receivable", "read"),
      canEdit: await canAuthenticatedUserPerform(user, "customer.receivable", "update"),
      canCreatePayment,
    };
    const data = await saveProcessedPrintingReceipt(user.storeId || "store-main", id, body as unknown as ProcessedPrintingReceiptInput & { acknowledged: boolean; reviewToken: string }, { id: user.id, name: user.name, role: user.role }, receivableAccess);
    return NextResponse.json({ data });
  } catch (error) { return printingReceiptErrorResponse(error); }
}

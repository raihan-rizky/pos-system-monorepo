import { NextResponse } from "next/server";
import { PrintingReceiptValidationError } from "@/features/printing-receipts/domain";
import type { ProcessedPrintingReceiptInput } from "@/features/printing-receipts/processed-edit";
import { requireProcessedPrintingReceiptPermission } from "@/features/printing-receipts/server/processed-permission";
import { reviewProcessedPrintingReceipt, saveProcessedPrintingReceipt } from "@/features/printing-receipts/server/processed-edit-service";
import { printingReceiptErrorResponse, readPrintingReceiptJson } from "@/features/printing-receipts/server/route-support";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireProcessedPrintingReceiptPermission();
    const { id } = await context.params;
    const body = await readPrintingReceiptJson(request);
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
    const data = await saveProcessedPrintingReceipt(user.storeId || "store-main", id, body as unknown as ProcessedPrintingReceiptInput & { acknowledged: boolean; reviewToken: string }, { id: user.id, name: user.name, role: user.role });
    return NextResponse.json({ data });
  } catch (error) { return printingReceiptErrorResponse(error); }
}

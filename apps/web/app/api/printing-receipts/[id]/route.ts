import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { parsePrintingReceiptDocument, parsePrintingReceiptNumber } from "@/features/printing-receipts/domain";
import { deletePrintingReceipt, getPrintingReceipt, savePrintingReceipt } from "@/features/printing-receipts/server/receipt-store";
import { parsePrintingReceiptRevision, printingReceiptErrorResponse, readPrintingReceiptJson, requirePrintingReceiptWritePermission } from "@/features/printing-receipts/server/route-support";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const user = await requirePermission("transaction", "read");
    const { id } = await context.params;
    return NextResponse.json(await getPrintingReceipt(user.storeId || "store-main", id));
  } catch (error) { return printingReceiptErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const user = await requirePrintingReceiptWritePermission("update");
    const { id } = await context.params;
    const body = await readPrintingReceiptJson(request);
    return NextResponse.json(await savePrintingReceipt(user.storeId || "store-main", id, {
      revision: parsePrintingReceiptRevision(body.revision), number: parsePrintingReceiptNumber(body.number),
      document: parsePrintingReceiptDocument(body.document),
    }));
  } catch (error) { return printingReceiptErrorResponse(error); }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const user = await requirePrintingReceiptWritePermission("delete");
    const { id } = await context.params;
    const revision = parsePrintingReceiptRevision(Number(new URL(request.url).searchParams.get("revision")));
    await deletePrintingReceipt(user.storeId || "store-main", id, revision);
    return new NextResponse(null, { status: 204 });
  } catch (error) { return printingReceiptErrorResponse(error); }
}

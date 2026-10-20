import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { parsePagination } from "@/lib/api/responses";
import { parsePrintingSubcategory, PrintingReceiptValidationError } from "@/features/printing-receipts/domain";
import { createPrintingReceipt, listPrintingReceipts } from "@/features/printing-receipts/server/receipt-store";
import { printingReceiptErrorResponse, readPrintingReceiptJson, requirePrintingReceiptWritePermission } from "@/features/printing-receipts/server/route-support";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requirePermission("transaction", "read");
    const params = new URL(request.url).searchParams;
    const subcategory = parsePrintingSubcategory(params.get("subcategory"));
    const search = (params.get("search") ?? "").trim();
    if (search.length > 200) throw new PrintingReceiptValidationError("Pencarian terlalu panjang. Gunakan maksimal 200 karakter.");
    return NextResponse.json(await listPrintingReceipts(user.storeId || "store-main", {
      ...parsePagination(params, { defaultLimit: 10, maxLimit: 50 }), subcategory, search,
    }));
  } catch (error) { return printingReceiptErrorResponse(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requirePrintingReceiptWritePermission();
    const body = await readPrintingReceiptJson(request);
    const subcategory = parsePrintingSubcategory(body.subcategory);
    return NextResponse.json(await createPrintingReceipt(user.storeId || "store-main", user.id, subcategory), { status: 201 });
  } catch (error) { return printingReceiptErrorResponse(error); }
}

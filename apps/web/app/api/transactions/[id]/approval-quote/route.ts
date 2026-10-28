import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { canRolePerformAction, buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { buildApprovalQuote } from "@/features/transactions-draft/services/approval-quote";

const approvalQuoteSchema = z.object({
  type: z.enum(["draft", "pending"]),
  items: z.array(z.object({
    productId: z.string().nullable().optional(),
    printingServiceId: z.string().nullable().optional(),
    quantity: z.number(),
    rawMaterialProductId: z.string().nullable().optional(),
    rawMaterialQuantity: z.number().nullable().optional(),
    size: z.string().nullable().optional(),
    material: z.string().nullable().optional(),
    submittedPrice: z.number().nullable().optional(),
    priceIntent: z.enum(["AUTOMATIC", "MANUAL"]).optional(),
    sourceItemId: z.string().nullable().optional(),
    serviceNote: z.string().max(5000).nullable().optional(),
  })).min(1),
});

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await request.json();
    const parsed = approvalQuoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Data item persetujuan tidak valid", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const user = await requirePermission(
      parsed.data.type === "draft" ? "transaction.draft" : "transaction.approve",
      "update",
    );
    const permissions =
      process.env.NODE_ENV !== "production" && process.env.E2E_AUTH_BYPASS === "1"
        ? buildDefaultRolePermissions()
        : await getGlobalRolePermissions();
    const canViewCostPrice = canRolePerformAction(
      user.role,
      "product.price_log",
      "read",
      permissions,
    );
    const quote = await buildApprovalQuote(db as Prisma.TransactionClient, {
      storeId: user.storeId || "store-main",
      transactionId: (await params).id,
      actorRole: user.role,
      canViewCostPrice,
      items: parsed.data.items,
    });

    const { items, ...publicQuote } = quote;
    return NextResponse.json({
      ...publicQuote,
      items: items.map(({
        unitCost: _unitCost,
        rawMaterialUnitCost: _rawMaterialUnitCost,
        ...item
      }) => item),
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    if (error instanceof Error) {
      const responseByCode: Record<string, { status: number; message: string }> = {
        APPROVAL_TRANSACTION_NOT_FOUND: { status: 404, message: "Transaksi tidak ditemukan" },
        APPROVAL_TRANSACTION_NOT_EDITABLE: { status: 409, message: "Transaksi ini tidak dapat disetujui" },
        APPROVAL_PRODUCT_NOT_FOUND: { status: 404, message: "Produk tidak ditemukan atau sudah tidak aktif" },
        APPROVAL_PRINTING_SERVICE_NOT_FOUND: { status: 404, message: "Jasa cetak tidak ditemukan atau sudah tidak aktif" },
        APPROVAL_CART_EMPTY: { status: 422, message: "Tambahkan minimal satu barang sebelum menyetujui" },
        APPROVAL_ITEM_SOURCE_REQUIRED: { status: 422, message: "Pilih produk atau jasa untuk setiap baris" },
        APPROVAL_INVALID_QUANTITY: { status: 422, message: "Jumlah barang harus bilangan bulat positif" },
        APPROVAL_INVALID_PRICE: { status: 422, message: "Harga barang tidak valid" },
        APPROVAL_INVALID_RAW_MATERIAL_QUANTITY: { status: 422, message: "Jumlah bahan baku tidak valid" },
        APPROVAL_RAW_MATERIAL_QUANTITY_REQUIRED: { status: 422, message: "Jumlah bahan baku wajib diisi" },
      };
      const known = responseByCode[error.message];
      if (known) return NextResponse.json({ message: known.message }, { status: known.status });
    }

    console.error("Failed to build approval quote:", error);
    return NextResponse.json({ message: "Gagal menghitung harga persetujuan" }, { status: 500 });
  }
}

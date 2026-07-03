import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";

import { productSnapshot } from "@/features/batch-operations/helpers/snapshots";
import {
  calculateProductFirstStockGroupBulkPreview,
  calculateStockGroupBulkPreview,
  stockGroupBulkAction,
  stockGroupBulkReason,
  type ProductFirstStockBulkGroup,
  type ProductFirstStockBulkProduct,
  type ProductFirstStockBulkRowInput,
  type ProductFirstStockGroupPreview,
  type ProductOnlyStockPreview,
} from "@/features/inventory-management/helpers/stock-group-bulk";
import { calculateDisplayStock } from "@/features/product-stock-groups/stock-display";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const stockInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("BASE") }),
  z.object({
    mode: z.literal("VARIANT"),
    variantProductId: z.string().min(1),
  }),
]);

const requestSchema = z.object({
  action: z.enum(["preview", "submit"]).default("preview"),
  stockGroupId: z.string().min(1),
  type: z.enum(["OUT", "ADJUSTMENT"]),
  stockInput: stockInputSchema,
  inputValue: z.coerce.number().min(0),
  note: z.string().trim().max(500).optional().nullable(),
});

const productFirstRowSchema = z.object({
  productId: z.string().min(1),
  mode: z.enum(["GROUP_STOCK", "PRODUCT_ONLY"]),
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  inputValue: z.coerce.number().min(0),
  note: z.string().trim().max(500).optional().nullable(),
});

const productFirstRequestSchema = z.object({
  action: z.enum(["preview", "submit"]).default("preview"),
  rows: z.array(productFirstRowSchema).min(1).max(100),
});

async function loadGroup(storeId: string, stockGroupId: string) {
  const group = await db.productStockGroup.findFirst({
    where: { id: stockGroupId, storeId },
    include: {
      products: {
        where: { isActive: true },
        orderBy: [{ unit: "asc" }, { name: "asc" }],
      },
    },
  });
  if (!group) throw new Error("GROUP_NOT_FOUND");

  return {
    id: group.id,
    displayName: group.displayName,
    baseUnit: group.baseUnit,
    baseStock: group.baseStock,
    products: group.products,
    variants: group.products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      imageUrl: product.imageUrl,
      stock: product.stock,
      unitMultiplierToBase: product.unitMultiplierToBase,
      conversionNeedsReview: product.conversionNeedsReview,
    })),
  };
}

function toPreviewProduct(product: {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stock: number;
  stockGroupId?: string | null;
  unitMultiplierToBase: number;
  conversionNeedsReview: boolean;
  imageUrl?: string | null;
  stockGroup?: { baseStock: number } | null;
}): ProductFirstStockBulkProduct {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    unit: product.unit,
    imageUrl: product.imageUrl ?? null,
    stock: product.stockGroup
      ? calculateDisplayStock(product.stockGroup.baseStock, product.unitMultiplierToBase)
      : product.stock,
    stockGroupId: product.stockGroupId ?? null,
    unitMultiplierToBase: product.unitMultiplierToBase,
    conversionNeedsReview: product.conversionNeedsReview,
  };
}

async function buildProductFirstPreview(storeId: string, rows: ProductFirstStockBulkRowInput[]) {
  const productIds = Array.from(new Set(rows.map((row) => row.productId)));
  const selectedProducts = await db.product.findMany({
    where: { id: { in: productIds }, storeId, isActive: true },
    include: { stockGroup: true },
  });
  const selectedProductIds = new Set(selectedProducts.map((product) => product.id));
  if (!productIds.every((productId) => selectedProductIds.has(productId))) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  const stockGroupIds = Array.from(
    new Set(
      selectedProducts
        .map((product) => product.stockGroupId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const stockGroups = stockGroupIds.length
    ? await db.productStockGroup.findMany({
        where: { id: { in: stockGroupIds }, storeId },
        include: {
          products: {
            where: { isActive: true },
            orderBy: [{ unit: "asc" }, { name: "asc" }],
          },
        },
      })
    : [];

  const products = selectedProducts.map(toPreviewProduct);
  const groups: ProductFirstStockBulkGroup[] = stockGroups.map((group) => ({
    id: group.id,
    displayName: group.displayName,
    baseUnit: group.baseUnit,
    baseStock: group.baseStock,
    variants: group.products.map((product) =>
      toPreviewProduct({
        ...product,
        stockGroup: { baseStock: group.baseStock },
      }),
    ),
  }));

  const productById = new Map(
    [
      ...selectedProducts,
      ...stockGroups.flatMap((group) => group.products),
    ].map((product) => [product.id, product]),
  );

  return {
    preview: calculateProductFirstStockGroupBulkPreview({
      rows,
      products,
      groups,
    }),
    productById,
  };
}

function changedBundledVariants(row: ProductFirstStockGroupPreview) {
  return row.changedVariants.filter((variant) => Math.abs(variant.delta) > 1e-9);
}

function changedStandaloneRows(rows: ProductOnlyStockPreview[]) {
  return rows.filter((row) => Math.abs(row.delta) > 1e-9);
}

function quantityForGroupedVariant(row: ProductFirstStockGroupPreview, delta: number, afterStock: number) {
  if (row.type === "ADJUSTMENT") return afterStock;
  return Math.abs(delta);
}

function noteForBundledRow(
  row: ProductFirstStockGroupPreview,
  inputRows: ProductFirstStockBulkRowInput[],
) {
  const note = inputRows.find((inputRow) => inputRow.productId === row.productId)?.note?.trim();
  return note || `Update stok bersama ${row.stockGroupName}`;
}

async function handleProductFirstRequest(
  storeId: string,
  user: { id: string; name?: string | null },
  input: z.infer<typeof productFirstRequestSchema>,
) {
  const { preview, productById } = await buildProductFirstPreview(storeId, input.rows);
  const bundledItems = preview.bundledRows.flatMap((row) =>
    changedBundledVariants(row).map((variant) => ({ row, variant })),
  );
  const standaloneRows = changedStandaloneRows(preview.standaloneRows);

  if (bundledItems.length === 0 && standaloneRows.length === 0) {
    return apiError("Tidak ada perubahan stok untuk diajukan", 422, {
      code: "ValidationError",
      errors: { inputValue: ["Tidak ada perubahan stok"] },
    });
  }

  if (input.action === "preview") {
    return NextResponse.json({ data: preview });
  }

  const result = await db.$transaction(async (tx) => {
    let bundleBatchOperationId: string | null = null;
    const standaloneLogIds: string[] = [];

    if (bundledItems.length > 0) {
      const batch = await tx.batchOperation.create({
        data: {
          type: "BULK_STOCK_GROUP_ADJUSTMENT",
          status: "PENDING",
          storeId,
          createdBy: user.id,
          summary: {
            source: "PRODUCT_FIRST_STOCK_GROUP_BULK",
            productName: "Update Stok Massal - Stok Bersama",
            rows: preview.bundledRows.map((row) => ({
              productId: row.productId,
              productName: row.productName,
              stockGroupId: row.stockGroupId,
              stockGroupName: row.stockGroupName,
              type: row.type,
              stockInput: row.stockInput,
              inputValue: row.inputValue,
              beforeBaseStock: row.beforeBaseStock,
              afterBaseStock: row.afterBaseStock,
              baseUnit: row.baseUnit,
              note: input.rows.find((inputRow) => inputRow.productId === row.productId)?.note?.trim() || null,
            })),
            totalCount: bundledItems.length,
            pendingCount: bundledItems.length,
            approvedCount: 0,
            rejectedCount: 0,
            pendingApproval: true,
          },
        },
      });
      bundleBatchOperationId = batch.id;

      for (const item of bundledItems) {
        const product = productById.get(item.variant.id);
        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        const log = await tx.inventoryLog.create({
          data: {
            productId: item.variant.id,
            type: item.row.type,
            reason: stockGroupBulkReason(item.row.type),
            quantity: quantityForGroupedVariant(
              item.row,
              item.variant.delta,
              item.variant.afterStock,
            ),
            note: noteForBundledRow(item.row, input.rows),
            createdBy: user.id,
            person: user.name,
            status: "PENDING",
          },
        });
        await tx.batchOperationItem.create({
          data: {
            batchOperationId: batch.id,
            productId: item.variant.id,
            sku: item.variant.sku,
            action: stockGroupBulkAction(item.row.type),
            beforeSnapshot: productSnapshot({
              ...product,
              stock: item.variant.beforeStock,
            }) as unknown as Prisma.InputJsonValue,
            afterSnapshot: productSnapshot({
              ...product,
              stock: item.variant.afterStock,
            }) as unknown as Prisma.InputJsonValue,
            inventoryLogId: log.id,
          },
        });
      }
    }

    for (const row of standaloneRows) {
      const log = await tx.inventoryLog.create({
        data: {
          productId: row.productId,
          type: row.type,
          reason: stockGroupBulkReason(row.type),
          quantity: row.logQuantity,
          note: row.note,
          createdBy: user.id,
          person: user.name,
          status: "PENDING",
        },
      });
      standaloneLogIds.push(log.id);
    }

    return {
      bundleBatchOperationId,
      standaloneLogIds,
      status: "PENDING",
      preview,
    };
  });

  return NextResponse.json({ data: result }, { status: 201 });
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const storeId = user.storeId || "store-main";
    const body = await request.json();
    if (Array.isArray((body as { rows?: unknown }).rows)) {
      const input = productFirstRequestSchema.parse(body);
      return await handleProductFirstRequest(storeId, user, input);
    }

    const input = requestSchema.parse(body);
    const group = await loadGroup(storeId, input.stockGroupId);
    const preview = calculateStockGroupBulkPreview({
      type: input.type,
      stockInput: input.stockInput,
      inputValue: input.inputValue,
      group,
    });

    if (preview.changedVariants.length === 0) {
      return apiError("Tidak ada perubahan stok untuk diajukan", 422, {
        code: "ValidationError",
        errors: { inputValue: ["Tidak ada perubahan stok"] },
      });
    }

    if (input.action === "preview") {
      return NextResponse.json({ data: preview });
    }

    const productById = new Map(group.products.map((product) => [product.id, product]));
    const result = await db.$transaction(async (tx) => {
      const batch = await tx.batchOperation.create({
        data: {
          type: "BULK_STOCK_GROUP_ADJUSTMENT",
          status: "PENDING",
          storeId,
          createdBy: user.id,
          summary: {
            source: "BULK_STOCK_GROUP",
            stockGroupId: preview.stockGroupId,
            productName: preview.displayName,
            type: preview.type,
            stockInput: preview.stockInput,
            inputValue: preview.inputValue,
            beforeBaseStock: preview.beforeBaseStock,
            afterBaseStock: preview.afterBaseStock,
            baseUnit: preview.baseUnit,
            note: input.note?.trim() || null,
            totalCount: preview.changedVariants.length,
            pendingCount: preview.changedVariants.length,
            approvedCount: 0,
            rejectedCount: 0,
            pendingApproval: true,
          },
        },
      });

      for (const variant of preview.changedVariants) {
        const product = productById.get(variant.id);
        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        const beforeSnapshot = productSnapshot({
          ...product,
          stock: variant.beforeStock,
        });
        const afterSnapshot = productSnapshot({
          ...product,
          stock: variant.afterStock,
        });
        const log = await tx.inventoryLog.create({
          data: {
            productId: variant.id,
            type: preview.type,
            reason: stockGroupBulkReason(preview.type),
            quantity:
              preview.type === "OUT"
                ? Math.abs(variant.delta)
                : variant.afterStock,
            note: input.note?.trim() || `Bulk grup stok ${preview.displayName}`,
            createdBy: user.id,
            person: user.name,
            status: "PENDING",
          },
        });
        await tx.batchOperationItem.create({
          data: {
            batchOperationId: batch.id,
            productId: variant.id,
            sku: variant.sku,
            action: stockGroupBulkAction(preview.type),
            beforeSnapshot: beforeSnapshot as unknown as Prisma.InputJsonValue,
            afterSnapshot: afterSnapshot as unknown as Prisma.InputJsonValue,
            inventoryLogId: log.id,
          },
        });
      }

      return {
        batchOperationId: batch.id,
        status: "PENDING",
        preview,
      };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (error instanceof Error) {
      if (error.message === "GROUP_NOT_FOUND") {
        return apiError("Stock group not found", 404, { code: "NotFound" });
      }
      if (error.message === "PRODUCT_NOT_FOUND") {
        return apiError("Produk tidak ditemukan", 404, { code: "NotFound" });
      }
      if (error.message === "DUPLICATE_PRODUCT") {
        return apiError("Produk yang sama sudah dipilih.", 422, {
          code: "ValidationError",
          errors: { rows: ["DUPLICATE_PRODUCT"] },
        });
      }
      if (error.message === "DUPLICATE_GROUP_STOCK") {
        return apiError("Pilih satu produk saja per grup stok untuk mode Stok Bersama.", 422, {
          code: "ValidationError",
          errors: { rows: ["DUPLICATE_GROUP_STOCK"] },
        });
      }
      if (error.message === "VARIANT_NOT_FOUND") {
        return apiError("Variant product must belong to the group", 422, {
          code: "ValidationError",
        });
      }
      if (error.message === "INVALID_CONVERSION") {
        return apiError("Konversi unit perlu direview sebelum stok bisa diproses", 422, {
          code: "ValidationError",
          errors: { stockInput: ["INVALID_CONVERSION"] },
        });
      }
      if (error.message === "NEGATIVE_STOCK") {
        return apiError("Stok tidak boleh negatif", 422, {
          code: "ValidationError",
          errors: { stock: ["Stok tidak boleh negatif"] },
        });
      }
    }
    return apiError("Failed to process stock group bulk request", 500, {
      code: "InternalError",
    });
  }
}

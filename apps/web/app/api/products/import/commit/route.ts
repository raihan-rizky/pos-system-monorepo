import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { productSnapshot } from "@/features/batch-operations/helpers/snapshots";
import {
  MAX_PRODUCT_IMPORT_ROWS,
  importRowCommitSchema,
} from "@/features/product-import/helpers/import-core";
import { getLogger } from "@/lib/logger";

const logger = getLogger("api:products:import:commit");

const commitSchema = z.object({
  rows: z.array(importRowCommitSchema).max(MAX_PRODUCT_IMPORT_ROWS),
  decisions: z
    .record(z.string(), z.enum(["create", "update", "skip"]))
    .default({}),
  createMissingCategories: z.boolean().default(false),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "create");
    const { rows, decisions, createMissingCategories } = commitSchema.parse(
      await request.json(),
    );
    const storeId = user.storeId || "store-main";

    if (rows.length === 0) {
      return NextResponse.json(
        { message: "No rows to import" },
        { status: 422 },
      );
    }

    // Only check duplicates among rows that are NOT skipped
    const activeRows = rows.filter((row) => {
      const decision = decisions[String(row.rowNumber)] ?? decisions[row.sku];
      return decision !== "skip";
    });

    const duplicateSkus = Array.from(
      activeRows.reduce(
        (counts, row) => counts.set(row.sku, (counts.get(row.sku) ?? 0) + 1),
        new Map<string, number>(),
      ),
    )
      .filter(([, count]) => count > 1)
      .map(([sku]) => sku);

    if (duplicateSkus.length > 0) {
      return NextResponse.json(
        {
          message: "Import contains duplicate SKUs. Mark extra rows as skip.",
          duplicateSkus,
        },
        { status: 409 },
      );
    }

    const result = await db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const skus = rows.map((row) => row.sku);
        const existingProducts = await tx.product.findMany({
          where: { storeId, sku: { in: skus } },
        });
        const existingBySku = new Map(
          existingProducts.map((product) => [product.sku, product]),
        );
        const categories = await tx.category.findMany();
        const categoryByName = new Map(
          categories.map((category) => [category.name.toLowerCase(), category]),
        );
        const missingCategories = Array.from(
          new Set(
            rows
              .map((row) => row.category)
              .filter((name) => !categoryByName.has(name.toLowerCase())),
          ),
        );

        if (missingCategories.length > 0 && !createMissingCategories) {
          throw new Error(`MISSING_CATEGORIES:${missingCategories.join(", ")}`);
        }

        for (const categoryName of missingCategories) {
          const category = await tx.category.create({
            data: {
              name: categoryName,
              icon: "Package",
              color: "#64748b",
              order: categories.length + categoryByName.size + 1,
            },
          });
          categoryByName.set(category.name.toLowerCase(), category);
        }

        const batch = await tx.batchOperation.create({
          data: {
            type: "PRODUCT_IMPORT",
            status: "COMMITTED",
            storeId,
            createdBy: user.id,
            summary: {
              rowCount: rows.length,
              createMissingCategories,
              missingCategories,
            },
          },
        });

        let createdProductCount = 0;
        let updatedProductCount = 0;
        let skippedRowCount = 0;
        let inventoryLogCount = 0;

        for (const row of rows) {
          const existing = existingBySku.get(row.sku);
          const decision = existing
            ? (decisions[String(row.rowNumber)] ?? decisions[row.sku])
            : (decisions[String(row.rowNumber)] ??
              decisions[row.sku] ??
              "create");

          if (existing && !["update", "skip"].includes(decision)) {
            throw new Error(`ROW_DECISION_REQUIRED:${row.rowNumber}`);
          }

          if (decision === "skip") {
            skippedRowCount += 1;
            await tx.batchOperationItem.create({
              data: {
                batchOperationId: batch.id,
                productId: existing?.id,
                sku: row.sku,
                action: "SKIP",
                beforeSnapshot: existing
                  ? (productSnapshot(
                      existing,
                    ) as unknown as Prisma.InputJsonValue)
                  : undefined,
                afterSnapshot: existing
                  ? (productSnapshot(
                      existing,
                    ) as unknown as Prisma.InputJsonValue)
                  : undefined,
              },
            });
            continue;
          }

          const category = categoryByName.get(row.category.toLowerCase());
          if (!category) throw new Error(`CATEGORY_NOT_FOUND:${row.category}`);

          if (existing) {
            const beforeSnapshot = productSnapshot(existing);
            const updated = await tx.product.update({
              where: { id: existing.id },
              data: {
                name: row.name,
                barcode: row.barcode,
                description: row.description,
                price: row.price,
                costPrice: row.costPrice,
                stock: row.stock,
                minStock: row.minStock ?? 5,
                unit: row.unit,
                size: row.size,
                material: row.material,
                imageUrl: row.imageUrl,
                categoryId: category.id,
              },
            });
            updatedProductCount += 1;
            const delta = row.stock - existing.stock;
            const log =
              delta === 0
                ? null
                : await tx.inventoryLog.create({
                    data: {
                      productId: updated.id,
                      type: "ADJUSTMENT",
                      reason: "MANUAL_ADJUSTMENT",
                      quantity: Math.abs(delta),
                      unitCost: row.costPrice ?? null,
                      note: `Batch import update: ${row.name}`,
                      createdBy: user.id,
                    },
                  });
            if (log) inventoryLogCount += 1;
            await tx.batchOperationItem.create({
              data: {
                batchOperationId: batch.id,
                productId: updated.id,
                sku: row.sku,
                action: "UPDATE",
                beforeSnapshot:
                  beforeSnapshot as unknown as Prisma.InputJsonValue,
                afterSnapshot: productSnapshot(
                  updated,
                ) as unknown as Prisma.InputJsonValue,
                inventoryLogId: log?.id,
              },
            });
          } else {
            const created = await tx.product.create({
              data: {
                name: row.name,
                sku: row.sku,
                barcode: row.barcode,
                description: row.description,
                price: row.price,
                costPrice: row.costPrice,
                stock: row.stock,
                minStock: row.minStock ?? 5,
                unit: row.unit,
                size: row.size,
                material: row.material,
                imageUrl: row.imageUrl,
                categoryId: category.id,
                storeId,
              },
            });
            createdProductCount += 1;
            const log =
              row.stock === 0
                ? null
                : await tx.inventoryLog.create({
                    data: {
                      productId: created.id,
                      type: row.stock < 0 ? "ADJUSTMENT" : "IN",
                      reason: row.stock < 0 ? "MANUAL_ADJUSTMENT" : "RESTOCK",
                      quantity: Math.abs(row.stock),
                      unitCost: row.costPrice ?? null,
                      note: `Batch import initial stock: ${row.name}`,
                      createdBy: user.id,
                    },
                  });
            if (log) inventoryLogCount += 1;
            await tx.batchOperationItem.create({
              data: {
                batchOperationId: batch.id,
                productId: created.id,
                sku: row.sku,
                action: "CREATE",
                beforeSnapshot: undefined,
                afterSnapshot: productSnapshot(
                  created,
                ) as unknown as Prisma.InputJsonValue,
                inventoryLogId: log?.id,
              },
            });
          }
        }

        await tx.batchOperation.update({
          where: { id: batch.id },
          data: {
            summary: {
              rowCount: rows.length,
              createdProductCount,
              updatedProductCount,
              skippedRowCount,
              createdCategoryCount: missingCategories.length,
              inventoryLogCount,
            },
          },
        });

        return {
          createdProductCount,
          updatedProductCount,
          skippedRowCount,
          createdCategoryCount: missingCategories.length,
          inventoryLogCount,
          batchOperationId: batch.id,
          undoAvailable: true,
        };
      },
      {
        maxWait: 15000, // max time to wait to acquire a transaction slot (15s)
        timeout: 1800000, // max time the transaction can run (1800s)
      },
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 },
      );
    }
    if (error instanceof Error) {
      if (error.message.startsWith("MISSING_CATEGORIES:")) {
        return NextResponse.json(
          {
            message: "Missing category confirmation",
            missingCategories: error.message
              .replace("MISSING_CATEGORIES:", "")
              .split(", "),
          },
          { status: 409 },
        );
      }
      if (error.message.startsWith("ROW_DECISION_REQUIRED:")) {
        return NextResponse.json(
          {
            message: "Existing SKU rows require update or skip decisions",
            rowNumber: Number(
              error.message.replace("ROW_DECISION_REQUIRED:", ""),
            ),
          },
          { status: 409 },
        );
      }
    }

    logger.error("products.import.commit.failed", { error });
    return NextResponse.json(
      { message: "Failed to commit product import" },
      { status: 500 },
    );
  }
}


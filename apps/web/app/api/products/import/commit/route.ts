import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { productSnapshot } from "@/features/batch-operations/helpers/snapshots";
import {
  MAX_PRODUCT_IMPORT_ROWS,
  importRowCommitSchema,
} from "@/features/product-import/helpers/import-core";
import { resolveProductImportAutoDecisions } from "@/features/product-import/helpers/auto-decisions";
import { getCommitActionForResolvedRow } from "@/features/product-import/helpers/commit-actions";
import { getEffectiveImportDecision } from "@/features/product-import/helpers/import-decisions";
import { resolveImportCreateStockPlan } from "@/features/product-import/helpers/commit-stock";
import { expandProductNameAbbreviations } from "@/features/product-import/helpers/name-normalization";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";
import { getLogger } from "@/lib/logger";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";
import {
  buildStockGroupCreateData,
  ensureProductStockGroup,
  shouldMarkConversionForReview,
} from "@/features/product-stock-groups/product-stock-groups-service";

const logger = getLogger("api:products:import:commit");

const commitSchema = z.object({
  rows: z.array(importRowCommitSchema).max(MAX_PRODUCT_IMPORT_ROWS),
  decisions: z
    .record(z.string(), z.enum(["create", "update", "skip", "create-variant"]))
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
        const existingProducts = await tx.product.findMany({
          where: { storeId },
          include: { stockGroup: true, category: true },
        });
        const existingBySku = new Map(
          existingProducts.map((product) => [product.sku, product]),
        );
        const existingById = new Map(
          existingProducts.map((product) => [product.id, product]),
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
        let priceLogCount = 0;
        let variantProductCount = 0;
        let conversionReviewCount = 0;

        const commitRows = rows.map((row) => ({
          ...row,
          duplicateInFile: false,
          missingCategory: false,
          stockProvided: row.stockProvided ?? true,
          warnings: [],
          errors: [],
        }));

        const resolvedRows = resolveProductImportAutoDecisions({
          rows: commitRows,
          existingProducts: existingProducts.map((product) => ({
            id: product.id,
            name: product.name,
            sku: product.sku,
            category: product.category.name,
            unit: product.unit,
            price: Number(product.price),
            costPrice: product.costPrice == null ? null : Number(product.costPrice),
            hargaDinas: product.hargaDinas == null ? null : Number(product.hargaDinas),
            stockGroupId: product.stockGroupId,
            stockGroupBaseUnit: product.stockGroup?.baseUnit ?? null,
          })),
          existingSkus: new Set(existingProducts.map((product) => product.sku)),
          decisions,
        });

        for (const row of resolvedRows) {
          const existing = existingBySku.get(row.sku) ?? (row.matchedProductId ? existingById.get(row.matchedProductId) : undefined);
          const decision = getEffectiveImportDecision(row, decisions) ?? "create";
          const commitAction = getCommitActionForResolvedRow(row, decision);

          if (
            existing &&
            !row.autoAction &&
            !["update", "skip", "create-variant"].includes(decision)
          ) {
            throw new Error(`ROW_DECISION_REQUIRED:${row.rowNumber}`);
          }

          if (decision === "skip" || commitAction === "skip") {
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

          if (commitAction === "update-price" && existing) {
            const beforeDisplayStock = resolveProductDisplayStock(existing);
            const beforeSnapshot = productSnapshot({
              ...existing,
              stock: beforeDisplayStock,
            });
            const updated = await tx.product.update({
              where: { id: existing.id },
              data: {
                price: row.price,
                costPrice: row.costPrice,
                ...(row.hargaDinas != null ? { hargaDinas: row.hargaDinas } : {}),
              },
            });
            updatedProductCount += 1;
            const priceLogEntries = buildProductPriceLogEntries({
              productId: updated.id,
              storeId,
              before: {
                price: existing.price,
                costPrice: existing.costPrice,
              },
              after: {
                price: updated.price,
                costPrice: updated.costPrice,
              },
              actor: user,
              source: "IMPORT",
              note: `Batch import price update: ${existing.name}`,
            });
            if (priceLogEntries.length > 0) {
              await tx.productPriceLog.createMany({ data: priceLogEntries });
              priceLogCount += priceLogEntries.length;
            }
            await tx.batchOperationItem.create({
              data: {
                batchOperationId: batch.id,
                productId: updated.id,
                sku: row.sku,
                action: "UPDATE",
                beforeSnapshot:
                  beforeSnapshot as unknown as Prisma.InputJsonValue,
                afterSnapshot: productSnapshot(
                  { ...existing, ...updated, stock: beforeDisplayStock },
                ) as unknown as Prisma.InputJsonValue,
              },
            });
          } else if (commitAction === "update" && existing) {
            const beforeDisplayStock = resolveProductDisplayStock(existing);
            const beforeSnapshot = productSnapshot({
              ...existing,
              stock: beforeDisplayStock,
            });
            const multiplier = existing.unitMultiplierToBase || 1;
            const { group } = await ensureProductStockGroup(tx, {
              storeId,
              name: row.name,
              categoryId: category.id,
              material: row.material,
              size: row.size,
              displayName: row.name,
              baseUnit: row.unit,
              baseStock: row.stock * multiplier,
            });
            await tx.productStockGroup.update({
              where: { id: group.id },
              data: { baseStock: row.stock * multiplier },
            });
            const updated = await tx.product.update({
              where: { id: existing.id },
              data: {
                name: row.name,
                barcode: row.barcode,
                description: row.description,
                price: row.price,
                costPrice: row.costPrice,
                ...(row.hargaDinas != null ? { hargaDinas: row.hargaDinas } : {}),
                minStock: row.minStock ?? 5,
                unit: row.unit,
                size: row.size,
                material: row.material,
                imageUrl: row.imageUrl,
                categoryId: category.id,
                stockGroupId: group.id,
              },
            });
            updatedProductCount += 1;
            const priceLogEntries = buildProductPriceLogEntries({
              productId: updated.id,
              storeId,
              before: {
                price: existing.price,
                costPrice: existing.costPrice,
              },
              after: {
                price: updated.price,
                costPrice: updated.costPrice,
              },
              actor: user,
              source: "IMPORT",
              note: `Batch import update: ${row.name}`,
            });
            if (priceLogEntries.length > 0) {
              await tx.productPriceLog.createMany({ data: priceLogEntries });
              priceLogCount += priceLogEntries.length;
            }
            const delta = row.stock - beforeDisplayStock;
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
                  { ...updated, stock: row.stock },
                ) as unknown as Prisma.InputJsonValue,
                inventoryLogId: log?.id,
              },
            });
          } else if (commitAction === "create" || commitAction === "create-variant") {
            const { multiplier } = buildStockGroupCreateData({
              stock: row.stock,
              unitMultiplierToBase: row.unitMultiplierToBase ?? 1,
            });
            const matched = row.matchedProductId ? existingById.get(row.matchedProductId) : undefined;
            const variantGroup = commitAction === "create-variant" && matched?.stockGroup
              ? matched.stockGroup
              : null;
            const stockPlan = resolveImportCreateStockPlan({
              commitAction,
              rowStock: row.stock,
              stockProvided: row.stockProvided,
              multiplier,
              matchedGroupBaseStock: variantGroup?.baseStock,
            });
            const ensured = variantGroup
              ? { group: variantGroup, created: false }
              : await ensureProductStockGroup(tx, {
                  storeId,
                  name: row.name,
                  categoryId: category.id,
                  material: row.material,
                  size: row.size,
                  displayName: row.name,
                  baseUnit: row.unit,
                  baseStock: stockPlan.groupBaseStock,
                });
            const { group, created: groupCreated } = ensured;
            const created = await tx.product.create({
              data: {
                name: expandProductNameAbbreviations(row.name),
                sku: row.sku,
                barcode: row.barcode,
                description: row.description,
                price: row.price,
                costPrice: row.costPrice,
                hargaDinas: row.hargaDinas,
                stock: stockPlan.productStock,
                minStock: row.minStock ?? 5,
                unit: row.unit,
                size: row.size,
                material: row.material,
                imageUrl: row.imageUrl,
                categoryId: category.id,
                stockGroupId: group.id,
                unitMultiplierToBase: multiplier,
                conversionNeedsReview: row.conversionNeedsReview ?? shouldMarkConversionForReview({
                  groupCreated,
                  unitMultiplierProvided: Boolean(row.unitMultiplierToBase),
                  unit: row.unit,
                  baseUnit: group.baseUnit,
                }),
                storeId,
              },
            });
            createdProductCount += 1;
            if (commitAction === "create-variant") variantProductCount += 1;
            if (row.conversionNeedsReview) conversionReviewCount += 1;
            const priceLogEntries = buildProductPriceLogEntries({
              productId: created.id,
              storeId,
              before: null,
              after: {
                price: created.price,
                costPrice: created.costPrice,
              },
              actor: user,
              source: "IMPORT",
              note: `Batch import initial price: ${row.name}`,
            });
            if (priceLogEntries.length > 0) {
              await tx.productPriceLog.createMany({ data: priceLogEntries });
              priceLogCount += priceLogEntries.length;
            }
            const log =
              stockPlan.inventoryLogQuantity == null
                ? null
                : await tx.inventoryLog.create({
                    data: {
                      productId: created.id,
                      type: row.stock < 0 ? "ADJUSTMENT" : "IN",
                      reason: row.stock < 0 ? "MANUAL_ADJUSTMENT" : "RESTOCK",
                      quantity: stockPlan.inventoryLogQuantity,
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
              variantProductCount,
              updatedProductCount,
              skippedRowCount,
              conversionReviewCount,
              createdCategoryCount: missingCategories.length,
              inventoryLogCount,
              priceLogCount,
            },
          },
        });

        return {
          createdProductCount,
          variantProductCount,
          updatedProductCount,
          skippedRowCount,
          conversionReviewCount,
          createdCategoryCount: missingCategories.length,
          inventoryLogCount,
          priceLogCount,
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
      if (error.message.startsWith("ROW_CONFLICT:")) {
        return NextResponse.json(
          {
            message: "Import row conflicts with an existing SKU assigned to another product",
            rowNumber: Number(
              error.message.replace("ROW_CONFLICT:", ""),
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


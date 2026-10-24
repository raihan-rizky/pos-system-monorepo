import type { Prisma } from "@pos/db";
import { initializeGroupPricing, projectGroupPricing } from "@/features/product-stock-groups/automatic-pricing";
import { GroupPricingError, prepareGroupPricingMutation, readGroupPricingInput } from "@/features/product-stock-groups/group-pricing-service";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";
import { importProductSnapshot, importPricingSnapshotsEqual, readImportPricingUndo } from "./import-pricing-mutation";

/** Caller holds the batch row lock before entering this transaction-owned restore. */
export async function undoImportPricing(tx: Prisma.TransactionClient, input: {
  batch: { id: string; summary: Prisma.JsonValue | null; createdAt: Date; status: string };
  actor: { id: string; name?: string | null }; storeId: string;
}) {
  const metadata = readImportPricingUndo(input.batch.summary);
  if (!metadata) throw new GroupPricingError("Impor lama ini tidak memiliki snapshot harga grup yang aman untuk dibatalkan.", 409);
  const ids = Object.keys(metadata.products).sort();
  const groupIds = Object.keys(metadata.groups).sort();
  const conflict = () => new GroupPricingError("Produk atau konfigurasi harga grup sudah berubah setelah impor. Pembatalan tidak dapat dilanjutkan.", 409);
  const prepared = await prepareGroupPricingMutation(tx, { storeId: input.storeId, groupIds, extraProductIds: ids });
  const groups = groupIds.length ? await tx.productStockGroup.findMany({ where: { storeId: input.storeId, id: { in: groupIds } } }) : [];
  for (const [id, expected] of Object.entries(metadata.groups)) {
    const current = prepared.before.get(id)!;
    if (!importPricingSnapshotsEqual(current, expected.after) || groups.find(g => g.id === id)?.baseStock !== expected.baseStockAfter) throw conflict();
  }
  const products = ids.length ? await tx.product.findMany({ where: { storeId: input.storeId, id: { in: ids } }, include: { productSuppliers: { select: { supplierId: true } } } }) : [];
  if (products.length !== ids.length) throw conflict();
  for (const product of products) if (!importPricingSnapshotsEqual(importProductSnapshot(product), metadata.products[product.id].after)) throw conflict();
  const later = await tx.batchOperationItem.findFirst({ where: { productId: { in: ids }, createdAt: { gt: input.batch.createdAt }, batchOperationId: { not: input.batch.id } }, select: { productId: true } });
  if (later) throw conflict();
  const createdIds = ids.filter(id => metadata.products[id].before === null);
  const used = createdIds.length ? await tx.transactionItem.findMany({ where: { productId: { in: createdIds } }, select: { productId: true }, distinct: ["productId"] }) : [];
  if (used.length) throw conflict();
  const undoBatch = await tx.batchOperation.create({ data: { type: "UNDO", status: "COMMITTED", storeId: input.storeId, createdBy: input.actor.id, undoOfBatchId: input.batch.id, summary: { undoneBatchId: input.batch.id, originalType: "PRODUCT_IMPORT", itemCount: ids.length } } });
  let reversalInventoryLogCount = 0;
  for (const product of products) {
    const { before, after } = metadata.products[product.id];
    const data = before ? {
      name: before.name, sku: before.sku, barcode: before.barcode, description: before.description,
      price: before.price, costPrice: before.costPrice, hargaAgen: before.hargaAgen, hargaDinas: before.hargaDinas,
      stock: before.stock, minStock: before.minStock, unit: before.unit, size: before.size, material: before.material,
      categoryId: before.categoryId, brandId: before.brandId, isActive: before.isActive, imageUrl: before.imageUrl,
      stockGroupId: before.stockGroupId, unitMultiplierToBase: before.unitMultiplierToBase, conversionNeedsReview: before.conversionNeedsReview,
    } : { stock: 0, isActive: false };
    const restored = await tx.product.update({ where: { id: product.id }, data });
    const supplierIds = before?.supplierIds ?? [];
    await tx.productSupplier.deleteMany({ where: { productId: product.id } });
    if (supplierIds.length) await tx.productSupplier.createMany({ data: supplierIds.map(supplierId => ({ supplierId, productId: product.id })), skipDuplicates: true });
    const logs = buildProductPriceLogEntries({ productId: product.id, storeId: input.storeId, before: after, after: restored, actor: input.actor, source: "SYSTEM", note: "Pembatalan impor produk" });
    if (logs.length) await tx.productPriceLog.createMany({ data: logs });
    const delta = -(metadata.inventoryDeltas[product.id] ?? 0);
    const inventoryLog = delta === 0 ? null : await tx.inventoryLog.create({ data: { productId: product.id, type: delta > 0 ? "IN" : "OUT", reason: delta > 0 ? "RESTOCK" : "SUPPLIER_RETURN", quantity: Math.abs(delta), note: `Pembatalan impor ${input.batch.id}`, createdBy: input.actor.id, person: input.actor.name } });
    if (inventoryLog) reversalInventoryLogCount++;
    await tx.batchOperationItem.create({ data: { batchOperationId: undoBatch.id, productId: product.id, sku: product.sku, action: "UNDO", beforeSnapshot: after as unknown as Prisma.InputJsonValue, afterSnapshot: importProductSnapshot({ ...restored, productSuppliers: supplierIds.map(supplierId => ({ supplierId })) }) as unknown as Prisma.InputJsonValue, inventoryLogId: inventoryLog?.id } });
  }
  for (const [id, snapshot] of Object.entries(metadata.groups)) {
    const current = await readGroupPricingInput(tx, { storeId: input.storeId, groupId: id });
    // Never restore a null/old revision: doing so could revive a preview token.
    // Legacy money is restored exactly; its original ratios are retained in an initialized config.
    const config = structuredClone(snapshot.before.members.length ? initializeGroupPricing(snapshot.before).config : snapshot.after.config!);
    config.revision = Math.max(snapshot.after.config?.revision ?? 0, config.revision) + 1;
    if (!snapshot.before.members.length) {
      const reviewed = projectGroupPricing({ ...current, config });
      config.members = reviewed.config.members;
    }
    await tx.productStockGroup.update({ where: { id }, data: { baseStock: snapshot.baseStockBefore, baseUnit: snapshot.before.baseUnit, pricingConfig: config as unknown as Prisma.InputJsonValue } });
    await tx.productStockGroupActivity.create({ data: { stockGroupId: id, type: "GROUP_PRICING_CHANGED", createdBy: input.actor.id, person: input.actor.name, note: "Konfigurasi harga dipulihkan dari pembatalan impor", before: snapshot.after as unknown as Prisma.InputJsonValue, after: { ...current, config } as unknown as Prisma.InputJsonValue } });
  }
  await tx.batchOperation.update({ where: { id: input.batch.id }, data: { status: "UNDONE", undoneAt: new Date(), undoneBy: input.actor.id } });
  return { success: true, reversalInventoryLogCount, blockedProducts: [] as string[], undoBatchOperationId: undoBatch.id };
}

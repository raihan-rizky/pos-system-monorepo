import type { Prisma, Product } from "@pos/db";
import { isDeepStrictEqual } from "node:util";
import { productSnapshot, type ProductSnapshot } from "@/features/batch-operations/helpers/snapshots";
import { initializeGroupPricing, type GroupPricingInput } from "@/features/product-stock-groups/automatic-pricing";
import { GroupPricingError, readGroupPricingInput, seedNewGroupPricingMutation, synchronizeGroupPricingMutation, type GroupPricingChanges, type PreparedGroupPricingMutation } from "@/features/product-stock-groups/group-pricing-service";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";
import { projectImportGroupPricing } from "./import-group-pricing";
import type { NormalizedImportRow } from "../types";

export type ImportProductSnapshot = ProductSnapshot & Pick<Product, "stockGroupId" | "unitMultiplierToBase" | "conversionNeedsReview">;
export type ImportPricingUndo = {
  version: 1;
  groups: Record<string, { before: GroupPricingInput; after: GroupPricingInput; baseStockBefore: number; baseStockAfter: number }>;
  products: Record<string, { before: ImportProductSnapshot | null; after: ImportProductSnapshot }>;
  inventoryDeltas: Record<string, number>;
};
export function importProductSnapshot(product: Product & { productSuppliers?: Array<{ supplierId: string }> }): ImportProductSnapshot {
  return { ...productSnapshot(product), stockGroupId: product.stockGroupId, unitMultiplierToBase: product.unitMultiplierToBase, conversionNeedsReview: product.conversionNeedsReview };
}
export function readImportPricingUndo(summary: Prisma.JsonValue | null): ImportPricingUndo | undefined {
  const value = (summary as { pricingUndo?: ImportPricingUndo } | null)?.pricingUndo;
  return value?.version === 1 ? value : undefined;
}

/** Compare JSON-persisted values; JSONB key order is not part of snapshot identity. */
export function importPricingSnapshotsEqual(current: unknown, persisted: unknown): boolean {
  return isDeepStrictEqual(JSON.parse(JSON.stringify(current)), JSON.parse(JSON.stringify(persisted)));
}

export async function captureImportPricingMutation(tx: Prisma.TransactionClient, prepared: PreparedGroupPricingMutation, extraProductIds: string[], previous?: ImportPricingUndo) {
  const ids = [...new Set([...prepared.before.values()].flatMap(g => g.members.map(m => m.id)).concat(extraProductIds))];
  const products = ids.length ? await tx.product.findMany({ where: { storeId: prepared.storeId, id: { in: ids } }, include: { productSuppliers: { select: { supplierId: true } } } }) : [];
  const groups = prepared.before.size ? await tx.productStockGroup.findMany({ where: { storeId: prepared.storeId, id: { in: [...prepared.before.keys()] } } }) : [];
  for (const [id, before] of prepared.before) if (previous?.groups[id]) {
    const expected = previous.groups[id];
    if (!importPricingSnapshotsEqual(before, expected.after) || groups.find(g => g.id === id)?.baseStock !== expected.baseStockAfter) {
      throw new GroupPricingError("Grup sudah berubah sejak chunk impor sebelumnya. Muat pratinjau dan mulai impor baru.", 409);
    }
  }
  for (const product of products) if (previous?.products[product.id] && !importPricingSnapshotsEqual(importProductSnapshot(product), previous.products[product.id].after)) {
    throw new GroupPricingError("Produk sudah berubah sejak chunk impor sebelumnya. Muat pratinjau dan mulai impor baru.", 409);
  }
  return { prepared, products: new Map(products.map(p => [p.id, importProductSnapshot(p)])), groups: new Map(groups.map(g => [g.id, g.baseStock])), undo: structuredClone(previous ?? { version: 1 as const, groups: {}, products: {}, inventoryDeltas: {} }) };
}
export type ImportPricingMutation = Awaited<ReturnType<typeof captureImportPricingMutation>>;

/** Called after the three bulk money writers, before their logs and batch items persist. */
export async function finalizeImportPricingMutation(tx: Prisma.TransactionClient, input: {
  state: ImportPricingMutation; rows: NormalizedImportRow[]; batchItems: Prisma.BatchOperationItemCreateManyInput[];
  priceLogs: Prisma.ProductPriceLogCreateManyInput[]; batchOperationId: string; newGroupIds: string[];
  actor: { id: string; name?: string | null };
}): Promise<number> {
  const { state } = input;
  const originalGroups = new Map(state.prepared.before);
  const createdIds = input.batchItems.filter(i => i.action === "CREATE").map(i => i.productId!);
  for (const groupId of input.newGroupIds) {
    await seedNewGroupPricingMutation(tx, { prepared: state.prepared, groupId, newProductIds: createdIds });
    for (const member of state.prepared.before.get(groupId)!.members) {
      const old = state.products.get(member.id);
      if (old) { member.price = old.price; member.costPrice = old.costPrice; }
    }
  }
  for (const item of input.batchItems) if (item.productId && item.inventoryLogId) {
    const before = item.beforeSnapshot as unknown as ProductSnapshot | null;
    const after = item.afterSnapshot as unknown as ProductSnapshot;
    state.undo.inventoryDeltas[item.productId] = (state.undo.inventoryDeltas[item.productId] ?? 0) + after.stock - (before?.stock ?? 0);
  }
  const rowByNumber = new Map(input.rows.map(r => [r.rowNumber, r]));
  const changes: Record<string, GroupPricingChanges> = {};
  for (const [groupId, before] of state.prepared.before) {
    const current = await readGroupPricingInput(tx, { storeId: state.prepared.storeId, groupId });
    const config = initializeGroupPricing(before).config;
    // Missing source HPP must retain the true old follower HPP, never a raw import placeholder.
    for (const member of current.members) if (member.id !== config.sourceProductId && config.members[member.id]?.mode !== "MANUAL") {
      const old = state.products.get(member.id);
      if (old) member.costPrice = old.costPrice?.toString() ?? null;
    }
    const memberIds = new Set(current.members.map(m => m.id));
    const intents = input.batchItems.filter(i => i.productId && memberIds.has(i.productId) && i.sourceRowNumber != null).map(i => {
      const row = rowByNumber.get(i.sourceRowNumber!)!;
      return { productId: i.productId!, rowNumber: row.rowNumber, price: row.price, costPrice: row.costPrice };
    });
    const result = projectImportGroupPricing(before, current, intents);
    if (result.conflicts.length) throw new GroupPricingError(result.conflicts.map(c => `Baris ${c.rowNumber}: ${c.message}`).join("\n"), 422);
    changes[groupId] = result.changes;
    // Keep the same held values for the synchronizer's fresh read.
    for (const member of current.members) {
      if (member.id !== config.sourceProductId && config.members[member.id]?.mode !== "MANUAL" && state.products.has(member.id)) {
        await tx.product.update({ where: { id: member.id }, data: { costPrice: member.costPrice } });
      }
    }
  }
  // Audit preimages are independent of group membership used to initialize factors.
  // A moved product already existed even when the destination had no such member.
  const priceLogBefore = new Map([...state.products].map(([id, before]) => [id, { price: before.price, costPrice: before.costPrice }]));
  const projections = await synchronizeGroupPricingMutation(tx, { prepared: state.prepared, changes, priceLogBefore, actor: input.actor, source: "IMPORT", note: "Harga otomatis dari impor produk" });
  const groupedIds = new Set(projections.flatMap(g => g.members.map(m => m.productId)));
  let serviceLogCount = 0;
  for (const [index, projection] of projections.entries()) {
    const before = [...state.prepared.before.values()][index];
    for (const member of projection.members) serviceLogCount += buildProductPriceLogEntries({ productId: member.productId, storeId: before.storeId, before: priceLogBefore.get(member.productId) ?? before.members.find(m => m.id === member.productId) ?? null, after: member, source: "IMPORT" }).length;
  }
  const ids = [...new Set([...state.products.keys(), ...input.batchItems.map(i => i.productId!).filter(Boolean)])];
  const effective = ids.length ? await tx.product.findMany({ where: { storeId: state.prepared.storeId, id: { in: ids } }, include: { productSuppliers: { select: { supplierId: true } } } }) : [];
  input.priceLogs.splice(0);
  for (const product of effective) {
    const after = importProductSnapshot(product);
    const before = state.products.get(product.id) ?? null;
    state.undo.products[product.id] = { before: state.undo.products[product.id] ? state.undo.products[product.id].before : before, after };
    const item = input.batchItems.find(i => i.productId === product.id);
    if (item) { item.beforeSnapshot = before ? before as unknown as Prisma.InputJsonValue : undefined; item.afterSnapshot = after as unknown as Prisma.InputJsonValue; }
    else input.batchItems.push({ batchOperationId: input.batchOperationId, productId: product.id, sku: product.sku, action: "UPDATE", beforeSnapshot: before as unknown as Prisma.InputJsonValue, afterSnapshot: after as unknown as Prisma.InputJsonValue });
    input.priceLogs.push(...buildProductPriceLogEntries({ productId: product.id, storeId: state.prepared.storeId, before, after, actor: input.actor, source: "IMPORT", note: "Impor produk" }).filter(log => !groupedIds.has(product.id) || log.field === "HARGA_AGEN" || log.field === "HARGA_DINAS"));
  }
  const afterGroups = state.prepared.before.size ? await tx.productStockGroup.findMany({ where: { storeId: state.prepared.storeId, id: { in: [...state.prepared.before.keys()] } } }) : [];
  for (const [id, before] of originalGroups) {
    const previous = state.undo.groups[id];
    state.undo.groups[id] = { before: previous?.before ?? before, after: await readGroupPricingInput(tx, { storeId: state.prepared.storeId, groupId: id }), baseStockBefore: previous?.baseStockBefore ?? (input.newGroupIds.includes(id) ? 0 : state.groups.get(id)!), baseStockAfter: afterGroups.find(g => g.id === id)!.baseStock };
  }
  return serviceLogCount;
}

import type { Prisma } from "@pos/db";
import { decimalToRatio, initializeGroupPricing, roundMoney, type GroupPricingInput } from "@/features/product-stock-groups/automatic-pricing";
import { groupPricingInputFromRow } from "@/features/product-stock-groups/group-pricing-service";
import { normalizeStockGroupKey } from "@/features/product-stock-groups/stock-grouping";
import { projectImportGroupPricing, type ImportPricingIntent } from "./import-group-pricing";
import type { ImportRowDecision, NormalizedImportRow } from "../types";
import { resolveProductImportAutoDecisions } from "../helpers/auto-decisions";

export async function previewImportGroupPricing(tx: Pick<Prisma.TransactionClient, "product" | "productStockGroup" | "category">, input: { rows: NormalizedImportRow[]; storeId: string; decisions?: Record<string, ImportRowDecision> }): Promise<NormalizedImportRow[]> {
  let rows = structuredClone(input.rows);
  for (const row of rows) {
    row.errors = row.errors.filter(error => !row.pricingPreview?.errors.includes(error));
    delete row.pricingPreview;
  }
  const categories = await tx.category.findMany({ select: { id: true, name: true } });
  const categoryIds = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));
  const products = await tx.product.findMany({ where: { storeId: input.storeId, OR: [{ sku: { in: rows.map(r => r.sku) } }, { id: { in: rows.flatMap(r => [r.matchedProductId, r.existingProductId].filter((id): id is string => Boolean(id))) } }] }, include: { category: true } });
  if (input.decisions) rows = resolveProductImportAutoDecisions({
    rows, decisions: input.decisions, existingSkus: new Set(products.map(p => p.sku)),
    existingProducts: products.map(p => ({ ...p, category: p.category.name, price: Number(p.price), costPrice: p.costPrice == null ? null : Number(p.costPrice), hargaAgen: p.hargaAgen == null ? null : Number(p.hargaAgen), hargaDinas: p.hargaDinas == null ? null : Number(p.hargaDinas) })),
  });
  const keyFor = (row: NormalizedImportRow) => normalizeStockGroupKey({ ...row, categoryId: categoryIds.get(row.category.toLowerCase()) ?? row.category });
  const groups = await tx.productStockGroup.findMany({ where: { storeId: input.storeId, OR: [{ id: { in: products.map(p => p.stockGroupId).filter((id): id is string => Boolean(id)) } }, { groupKey: { in: rows.map(keyFor) } }] }, include: { products: true } });
  const work = new Map<string, { before: GroupPricingInput; current: GroupPricingInput; intents: ImportPricingIntent[]; rows: Map<string, NormalizedImportRow> }>();
  for (const row of rows) {
    if (row.errors.length || row.autoAction === "conflict" || row.autoAction === "same_unit_price_conflict") continue;
    const existing = products.find(p => p.id === (row.matchedProductId ?? row.existingProductId)) ?? products.find(p => p.sku === row.sku);
    const group = (existing?.stockGroupId ? groups.find(g => g.id === existing.stockGroupId) : undefined) ?? groups.find(g => g.groupKey === keyFor(row));
    const id = group?.id ?? `import:${keyFor(row)}`;
    let entry = work.get(id);
    if (!entry) {
      const before: GroupPricingInput = group ? groupPricingInputFromRow(group) : { groupId: id, storeId: input.storeId, baseUnit: row.unit, members: [], config: null };
      entry = { before, current: structuredClone(before), intents: [], rows: new Map() }; work.set(id, entry);
    }
    const isNew = !existing || row.autoAction === "auto_create_variant";
    const productId = isNew ? `import-row:${row.rowNumber}` : existing.id;
    if (isNew) entry.current.members.push({ id: productId, storeId: input.storeId, groupId: id, unit: row.unit, price: roundMoney(decimalToRatio(row.price)), costPrice: row.costPrice == null ? null : roundMoney(decimalToRatio(row.costPrice)), isActive: true, conversionNeedsReview: row.conversionNeedsReview ?? false, unitMultiplierToBase: row.unitMultiplierToBase ?? 1 });
    else if (row.unitMultiplierToBase != null) entry.current.members.find(m => m.id === productId)!.unitMultiplierToBase = row.unitMultiplierToBase;
    entry.rows.set(productId, row);
    if (row.autoAction !== "auto_skip") entry.intents.push({ productId, rowNumber: row.rowNumber, price: row.price, costPrice: row.costPrice });
  }
  for (const entry of work.values()) {
    if (!entry.intents.length) continue;
    if (!entry.before.members.length) {
      const ordered = [...entry.current.members].sort((a, b) => Number(a.unitMultiplierToBase) - Number(b.unitMultiplierToBase) || a.unit.localeCompare(b.unit));
      entry.current.baseUnit = ordered[0].unit;
      const config = initializeGroupPricing(entry.current).config; config.members = {};
      entry.before = { ...entry.current, members: [], config };
    }
    try {
      const { projection, conflicts } = projectImportGroupPricing(entry.before, entry.current, entry.intents);
      for (const member of projection.members) {
        const row = entry.rows.get(member.productId); if (!row) continue;
        const errors = conflicts.filter(c => c.productId === member.productId).map(c => c.message);
        row.pricingPreview = { price: Number(member.price), costPrice: member.costPrice === null ? null : Number(member.costPrice), errors };
        row.errors.push(...errors);
      }
    } catch (error) {
      for (const row of entry.rows.values()) row.errors.push(error instanceof Error ? error.message : "Perhitungan harga grup belum dapat dilakukan.");
    }
  }
  return rows;
}

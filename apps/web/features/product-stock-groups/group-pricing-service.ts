import { createHash } from "node:crypto";
import type { Prisma } from "@pos/db";
import {
  decimalToRatio, derivePriceFactor, divideRatios, exactRatio,
  initializeGroupPricing, projectGroupPricing, roundMoney,
  type ExactDecimal, type ExactRatio, type GroupPricingConfig,
  type GroupPricingInput, type GroupPricingProjection, type PricingMode,
} from "./automatic-pricing";
import { lockProductRow, lockProductStockGroupRow, StockMutationConflictError } from "./stock-group-lock";
import { buildProductPriceLogEntries, type ProductPriceLogSource, type ProductPriceSnapshot } from "../../lib/product-price-logs/price-log-entries";

export class GroupPricingError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 422) { super(message); }
}

export type GroupPricingChanges = {
  sourceProductId?: string;
  members?: Array<{
    productId: string;
    mode?: PricingMode;
    factor?: ExactRatio;
    price?: ExactDecimal;
    costPrice?: ExactDecimal | null;
  }>;
};
export type PreparedGroupPricingMutation = {
  storeId: string;
  before: Map<string, GroupPricingInput>;
};
type Audit = {
  actor?: { id?: string | null; name?: string | null } | null;
  source?: ProductPriceLogSource;
  note?: string | null;
};
const sorted = (ids: readonly string[]) => [...new Set(ids.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const selection = {
  id: true, storeId: true, baseUnit: true, pricingConfig: true,
  products: { orderBy: { id: "asc" }, select: {
    id: true, storeId: true, stockGroupId: true, unit: true, price: true, costPrice: true,
    unitMultiplierToBase: true, isActive: true, conversionNeedsReview: true,
  } },
} satisfies Prisma.ProductStockGroupSelect;
type PricingRow = Prisma.ProductStockGroupGetPayload<{ select: typeof selection }>;

export function groupPricingInputFromRow(group: PricingRow): GroupPricingInput {
  return {
    groupId: group.id, storeId: group.storeId, baseUnit: group.baseUnit,
    config: (group.pricingConfig ?? null) as GroupPricingConfig | null,
    members: group.products.map(member => ({
      id: member.id, storeId: member.storeId, groupId: member.stockGroupId!, unit: member.unit,
      price: member.price.toString(), costPrice: member.costPrice?.toString() ?? null,
      unitMultiplierToBase: member.unitMultiplierToBase,
      isActive: member.isActive, conversionNeedsReview: member.conversionNeedsReview,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export async function readGroupPricingInput(tx: Pick<Prisma.TransactionClient, "productStockGroup">, input: { storeId: string; groupId: string }): Promise<GroupPricingInput> {
  const row = await tx.productStockGroup.findFirst({ where: { id: input.groupId, storeId: input.storeId }, select: selection });
  if (!row) throw new GroupPricingError("Grup satuan tidak ditemukan di toko ini.", 404);
  return groupPricingInputFromRow(row);
}

/** Seed only after every member has joined a new group. New followers start at factor one. */
export async function seedNewGroupPricingMutation(tx: Prisma.TransactionClient, input: {
  prepared: PreparedGroupPricingMutation; groupId: string; sourceProductId?: string; newProductIds?: readonly string[];
}): Promise<void> {
  const current = await readGroupPricingInput(tx, { storeId: input.prepared.storeId, groupId: input.groupId });
  const config = initializeGroupPricing(current).config;
  if (input.sourceProductId !== undefined) {
    const source = current.members.find(member => member.id === input.sourceProductId);
    if (!source || !source.isActive || source.conversionNeedsReview || !(Number(source.unitMultiplierToBase) > 0)) {
      throw new GroupPricingError("Pilih acuan aktif dalam grup ini dengan konversi yang valid.", 422);
    }
    config.sourceProductId = source.id;
  }
  // Keep the complete money preimage for moved products, but let persistence write
  // creation baselines for genuinely new products instead of placeholder changes.
  config.members = {};
  input.prepared.before.set(current.groupId, {
    ...current, config,
    members: current.members.filter(member => !input.newProductIds?.includes(member.id)),
  });
}

/** Call before any selected-product locks or writes. Includes inactive members. */
export async function prepareGroupPricingMutation(tx: Prisma.TransactionClient, input: {
  storeId: string; groupIds: readonly string[]; extraProductIds?: readonly string[];
}): Promise<PreparedGroupPricingMutation> {
  const groupIds = sorted(input.groupIds);
  for (const stockGroupId of groupIds) {
    if (!await lockProductStockGroupRow(tx, { storeId: input.storeId, stockGroupId })) throw new GroupPricingError("Grup satuan tidak ditemukan di toko ini.", 404);
  }
  const before = new Map<string, GroupPricingInput>();
  for (const groupId of groupIds) before.set(groupId, await readGroupPricingInput(tx, { storeId: input.storeId, groupId }));
  const productIds = sorted([...before.values()].flatMap(group => group.members.map(member => member.id)).concat(input.extraProductIds ?? []));
  for (const productId of productIds) {
    if (!await lockProductRow(tx, { storeId: input.storeId, productId })) throw new StockMutationConflictError();
  }
  for (const groupId of groupIds) {
    const current = await readGroupPricingInput(tx, { storeId: input.storeId, groupId });
    if (JSON.stringify(current.members.map(m => m.id)) !== JSON.stringify(before.get(groupId)!.members.map(m => m.id))) throw new StockMutationConflictError();
    // Money must be re-read after product locks; other compliant writers lock the group first.
    before.set(groupId, current);
  }
  return { storeId: input.storeId, before };
}

function projectChanges(before: GroupPricingInput, current: GroupPricingInput, changes: GroupPricingChanges = {}, allowInactiveMembers = false): GroupPricingProjection {
  const config = structuredClone(initializeGroupPricing(before).config);
  const next = { ...structuredClone(current), config };
  if (changes.sourceProductId !== undefined) {
    const source = next.members.find(m => m.id === changes.sourceProductId);
    if (!source || !source.isActive || source.conversionNeedsReview || !(Number(source.unitMultiplierToBase) > 0)) {
      throw new GroupPricingError("Pilih acuan aktif dalam grup ini dengan konversi yang valid.", 422);
    }
    if (config.sourceProductId !== source.id) {
      config.sourceProductId = source.id;
      for (const member of Object.values(config.members)) if (member.mode === "AUTO") member.factor = null;
    }
  }
  const intents = changes.members ?? [];
  if (new Set(intents.map(m => m.productId)).size !== intents.length) throw new GroupPricingError("Satuan hanya boleh diubah satu kali.", 422);
  for (const intent of intents) {
    const member = next.members.find(m => m.id === intent.productId && (m.isActive || allowInactiveMembers));
    if (!member) throw new GroupPricingError("Satuan aktif tidak ditemukan dalam grup ini.", 422);
    const previous = config.members[member.id] ?? { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review: { price: [], costPrice: [] } };
    config.members[member.id] = previous;
    if (intent.mode) {
      if (member.id === config.sourceProductId && intent.mode === "MANUAL") throw new GroupPricingError("Acuan harga tetap menjadi sumber perhitungan grup.", 422);
      if (intent.mode === "AUTO" && previous.mode === "MANUAL") previous.factor = null;
      previous.mode = intent.mode;
    }
    if (member.id !== config.sourceProductId && previous.mode === "AUTO" && intent.costPrice !== undefined) {
      throw new GroupPricingError("HPP satuan Otomatis mengikuti acuan. Ubah HPP acuan atau pilih mode Manual terlebih dahulu.", 422);
    }
    try {
      if (intent.price !== undefined) member.price = roundMoney(decimalToRatio(intent.price));
      if (intent.costPrice !== undefined) member.costPrice = intent.costPrice === null ? null : roundMoney(decimalToRatio(intent.costPrice));
    } catch (error) {
      throw new GroupPricingError(error instanceof Error ? error.message : "Nilai uang tidak valid.", 422);
    }
    if (intent.factor !== undefined) {
      if (intent.price !== undefined || previous.mode !== "AUTO" || member.id === config.sourceProductId) throw new GroupPricingError("Penyesuaian hanya berlaku untuk pengikut Otomatis tanpa input harga langsung.", 422);
      previous.factor = exactRatio(intent.factor.numerator, intent.factor.denominator);
    }
  }
  const source = next.members.find(m => m.id === config.sourceProductId && m.isActive && !m.conversionNeedsReview && Number(m.unitMultiplierToBase) > 0);
  for (const intent of intents) {
    const member = next.members.find(m => m.id === intent.productId)!;
    if (intent.price !== undefined && member.id !== config.sourceProductId && config.members[member.id].mode === "AUTO") {
      const conversion = source && !member.conversionNeedsReview && Number(member.unitMultiplierToBase) > 0
        ? divideRatios(decimalToRatio(member.unitMultiplierToBase), decimalToRatio(source.unitMultiplierToBase)) : null;
      config.members[member.id].factor = source && conversion ? derivePriceFactor(member.price, source.price, conversion) : null;
    }
  }
  try { return projectGroupPricing(next); }
  catch (error) { throw new GroupPricingError(error instanceof Error ? error.message : "Perhitungan harga tidak valid.", 422); }
}

async function persistProjection(tx: Prisma.TransactionClient, before: GroupPricingInput, projection: GroupPricingProjection, audit: Audit, priceLogBefore?: ReadonlyMap<string, Pick<ProductPriceSnapshot, "price" | "costPrice">>) {
  const logs = projection.members.flatMap(member => {
    const old = priceLogBefore?.get(member.productId) ?? before.members.find(m => m.id === member.productId);
    return buildProductPriceLogEntries({ productId: member.productId, storeId: before.storeId, before: old ?? null,
      after: member, actor: audit.actor, source: audit.source ?? "SYSTEM", note: audit.note ?? "Sinkronisasi harga otomatis grup satuan" });
  });
  for (const member of projection.members) {
    await tx.product.update({ where: { id: member.productId }, data: { price: member.price, costPrice: member.costPrice } });
  }
  await tx.productStockGroup.update({ where: { id: before.groupId }, data: { pricingConfig: projection.config as unknown as Prisma.InputJsonValue } });
  if (logs.length) await tx.productPriceLog.createMany({ data: logs });
  await tx.productStockGroupActivity.create({ data: {
    stockGroupId: before.groupId, type: "GROUP_PRICING_CHANGED", createdBy: audit.actor?.id ?? null,
    person: audit.actor?.name ?? null, note: audit.note ?? "Harga otomatis grup satuan diperbarui",
    before: { config: before.config ?? null, members: before.members } as unknown as Prisma.InputJsonValue,
    after: projection as unknown as Prisma.InputJsonValue,
  } });
}

/** Project once after all writes, using prewrite factors. Does not open a transaction. */
export async function synchronizeGroupPricingMutation(tx: Prisma.TransactionClient, input: {
  prepared: PreparedGroupPricingMutation;
  changes?: Record<string, GroupPricingChanges>;
  /** Ordinary product edits may change pricing while deactivating a member. */
  allowInactiveMembers?: boolean;
  /** True prewrite money for products moved between groups, used only for price history. */
  priceLogBefore?: ReadonlyMap<string, Pick<ProductPriceSnapshot, "price" | "costPrice">>;
} & Audit): Promise<GroupPricingProjection[]> {
  const results: GroupPricingProjection[] = [];
  for (const [groupId, before] of input.prepared.before) {
    const current = await readGroupPricingInput(tx, { storeId: input.prepared.storeId, groupId });
    const projection = projectChanges(before, current, input.changes?.[groupId], input.allowInactiveMembers);
    await persistProjection(tx, before, projection, input, input.priceLogBefore);
    results.push(projection);
  }
  return results;
}

function token(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function groupPricingVersion(input: GroupPricingInput): string { return token(input); }
export type GroupPricingPreview = {
  version: string; revision: number; projectionToken: string;
  before: GroupPricingProjection; after: GroupPricingProjection;
};
export function previewGroupPricingSnapshot(before: GroupPricingInput, current: GroupPricingInput, changes: GroupPricingChanges = {}): GroupPricingPreview {
  const initialized = initializeGroupPricing(before);
  const after = projectChanges(before, current, changes);
  return { version: groupPricingVersion(before), revision: before.config?.revision ?? 0, projectionToken: token(after), before: {
    ...initialized, members: before.members.map(m => ({ productId: m.id, price: m.price.toString(), costPrice: m.costPrice?.toString() ?? null, review: initialized.config.members[m.id]?.review ?? { price: [], costPrice: [] } })),
  }, after };
}

export async function previewGroupPricingChange(tx: Pick<Prisma.TransactionClient, "productStockGroup">, input: {
  storeId: string; groupId: string; changes: GroupPricingChanges;
}): Promise<GroupPricingPreview> {
  const before = await readGroupPricingInput(tx, input);
  return previewGroupPricingSnapshot(before, before, input.changes);
}

export async function applyGroupPricingChange(tx: Prisma.TransactionClient, input: {
  storeId: string; groupId: string; changes: GroupPricingChanges; expectedVersion: string; expectedProjection: string;
} & Audit): Promise<GroupPricingProjection> {
  const prepared = await prepareGroupPricingMutation(tx, { storeId: input.storeId, groupIds: [input.groupId] });
  const before = prepared.before.get(input.groupId)!;
  if (groupPricingVersion(before) !== input.expectedVersion) {
    throw new GroupPricingError("Data harga grup berubah. Muat pratinjau terbaru sebelum menyimpan.", 409);
  }
  const preview = previewGroupPricingSnapshot(before, before, input.changes);
  if (preview.version !== input.expectedVersion || preview.projectionToken !== input.expectedProjection) {
    throw new GroupPricingError("Data harga grup berubah. Muat pratinjau terbaru sebelum menyimpan.", 409);
  }
  await persistProjection(tx, before, preview.after, input);
  return preview.after;
}

export async function initializeGroupPricingInTransaction(tx: Prisma.TransactionClient, input: {
  storeId: string; groupId: string;
} & Audit): Promise<GroupPricingProjection> {
  const prepared = await prepareGroupPricingMutation(tx, { storeId: input.storeId, groupIds: [input.groupId] });
  const before = prepared.before.get(input.groupId)!;
  const projection = initializeGroupPricing(before);
  if (projection.initialized) await persistProjection(tx, before, projection, input);
  return projection;
}

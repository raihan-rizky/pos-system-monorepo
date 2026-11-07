import { Prisma } from "@pos/db";
import { initializeGroupPricing } from "@/features/product-stock-groups/automatic-pricing";
import {
  GroupPricingError, readGroupPricingInput, previewGroupPricingSnapshot, synchronizeGroupPricingMutation,
  groupPricingVersion, type GroupPricingChanges, type PreparedGroupPricingMutation,
} from "@/features/product-stock-groups/group-pricing-service";
import { ShoppingRequestCorrectionError } from "../services/shopping-request-correction-error";
import type { CorrectionPreview, ShoppingRequestCorrectionInput } from "../types/shopping-request-correction";
import type { ShoppingRequestActor } from "../types/shopping-request";

type Choice = ShoppingRequestCorrectionInput["catalog"][number];

export async function planCorrectionCatalog(tx: Prisma.TransactionClient, storeId: string, choices: Choice[]) {
  const products = await tx.product.findMany({
    where: { storeId, id: { in: choices.map(choice => choice.productId) } },
    select: { id: true, name: true, stockGroupId: true, costPrice: true, price: true, updatedAt: true },
  });
  const byId = new Map(products.map(product => [product.id, product]));
  const singles: Choice[] = [];
  const groupChanges: Record<string, GroupPricingChanges> = {};
  const versions: string[] = [];
  const changes: CorrectionPreview["changes"] = [];
  const add = (name: string, field: string, before: string | null, after: string | null) => {
    if (before !== after) changes.push({ field: `katalog.${name}.${field}`, before, after });
  };
  for (const choice of choices) {
    const product = byId.get(choice.productId);
    if (!product || product.updatedAt.toISOString() !== choice.expectedUpdatedAt) {
      throw new ShoppingRequestCorrectionError("Harga katalog berubah. Muat ulang dan coba lagi.", 409);
    }
    if (!product.stockGroupId) {
      singles.push(choice);
      if (choice.costPrice !== null) add(product.name, "HPP", product.costPrice?.toFixed(2) ?? null, new Prisma.Decimal(choice.costPrice).toFixed(2));
      if (choice.salePrice !== null) add(product.name, "hargaJual", product.price.toFixed(2), new Prisma.Decimal(choice.salePrice).toFixed(2));
    }
  }
  const groupIds = [...new Set(products.flatMap(product => product.stockGroupId ? [product.stockGroupId] : []))].sort();
  for (const groupId of groupIds) {
    const before = await readGroupPricingInput(tx, { storeId, groupId });
    versions.push(groupPricingVersion(before));
    const config = initializeGroupPricing(before).config;
    const intents = new Map<string, NonNullable<GroupPricingChanges["members"]>[number]>();
    const set = (id: string, field: "costPrice" | "price", value: string) => {
      const intent = intents.get(id) ?? { productId: id };
      if (intent[field] !== undefined && String(intent[field]) !== value) throw new ShoppingRequestCorrectionError("Pilihan harga pada grup satuan saling berbeda. Periksa HPP acuan.", 422);
      intent[field] = value;
      intents.set(id, intent);
    };
    const groupChoices = choices.filter(choice => byId.get(choice.productId)?.stockGroupId === groupId);
    for (const choice of groupChoices) {
      const member = before.members.find(member => member.id === choice.productId);
      if (!member?.isActive || member.conversionNeedsReview || !(Number(member.unitMultiplierToBase) > 0)) throw new ShoppingRequestCorrectionError("Satuan katalog perlu diperiksa kembali.", 409);
      if (choice.salePrice !== null) set(member.id, "price", new Prisma.Decimal(choice.salePrice).toFixed(2));
      if (choice.costPrice !== null) {
        const automatic = member.id !== config.sourceProductId && config.members[member.id]?.mode === "AUTO";
        const source = automatic ? before.members.find(candidate => candidate.id === config.sourceProductId) : member;
        if (!source?.isActive || source.conversionNeedsReview || !(Number(source.unitMultiplierToBase) > 0)) throw new ShoppingRequestCorrectionError("Acuan HPP grup tidak tersedia.", 409);
        const cost = new Prisma.Decimal(choice.costPrice).mul(String(source.unitMultiplierToBase)).div(String(member.unitMultiplierToBase)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
        set(source.id, "costPrice", cost);
      }
    }
    const intent = { members: [...intents.values()] };
    let projection;
    try { projection = previewGroupPricingSnapshot(before, before, intent).after; }
    catch (error) {
      if (error instanceof GroupPricingError) throw new ShoppingRequestCorrectionError(error.message, error.status);
      throw error;
    }
    for (const choice of groupChoices) {
      const member = projection.members.find(member => member.productId === choice.productId)!;
      if ((choice.costPrice !== null && member.costPrice !== new Prisma.Decimal(choice.costPrice).toFixed(2)) ||
          (choice.salePrice !== null && member.price !== new Prisma.Decimal(choice.salePrice).toFixed(2))) {
        throw new ShoppingRequestCorrectionError("Harga pilihan tidak dapat diwakili tepat oleh konversi otomatis. Periksa harga acuan grup.", 422);
      }
    }
    for (const member of projection.members) {
      const old = before.members.find(old => old.id === member.productId)!;
      const product = await tx.product.findFirstOrThrow({ where: { id: member.productId, storeId }, select: { name: true } });
      add(product.name, "HPP", old.costPrice === null ? null : new Prisma.Decimal(old.costPrice.toString()).toFixed(2), member.costPrice);
      add(product.name, "hargaJual", new Prisma.Decimal(old.price.toString()).toFixed(2), member.price);
    }
    groupChanges[groupId] = intent;
  }
  return { singles, groupChanges, changes, versions };
}

export async function applyCorrectionCatalog(tx: Prisma.TransactionClient, input: {
  storeId: string; requestId: string; actor: ShoppingRequestActor;
  plan: Awaited<ReturnType<typeof planCorrectionCatalog>>;
  prepared: PreparedGroupPricingMutation | null;
}) {
  const note = `Koreksi daftar belanja ${input.requestId}`;
  if (Object.keys(input.plan.groupChanges).length) {
    if (!input.prepared) throw new ShoppingRequestCorrectionError("Kunci grup harga tidak tersedia.", 409);
    await synchronizeGroupPricingMutation(tx, {
      prepared: { ...input.prepared, before: new Map([...input.prepared.before].filter(([id]) => id in input.plan.groupChanges)) },
      changes: input.plan.groupChanges, actor: input.actor, source: "SYSTEM", note,
    });
  }
  for (const choice of input.plan.singles) {
    const before = await tx.product.findFirstOrThrow({ where: { id: choice.productId, storeId: input.storeId }, select: { costPrice: true, price: true } });
    const updated = await tx.product.updateMany({
      where: { id: choice.productId, storeId: input.storeId, stockGroupId: null, updatedAt: new Date(choice.expectedUpdatedAt) },
      data: { ...(choice.costPrice !== null ? { costPrice: choice.costPrice } : {}), ...(choice.salePrice !== null ? { price: choice.salePrice } : {}) },
    });
    if (updated.count !== 1) throw new ShoppingRequestCorrectionError("Harga katalog berubah. Muat ulang dan coba lagi.", 409);
    for (const [field, oldValue, newValue] of [["COST_PRICE", before.costPrice, choice.costPrice], ["PRICE", before.price, choice.salePrice]] as const) {
      if (newValue !== null && (oldValue === null || !oldValue.equals(newValue))) await tx.productPriceLog.create({ data: { productId: choice.productId, storeId: input.storeId, field, oldValue, newValue, source: "SYSTEM", note, changedBy: input.actor.id, changedByName: input.actor.name } });
    }
  }
}

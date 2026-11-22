import { createHmac, timingSafeEqual } from "node:crypto";
import { db, type Prisma } from "@pos/db";
import { z } from "zod";
import { loadProductBaseCosts } from "@/features/customer-category-pricing/helpers/base-cost";
import { CUSTOMER_TYPES, formatPricingRuleLabel, priceProductForCustomerType, type AppliedCategoryPricing } from "@/features/customer-category-pricing/helpers/pricing-rules";
import { loadCustomerPricingRules } from "@/features/customer-category-pricing/server/pricing-rule-loader";
import { DEFAULT_PRICE_ROUNDING_SETTINGS, roundSellingPriceLine, validatePriceRoundingSettings } from "@/features/product-price-rounding/rounding";
import { listCatalogSubcategories } from "../helpers/classification";

type Actor = { id: string; role: string; storeId: string | null };
type MoveInput = { productIds: string[]; subcategoryId: string };
type ApplyInput = MoveInput & { token: string };

export class ClassificationMoveError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ClassificationMoveError";
  }
}

const moveInputSchema = z.object({
  productIds: z.array(z.string().trim().min(1).max(200)).min(1).max(1000)
    .refine((ids) => new Set(ids).size === ids.length),
  subcategoryId: z.string().trim().min(1).max(200),
}).strict();
const expiryMilliseconds = 10 * 60 * 1000;
const transactionOptions = { isolationLevel: "Serializable" as const, maxWait: 10_000, timeout: 30_000 };
const subcategorySelect = { id: true, group: true, name: true, legacyCategoryId: true } as const;
const productSelect = {
  id: true, name: true, unit: true, imageUrl: true, isActive: true,
  categoryId: true, catalogSubcategoryId: true, stockGroupId: true, storeId: true,
  price: true, costPrice: true, hargaAgen: true, hargaDinas: true, brandId: true, updatedAt: true,
  category: { select: { id: true, name: true } },
  catalogSubcategory: { select: subcategorySelect },
} as const;

function invalidPreview(): never {
  throw new ClassificationMoveError(409, "Data atau pratinjau sudah berubah. Tinjau kembali sebelum memindahkan satuan.");
}

function parseInput(input: MoveInput): MoveInput {
  const parsed = moveInputSchema.safeParse(input);
  if (!parsed.success) throw new ClassificationMoveError(422, "Pilih satuan dan subkategori tujuan yang valid.");
  return { ...parsed.data, productIds: [...parsed.data.productIds].sort() };
}

function sign(actor: Actor, expiresAt: number, snapshot: unknown): string {
  const secret = process.env.CATEGORY_PREVIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AUTH_SECRET || process.env.DATABASE_URL;
  if (!secret) throw new ClassificationMoveError(503, "Pratinjau aman belum tersedia. Hubungi pengelola.");
  return createHmac("sha256", secret)
    .update(JSON.stringify(["classification-move-v1", actor.id, actor.role, actor.storeId, expiresAt, snapshot]))
    .digest("hex");
}

function verifyToken(actor: Actor, token: string, snapshot: unknown): void {
  const [expiry, actual, extra] = token.split(".");
  const expiresAt = Number(expiry);
  if (extra !== undefined || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() ||
    expiresAt > Date.now() + expiryMilliseconds || !actual || !/^[a-f0-9]{64}$/.test(actual)) invalidPreview();
  const expected = sign(actor, expiresAt, snapshot);
  if (!timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))) invalidPreview();
}

async function loadSnapshot(tx: Prisma.TransactionClient, actor: Actor, input: MoveInput) {
  const storeId = actor.storeId || "store-main";
  const target = await tx.productSubcategory.findUnique({ where: { id: input.subcategoryId }, select: subcategorySelect });
  if (!target || listCatalogSubcategories(target.group, [target]).length !== 1) invalidPreview();
  const products = await tx.product.findMany({
    where: { storeId, id: { in: input.productIds } }, select: productSelect, orderBy: { id: "asc" },
  });
  if (products.length !== input.productIds.length) invalidPreview();
  const [rules, baseCosts, settings] = await Promise.all([
    loadCustomerPricingRules(tx, storeId, false),
    loadProductBaseCosts(tx, products),
    tx.storeSettings.findUnique({
      where: { id: "store-main" },
      select: {
        specialPricingEnabled: true, priceRoundingEnabled: true,
        priceRoundingIncrement: true, priceRoundingThreshold: true,
        priceRoundingExcludedCategories: { select: { id: true } },
      },
    }),
  ]);
  const rounding = settings ? validatePriceRoundingSettings({
    enabled: settings.priceRoundingEnabled,
    increment: settings.priceRoundingIncrement,
    threshold: settings.priceRoundingThreshold,
    excludedCategoryIds: settings.priceRoundingExcludedCategories.map((category) => category.id).sort(),
  }) : { ...DEFAULT_PRICE_ROUNDING_SETTINGS, excludedCategoryIds: [] };
  return {
    storeId, target, products, rules,
    baseCosts: products.map((product) => ({ id: product.id, ...baseCosts.get(product.id) })),
    specialPricingEnabled: settings?.specialPricingEnabled ?? false,
    rounding,
  };
}

export async function previewClassificationMove(actor: Actor, raw: MoveInput) {
  const input = parseInput(raw);
  return db.$transaction(async (tx) => {
    const snapshot = await loadSnapshot(tx, actor, input);
    const expiresAt = Date.now() + expiryMilliseconds;
    const moving = snapshot.products.filter((product) => product.catalogSubcategoryId !== snapshot.target.id);
    const baseCosts = new Map(snapshot.baseCosts.map(({ id, ...cost }) => [id, cost]));
    const examples: { unitId: string; unitName: string; customerType: string; before: number; after: number; beforeRule: { id: string; scope: "CATEGORY" | "SUBCATEGORY" | "MEMBER"; label: string } | null; afterRule: { id: string; scope: "CATEGORY" | "SUBCATEGORY" | "MEMBER"; label: string } | null }[] = [];
    for (const product of moving) {
      const priceable = {
        categoryId: product.categoryId,
        categoryName: product.category.name,
        catalogSubcategoryId: product.catalogSubcategoryId,
        catalogSubcategoryLegacyCategoryId: product.catalogSubcategory?.legacyCategoryId ?? null,
        price: Number(product.price),
        costPrice: product.costPrice == null ? null : Number(product.costPrice),
        hargaAgen: product.hargaAgen == null ? null : Number(product.hargaAgen),
        hargaDinas: product.hargaDinas == null ? null : Number(product.hargaDinas),
        unit: product.unit,
        brandId: product.brandId,
        ...baseCosts.get(product.id),
      };
      for (const customerType of CUSTOMER_TYPES) {
        const finalPrice = (item: typeof priceable) => roundSellingPriceLine(
          priceProductForCustomerType(item, customerType, snapshot.rules, undefined, snapshot.specialPricingEnabled),
          snapshot.rounding, product.categoryId,
        );
        const ruleInfo = (applied: AppliedCategoryPricing | null, item: typeof priceable) => {
          if (!applied) return null;
          if ((customerType === "AGEN" && (item.hargaAgen ?? 0) > 0) || (customerType === "PEMERINTAH" && (item.hargaDinas ?? 0) > 0)) {
            return { id: applied.ruleId, scope: "MEMBER" as const, label: formatPricingRuleLabel(applied) };
          }
          const legacyId = item.catalogSubcategoryId ? item.catalogSubcategoryLegacyCategoryId : item.categoryId;
          const rule = snapshot.rules.find((candidate) => candidate.id === applied.ruleId && candidate.scope === "SUBCATEGORY" && candidate.categoryId === item.catalogSubcategoryId)
            ?? snapshot.rules.find((candidate) => candidate.id === applied.ruleId && (candidate.scope ?? "CATEGORY") === "CATEGORY" && candidate.categoryId === legacyId);
          if (!rule) return null;
          const scope = rule.scope ?? "CATEGORY";
          const place = scope === "CATEGORY" ? `Kategori lama ${rule.categoryName ?? rule.categoryId}` : `Subkategori ${rule.categoryName ?? rule.categoryId}`;
          return { id: rule.id, scope, label: `${place} · ${formatPricingRuleLabel({ ...rule, customerType })}` };
        };
        const target = {
          ...priceable,
          catalogSubcategoryId: snapshot.target.id,
          catalogSubcategoryLegacyCategoryId: snapshot.target.legacyCategoryId,
        };
        const before = finalPrice(priceable);
        const after = finalPrice(target);
        const beforeRule = ruleInfo(before.appliedPricing, priceable);
        const afterRule = ruleInfo(after.appliedPricing, target);
        if (before.unitPrice !== after.unitPrice || beforeRule?.id !== afterRule?.id || beforeRule?.scope !== afterRule?.scope) {
          examples.push({ unitId: product.id, unitName: `${product.name} (${product.unit})`, customerType, before: before.unitPrice, after: after.unitPrice, beforeRule, afterRule });
        }
      }
    }
    return {
      token: `${expiresAt}.${sign(actor, expiresAt, snapshot)}`,
      expiresAt,
      target: snapshot.target,
      totals: {
        selected: snapshot.products.length,
        moving: moving.length,
        unchanged: snapshot.products.length - moving.length,
        active: snapshot.products.filter((product) => product.isActive).length,
        inactive: snapshot.products.filter((product) => !product.isActive).length,
      },
      units: snapshot.products.map((product) => ({
        id: product.id, name: product.name, unit: product.unit, isActive: product.isActive,
        legacyCategoryName: product.category.name, catalogSubcategory: product.catalogSubcategory,
      })),
      pricingImpact: { changed: examples.length, examples },
    };
  }, transactionOptions);
}

export async function applyClassificationMove(actor: Actor, raw: ApplyInput) {
  const { token, ...move } = raw;
  if (typeof token !== "string" || token.length > 300) invalidPreview();
  const input = parseInput(move);
  return db.$transaction(async (tx) => {
    const snapshot = await loadSnapshot(tx, actor, input);
    verifyToken(actor, token, snapshot);
    const movingIds = snapshot.products.filter((product) => product.catalogSubcategoryId !== snapshot.target.id).map((product) => product.id);
    if (movingIds.length) {
      const result = await tx.product.updateMany({
        where: { storeId: snapshot.storeId, id: { in: movingIds } },
        data: { catalogSubcategoryId: snapshot.target.id },
      });
      if (result.count !== movingIds.length) invalidPreview();
    }
    return { moved: movingIds.length, unchanged: snapshot.products.length - movingIds.length };
  }, transactionOptions);
}

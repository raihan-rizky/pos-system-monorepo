import { createHash } from "node:crypto";
import { Prisma } from "@pos/db";
import {
  priceProductForCustomerType,
  resolveCustomPricedLine,
  type CategoryCustomerPricingMode,
  type CategoryPricingRule,
  type CustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";

export interface ApprovalItemInput {
  sourceItemId?: string | null;
  serviceNote?: string | null;
  productId?: string | null;
  printingServiceId?: string | null;
  quantity: number;
  rawMaterialProductId?: string | null;
  rawMaterialQuantity?: number | null;
  size?: string | null;
  material?: string | null;
  submittedPrice?: number | null;
}

export interface ApprovalQuoteInput {
  storeId: string;
  transactionId: string;
  actorRole: string;
  canViewCostPrice: boolean;
  items: ApprovalItemInput[];
}

export interface ApprovalQuotedItem {
  input: ApprovalItemInput;
  name: string;
  unit: string;
  modal: number | null;
  unitCost: number | null;
  rawMaterialUnitCost: number | null;
  rawMaterialUnit: string | null;
  regular: number;
  agent: number | null;
  government: number | null;
  special: number | null;
  appliedUnitPrice: number;
  subtotal: number;
  appliedPricing: {
    ruleId: string;
    customerType: CustomerType;
    categoryId: string;
    categoryName: string | null;
    mode: CategoryCustomerPricingMode;
    value: number;
    unit: string | null;
    brandId: string | null;
    brandName: string | null;
    originalUnitPrice: number;
    appliedUnitPrice: number;
  } | null;
}

export interface ApprovalQuote {
  items: ApprovalQuotedItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  fingerprint: string;
}

interface CanonicalProduct {
  id: string;
  storeId: string;
  name: string;
  price: unknown;
  costPrice: unknown;
  hargaAgen: unknown;
  hargaDinas: unknown;
  unit: string;
  categoryId: string;
  category: { name: string };
  brandId: string | null;
  brand: { name: string } | null;
  size: string | null;
  material: string | null;
  updatedAt: Date;
}

interface CanonicalPrintingService {
  id: string;
  storeId: string;
  name: string;
  basePrice: unknown;
  unit: string;
  updatedAt: Date;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("APPROVAL_INVALID_FINGERPRINT_INPUT");
  }
  return value;
}

export function buildApprovalFingerprint(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(input)))
    .digest("hex");
}

export async function buildApprovalQuote(
  tx: Prisma.TransactionClient,
  input: ApprovalQuoteInput,
): Promise<ApprovalQuote> {
  let normalizedItems = input.items.map((item) => normalizeItem(item));
  if (normalizedItems.length === 0) throw new Error("APPROVAL_CART_EMPTY");

  const transaction = await tx.transaction.findFirst({
    where: { id: input.transactionId, storeId: input.storeId },
    select: {
      id: true,
      storeId: true,
      status: true,
      customerId: true,
      customer: { select: { type: true } },
      discount: true,
      tax: true,
      items: { select: { id: true, printingServiceId: true, serviceNote: true, rawMaterialProductId: true, size: true, material: true } },
    },
  });
  if (!transaction) throw new Error("APPROVAL_TRANSACTION_NOT_FOUND");
  if (transaction.status !== "PENDING_APPROVAL" && transaction.status !== "DRAFT") {
    throw new Error("APPROVAL_TRANSACTION_NOT_EDITABLE");
  }

  const sourceIds = new Set<string>();
  normalizedItems = normalizedItems.map((line) => {
    if (line.sourceItemId) {
      if (sourceIds.has(line.sourceItemId)) throw new Error("APPROVAL_DUPLICATE_SOURCE_ITEM");
      sourceIds.add(line.sourceItemId);
      const source = transaction.items.find((item) => item.id === line.sourceItemId);
      if (!source || source.printingServiceId !== line.printingServiceId) throw new Error("APPROVAL_INVALID_SOURCE_ITEM");
      return { ...line, serviceNote: line.printingServiceId ? line.serviceNote === undefined ? source.serviceNote : line.serviceNote : null };
    }
    if (!line.printingServiceId || line.serviceNote !== undefined) return { ...line, serviceNote: line.serviceNote ?? null };
    const matches = transaction.items.filter((item) => item.printingServiceId === line.printingServiceId &&
      item.rawMaterialProductId === line.rawMaterialProductId && item.size === line.size && item.material === line.material);
    if (matches.length > 1) throw new Error("APPROVAL_SERVICE_NOTE_REQUIRED");
    return { ...line, serviceNote: matches[0]?.serviceNote ?? null };
  });

  const productIds = [
    ...new Set(
      normalizedItems.flatMap((item) =>
        [item.productId, item.rawMaterialProductId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ),
  ];
  const serviceIds = [
    ...new Set(
      normalizedItems
        .map((item) => item.printingServiceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [products, services, rawRules] = await Promise.all([
    productIds.length > 0
      ? tx.product.findMany({
          where: { id: { in: productIds }, storeId: input.storeId, isActive: true },
          select: {
            id: true,
            storeId: true,
            name: true,
            price: true,
            costPrice: true,
            hargaAgen: true,
            hargaDinas: true,
            unit: true,
            categoryId: true,
            category: { select: { name: true } },
            brandId: true,
            brand: { select: { name: true } },
            size: true,
            material: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
    serviceIds.length > 0
      ? tx.printingService.findMany({
          where: { id: { in: serviceIds }, storeId: input.storeId, isActive: true },
          select: {
            id: true,
            storeId: true,
            name: true,
            basePrice: true,
            unit: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
    tx.categoryCustomerPricingRule.findMany({
      where: { storeId: input.storeId, isActive: true },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
      },
    }),
  ]);

  const productById = new Map(
    (products as CanonicalProduct[]).map((product) => [product.id, product]),
  );
  const serviceById = new Map(
    (services as CanonicalPrintingService[]).map((service) => [service.id, service]),
  );
  for (const productId of productIds) {
    if (!productById.has(productId)) throw new Error("APPROVAL_PRODUCT_NOT_FOUND");
  }
  for (const serviceId of serviceIds) {
    if (!serviceById.has(serviceId)) {
      throw new Error("APPROVAL_PRINTING_SERVICE_NOT_FOUND");
    }
  }

  const rules = rawRules.map((rule) => ({
    id: rule.id,
    categoryId: rule.categoryId,
    categoryName: rule.category.name,
    customerType: (rule.customerType ?? "ALL") as CategoryPricingRule["customerType"],
    mode: rule.mode,
    value: Number(rule.value),
    isActive: rule.isActive,
    unit: rule.unit,
    brandId: rule.brandId,
    brandName: rule.brand?.name ?? null,
    updatedAt: rule.updatedAt,
  })) satisfies CategoryPricingRule[];
  const customerType = (transaction.customer?.type ?? "UMUM") as CustomerType;

  const quotedItems = normalizedItems.map((line): ApprovalQuotedItem => {
    const product = line.productId
      ? productById.get(line.productId)
      : undefined;
    const service = line.printingServiceId
      ? serviceById.get(line.printingServiceId)
      : undefined;
    const rawMaterial = line.rawMaterialProductId
      ? productById.get(line.rawMaterialProductId)
      : undefined;

    if (product) {
      const regular = Number(product.price);
      const automatic = priceProductForCustomerType(
        {
          categoryId: product.categoryId,
          categoryName: product.category.name,
          price: regular,
          hargaAgen: product.hargaAgen == null ? null : Number(product.hargaAgen),
          hargaDinas: product.hargaDinas == null ? null : Number(product.hargaDinas),
          unit: product.unit,
          brandId: product.brandId,
          brandName: product.brand?.name ?? null,
        },
        customerType,
        rules,
      );
      const applied = resolveCustomPricedLine({
        pricedLine: automatic,
        submittedPrice: line.submittedPrice,
        role: input.actorRole,
        customerType,
      });
      const appliedPricing = applied.appliedPricing;
      const special =
        appliedPricing &&
        appliedPricing.ruleId !== "harga-agen" &&
        appliedPricing.ruleId !== "harga-dinas"
          ? appliedPricing.appliedUnitPrice
          : null;
      const appliedUnitPrice = roundMoney(applied.unitPrice);

      return {
        input: line,
        name: product.name,
        unit: product.unit,
        modal: input.canViewCostPrice && product.costPrice != null
          ? Number(product.costPrice)
          : null,
        unitCost: product.costPrice == null ? null : Number(product.costPrice),
        rawMaterialUnitCost: null,
        rawMaterialUnit: null,
        regular,
        agent: product.hargaAgen == null ? null : Number(product.hargaAgen),
        government: product.hargaDinas == null ? null : Number(product.hargaDinas),
        special,
        appliedUnitPrice,
        subtotal: roundMoney(appliedUnitPrice * line.quantity),
        appliedPricing: appliedPricing
          ? {
              ruleId: appliedPricing.ruleId,
              customerType: appliedPricing.customerType,
              categoryId: appliedPricing.categoryId,
              categoryName: appliedPricing.categoryName,
              mode: appliedPricing.mode,
              value: appliedPricing.value,
              unit: appliedPricing.unit ?? null,
              brandId: appliedPricing.brandId ?? null,
              brandName: appliedPricing.brandName ?? null,
              originalUnitPrice: appliedPricing.originalUnitPrice,
              appliedUnitPrice: appliedPricing.appliedUnitPrice,
            }
          : null,
      };
    }

    if (!service) throw new Error("APPROVAL_ITEM_SOURCE_REQUIRED");
    const automatic = { unitPrice: Number(service.basePrice), appliedPricing: null };
    const applied = resolveCustomPricedLine({
      pricedLine: automatic,
      submittedPrice: line.submittedPrice,
      role: input.actorRole,
      customerType,
    });
    const modalCost =
      rawMaterial?.costPrice != null && line.rawMaterialQuantity != null
        ? Number(rawMaterial.costPrice) * line.rawMaterialQuantity
        : null;
    const appliedUnitPrice = roundMoney(applied.unitPrice);

    return {
      input: line,
      name: service.name,
      unit: service.unit,
      modal: input.canViewCostPrice && modalCost != null ? roundMoney(modalCost) : null,
      unitCost:
        rawMaterial?.costPrice == null ? null : Number(rawMaterial.costPrice),
      rawMaterialUnitCost:
        rawMaterial?.costPrice == null ? null : Number(rawMaterial.costPrice),
      rawMaterialUnit: rawMaterial?.unit ?? null,
      regular: Number(service.basePrice),
      agent: null,
      government: null,
      special: null,
      appliedUnitPrice,
      subtotal: roundMoney(appliedUnitPrice * line.quantity),
      appliedPricing: null,
    };
  });

  const subtotal = roundMoney(
    quotedItems.reduce((sum, line) => sum + line.subtotal, 0),
  );
  const discount = roundMoney(Number(transaction.discount));
  const tax = roundMoney(Number(transaction.tax));
  const total = roundMoney(Math.max(0, subtotal - discount + tax));
  const fingerprint = buildApprovalFingerprint({
    transactionId: transaction.id,
    storeId: transaction.storeId,
    customerId: transaction.customerId,
    customerType,
    items: quotedItems.map((line) => ({
      ...line,
      sourceProduct: line.input.productId
        ? productById.get(line.input.productId)
        : line.input.rawMaterialProductId
          ? productById.get(line.input.rawMaterialProductId)
          : null,
      sourceService: line.input.printingServiceId
        ? serviceById.get(line.input.printingServiceId)
        : null,
    })),
    pricingRules: rules,
    subtotal,
    discount,
    tax,
    total,
  });

  return { items: quotedItems, subtotal, discount, tax, total, fingerprint };
}

function normalizeItem(item: ApprovalItemInput): ApprovalItemInput {
  const productId = item.productId || null;
  const printingServiceId = item.printingServiceId || null;
  if (Boolean(productId) === Boolean(printingServiceId)) {
    throw new Error("APPROVAL_ITEM_SOURCE_REQUIRED");
  }
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new Error("APPROVAL_INVALID_QUANTITY");
  }
  if (
    item.submittedPrice != null &&
    (!Number.isFinite(item.submittedPrice) || item.submittedPrice < 0)
  ) {
    throw new Error("APPROVAL_INVALID_PRICE");
  }
  if (
    item.rawMaterialQuantity != null &&
    (!Number.isFinite(item.rawMaterialQuantity) || item.rawMaterialQuantity <= 0)
  ) {
    throw new Error("APPROVAL_INVALID_RAW_MATERIAL_QUANTITY");
  }
  if (item.rawMaterialProductId && item.rawMaterialQuantity == null) {
    throw new Error("APPROVAL_RAW_MATERIAL_QUANTITY_REQUIRED");
  }

  return {
    sourceItemId: item.sourceItemId ?? null,
    serviceNote: item.serviceNote,
    productId,
    printingServiceId,
    quantity: item.quantity,
    rawMaterialProductId: item.rawMaterialProductId || null,
    rawMaterialQuantity: item.rawMaterialQuantity ?? null,
    size: item.size ?? null,
    material: item.material ?? null,
    submittedPrice: item.submittedPrice ?? null,
  };
}

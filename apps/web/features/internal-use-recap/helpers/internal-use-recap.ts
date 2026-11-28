import type { Prisma } from "@pos/db";
import {
  internalUseCorrectionFields,
  internalUseCorrectionOrder,
  resolveEffectiveInternalUse,
  type InternalUseCorrection,
} from "@/features/inventory-management/helpers/internal-use-log";
import type {
  InternalUseRecap,
  InternalUseRecapEntry,
  InternalUseRecapPeriod,
  InternalUseRecapProduct,
} from "../types";
import { resolveInternalUsePeriodRange } from "./period";

export interface InternalUseRecapRow {
  id: string;
  productId: string;
  quantity: number;
  unitCost: Prisma.Decimal | number | string | null;
  note: string | null;
  person: string | null;
  createdAt: Date;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
  };
  correctionRequests?: (InternalUseCorrection & { correctedProduct: InternalUseRecapRow["product"] })[];
}

const productFields = { id: true, name: true, sku: true, unit: true } as const;

export const internalUseRecapRowFields = {
  id: true,
  productId: true,
  quantity: true,
  unitCost: true,
  note: true,
  person: true,
  createdAt: true,
  product: { select: productFields },
  correctionRequests: {
    where: { status: "APPROVED" },
    orderBy: internalUseCorrectionOrder,
    select: { ...internalUseCorrectionFields, correctedProduct: { select: productFields } },
  },
} satisfies Prisma.InventoryLogSelect;

function decimalToNumber(value: Prisma.Decimal | number | string | null): number | null {
  if (value === null) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildInternalUseRecap(input: {
  rows: InternalUseRecapRow[];
  period: InternalUseRecapPeriod;
  anchorDate: string;
}): InternalUseRecap {
  const resolved = resolveInternalUsePeriodRange(input.period, input.anchorDate);
  if (!resolved) {
    throw new Error("Invalid internal use recap period range");
  }

  const rows = input.rows.flatMap((row) => {
    const effective = resolveEffectiveInternalUse(row, row.correctionRequests ?? []);
    if (!effective.correction) return [row];
    if (effective.quantity <= 0 || effective.correction.correctedReason !== "USAGE") return [];

    return [{
      ...row,
      productId: effective.productId,
      product: effective.correction.correctedProduct,
      quantity: effective.quantity,
      unitCost: effective.unitCost,
      note: effective.note,
    }];
  });
  const productMap = new Map<string, InternalUseRecapProduct>();
  const entries: InternalUseRecapEntry[] = rows.map((row) => {
    const unitCost = decimalToNumber(row.unitCost);
    const value = unitCost === null ? null : unitCost * row.quantity;
    const groupKey = `${row.productId}:${row.product.unit}`;
    const current =
      productMap.get(groupKey) ??
      ({
        productId: row.productId,
        name: row.product.name,
        sku: row.product.sku,
        unit: row.product.unit,
        quantity: 0,
        value: 0,
        entryCount: 0,
        missingUnitCostCount: 0,
      } satisfies InternalUseRecapProduct);

    current.quantity += row.quantity;
    current.value += value ?? 0;
    current.entryCount += 1;
    if (value === null) current.missingUnitCostCount += 1;
    productMap.set(groupKey, current);

    return {
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      sku: row.product.sku,
      unit: row.product.unit,
      quantity: row.quantity,
      unitCost,
      value,
      note: row.note,
      person: row.person,
      createdAt: row.createdAt.toISOString(),
    };
  });

  const products = [...productMap.values()].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.name.localeCompare(b.name);
  });
  const missingUnitCostCount = products.reduce(
    (total, product) => total + product.missingUnitCostCount,
    0,
  );
  const productCount = new Set(rows.map((row) => row.productId)).size;

  return {
    period: input.period,
    anchorDate: input.anchorDate,
    range: resolved.range,
    summary: {
      entryCount: rows.length,
      productCount,
      unitGroupCount: products.length,
      totalQuantity: products.reduce((total, product) => total + product.quantity, 0),
      totalValue: products.reduce((total, product) => total + product.value, 0),
      missingUnitCostCount,
      hasIncompleteValue: missingUnitCostCount > 0,
    },
    products,
    entries,
  };
}

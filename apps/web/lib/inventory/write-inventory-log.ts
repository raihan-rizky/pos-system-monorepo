import type { Prisma, InventoryLog } from "@pos/db";

export type InventoryType = "IN" | "OUT" | "ADJUSTMENT";

export type InventoryReason =
  | "SALE"
  | "SALE_RETURN"
  | "RESTOCK"
  | "SUPPLIER_RETURN"
  | "WASTE"
  | "USAGE"
  | "OPNAME"
  | "MANUAL_ADJUSTMENT";

export type WriteDirection = "FORWARD" | "REVERSAL";

const FORWARD_MATRIX: Record<InventoryType, InventoryReason[]> = {
  IN: ["RESTOCK", "SALE_RETURN"],
  OUT: ["SALE", "WASTE", "USAGE", "SUPPLIER_RETURN"],
  ADJUSTMENT: ["OPNAME", "MANUAL_ADJUSTMENT"],
};

const REVERSAL_MATRIX: Record<InventoryType, InventoryReason[]> = {
  IN: ["SALE", "WASTE", "USAGE", "SUPPLIER_RETURN"],
  OUT: ["RESTOCK", "SALE_RETURN"],
  ADJUSTMENT: ["OPNAME", "MANUAL_ADJUSTMENT"],
};

export function assertValidReasonForType(
  type: InventoryType,
  reason: InventoryReason,
  direction: WriteDirection = "FORWARD",
): void {
  const allowed =
    direction === "REVERSAL" ? REVERSAL_MATRIX[type] : FORWARD_MATRIX[type];
  if (!allowed.includes(reason)) {
    throw new Error(
      `reason ${reason} is not valid for type ${type} (direction: ${direction})`,
    );
  }
}

export type WriteInventoryLogArgs = {
  productId: string;
  type: InventoryType;
  reason: InventoryReason;
  quantity: number;
  unitCost?: number | null;
  note?: string | null;
  createdBy?: string | null;
  person?: string | null;
  direction?: WriteDirection;
};

export async function writeInventoryLog(
  tx: Prisma.TransactionClient,
  args: WriteInventoryLogArgs,
): Promise<InventoryLog> {
  assertValidReasonForType(args.type, args.reason, args.direction ?? "FORWARD");

  let unitCost = args.unitCost ?? null;
  if (unitCost === null) {
    const product = await tx.product.findUnique({
      where: { id: args.productId },
      select: { costPrice: true },
    });
    if (product?.costPrice != null) {
      unitCost = Number(product.costPrice.toString());
    }
  }

  return tx.inventoryLog.create({
    data: {
      productId: args.productId,
      type: args.type,
      reason: args.reason,
      quantity: args.quantity,
      unitCost,
      note: args.note ?? null,
      createdBy: args.createdBy ?? null,
      person: args.person ?? null,
    },
  });
}

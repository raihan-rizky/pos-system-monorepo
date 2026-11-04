export interface ShoppingRequestDeletionSourceItem {
  productId: string | null;
  inventoryLogId: string | null;
  afterSnapshot: unknown;
}

export interface ShoppingRequestDeletionPlanInput {
  receipts: Array<{ id: string; bundleStatus: string; items: ShoppingRequestDeletionSourceItem[] }>;
  products: Array<{
    id: string;
    name: string;
    unit: string | null;
    stock: number;
    stockGroupId: string | null;
    unitMultiplierToBase: number;
    conversionNeedsReview: boolean;
  }>;
  groups: Array<{ id: string; baseStock: number; baseUnit?: string | null }>;
}

export interface ShoppingRequestDeletionSource {
  receiptId: string;
  receiptLineId: string;
  productId: string;
  inventoryLogId: string;
  quantity: number;
  baseQuantity: number;
}

export interface ShoppingRequestDeletionMovement {
  productId: string;
  productName: string;
  stockGroupId: string | null;
  unit: string | null;
  baseQuantity: number;
  availableBaseStock: number;
  sourceLogIds: string[];
  sources: ShoppingRequestDeletionSource[];
}

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-7 * Math.max(1, Math.abs(left), Math.abs(right));
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function buildShoppingRequestDeletionPlan(input: ShoppingRequestDeletionPlanInput): {
  movements: ShoppingRequestDeletionMovement[];
} {
  const products = new Map(input.products.map((product) => [product.id, product]));
  const groups = new Map(input.groups.map((group) => [group.id, group]));
  const movements = new Map<string, ShoppingRequestDeletionMovement>();
  const sourceIds = new Set<string>();
  const lineIds = new Set<string>();

  for (const receipt of input.receipts) {
    if (!["COMMITTED", "UNDO_BLOCKED"].includes(receipt.bundleStatus)) {
      throw new Error("Dampak stok penerimaan sudah dibatalkan atau tidak tersedia.");
    }
    let canonicalCount = 0;
    let variantCount = 0;
    const canonicalByGroup = new Map<string, number>();
    const variants: Array<{ groupId: string; baseDelta: number }> = [];
    const variantProducts = new Set<string>();
    for (const item of receipt.items) {
      const snapshot = objectValue(item.afterSnapshot);
      const impact = objectValue(snapshot?.inboundReceiptImpact);
      if (!snapshot || !impact || impact.receiptId !== receipt.id) {
        throw new Error("Data dampak stok penerimaan tidak dapat dipastikan.");
      }

      if (
        typeof item.productId !== "string" ||
        item.productId.length === 0 ||
        (impact.stockGroupId !== null && typeof impact.stockGroupId !== "string") ||
        typeof impact.delta !== "number" ||
        !Number.isFinite(impact.delta) ||
        impact.delta <= 0 ||
        typeof impact.baseDelta !== "number" ||
        !Number.isFinite(impact.baseDelta) ||
        impact.baseDelta <= 0
      ) {
        throw new Error("Data dampak stok penerimaan tidak dapat dipastikan.");
      }

      if (impact.kind === "VARIANT") {
        if (impact.receiptLineId !== null || item.inventoryLogId !== null || typeof impact.stockGroupId !== "string" || variantProducts.has(item.productId)) {
          throw new Error("Data dampak stok penerimaan tidak dapat dipastikan.");
        }
        variantProducts.add(item.productId);
        const product = products.get(item.productId);
        const group = groups.get(impact.stockGroupId);
        if (
          !product ||
          !group ||
          product.stockGroupId !== impact.stockGroupId ||
          snapshot.unit !== product.unit ||
          product.conversionNeedsReview ||
          !Number.isFinite(product.unitMultiplierToBase) ||
          product.unitMultiplierToBase <= 0 ||
          !closeEnough(impact.delta * product.unitMultiplierToBase, impact.baseDelta)
        ) {
          throw new Error("Produk atau grup stok berubah sehingga pembalikan tidak dapat dipastikan.");
        }
        variants.push({ groupId: impact.stockGroupId, baseDelta: impact.baseDelta });
        variantCount += 1;
        continue;
      }
      if (impact.kind !== "CANONICAL" || !item.productId || !item.inventoryLogId ||
          typeof impact.receiptLineId !== "string" || !impact.receiptLineId ||
          typeof impact.delta !== "number" || !Number.isFinite(impact.delta) || impact.delta <= 0 ||
          typeof impact.baseDelta !== "number" || !Number.isFinite(impact.baseDelta) || impact.baseDelta <= 0 ||
          (impact.stockGroupId !== null && typeof impact.stockGroupId !== "string")) {
        throw new Error("Data dampak stok penerimaan tidak dapat dipastikan.");
      }
      if (sourceIds.has(item.inventoryLogId) || lineIds.has(impact.receiptLineId)) {
        throw new Error("Data dampak stok penerimaan tercatat lebih dari sekali.");
      }
      sourceIds.add(item.inventoryLogId);
      lineIds.add(impact.receiptLineId);
      canonicalCount += 1;

      const product = products.get(item.productId);
      if (!product || product.stockGroupId !== impact.stockGroupId || snapshot.unit !== product.unit) {
        throw new Error("Produk atau grup stok berubah sehingga pembalikan tidak dapat dipastikan.");
      }
      const groupId = impact.stockGroupId as string | null;
      if (groupId) canonicalByGroup.set(groupId, (canonicalByGroup.get(groupId) ?? 0) + impact.baseDelta);
      if (groupId && (product.conversionNeedsReview || !Number.isFinite(product.unitMultiplierToBase) ||
          product.unitMultiplierToBase <= 0 || !closeEnough(impact.delta * product.unitMultiplierToBase, impact.baseDelta))) {
        throw new Error(`Konversi stok ${product.name} berubah dan perlu diperiksa.`);
      }
      if (!groupId && !closeEnough(impact.delta, impact.baseDelta)) {
        throw new Error(`Data stok ${product.name} tidak dapat dipastikan.`);
      }
      const key = groupId ? `group:${groupId}` : `product:${product.id}`;
      const movement = movements.get(key) ?? {
        productId: product.id,
        productName: product.name,
        stockGroupId: groupId,
        unit: groupId ? groups.get(groupId)?.baseUnit ?? null : product.unit,
        baseQuantity: 0,
        availableBaseStock: 0,
        sourceLogIds: [],
        sources: [],
      };
      movement.baseQuantity += impact.baseDelta;
      movement.sourceLogIds.push(item.inventoryLogId);
      movement.sources.push({
        receiptId: receipt.id,
        receiptLineId: impact.receiptLineId,
        productId: product.id,
        inventoryLogId: item.inventoryLogId,
        quantity: impact.delta,
        baseQuantity: impact.baseDelta,
      });
      movements.set(key, movement);
    }
    if (variantCount > 0 && canonicalCount === 0) {
      throw new Error("Data dampak stok penerimaan tidak dapat dipastikan.");
    }
    if (variants.some(variant => !closeEnough(canonicalByGroup.get(variant.groupId) ?? 0, variant.baseDelta))) {
      throw new Error("Data dampak stok penerimaan tidak dapat dipastikan.");
    }
  }

  const result = [...movements.values()].sort((left, right) =>
    `${left.stockGroupId ?? ""}:${left.productId}`.localeCompare(`${right.stockGroupId ?? ""}:${right.productId}`),
  );
  for (const movement of result) {
    const available = movement.stockGroupId
      ? groups.get(movement.stockGroupId)?.baseStock
      : products.get(movement.productId)?.stock;
    if (available === undefined || !Number.isFinite(available) || available < 0 || !Number.isFinite(movement.baseQuantity)) {
      throw new Error(`Data stok ${movement.productName} tidak dapat dipastikan.`);
    }
    if (available < movement.baseQuantity && !closeEnough(available, movement.baseQuantity)) {
      throw new Error(`Stok ${movement.productName} tidak cukup untuk membatalkan daftar (tersedia ${available}, dibutuhkan ${movement.baseQuantity}).`);
    }
    movement.availableBaseStock = available;
  }
  return { movements: result };
}

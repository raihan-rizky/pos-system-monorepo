import { productSnapshot } from "@/features/batch-operations/helpers/snapshots";
import {
  calculateBaseQuantity,
  calculateDisplayStock,
} from "@/features/product-stock-groups/stock-display";
import {
  hasInboundQuantityConflict,
  resolveGoodsPurchaseFulfillment,
} from "../helpers/inbound-receipt-rules";
import type {
  FinalizableInboundReceipt,
  InboundReceiptMutationResult,
  InboundReceiptStockImpact,
  InventoryInboundReceiptRepository,
  InventoryManagementUser,
  LockedSubmittedInboundReceiptLine,
} from "../types/inventory-management";

export class InboundReceiptFinalizationError extends Error {
  readonly code = "CONFLICT" as const;
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "InboundReceiptFinalizationError";
  }
}

interface FinalizeInboundReceiptInput {
  repository: InventoryInboundReceiptRepository;
  tx: unknown;
  receiptId: string;
  user: InventoryManagementUser & { name?: string | null };
  now: Date;
}

interface GroupedReceiptLines {
  canonicalLines: LockedSubmittedInboundReceiptLine[];
}

interface StockState {
  product: LockedSubmittedInboundReceiptLine["product"];
  stockGroupId: string | null;
  beforeStock: number;
  afterStock: number;
  delta: number;
  baseDelta: number;
}

function conflict(message: string): never {
  throw new InboundReceiptFinalizationError(message);
}

function impactSnapshot(
  state: StockState,
  input: {
    kind: "CANONICAL" | "VARIANT";
    receiptId: string;
    receiptLineId: string | null;
  },
  stock: number,
): Record<string, unknown> {
  return {
    ...productSnapshot({
      ...state.product,
      stock,
    }),
    inboundReceiptImpact: {
      kind: input.kind,
      receiptId: input.receiptId,
      receiptLineId: input.receiptLineId,
      stockGroupId: state.stockGroupId,
      delta: state.delta,
      baseDelta: state.baseDelta,
    },
  };
}

function stockImpact(
  state: StockState,
  input: {
    kind: "CANONICAL" | "VARIANT";
    receiptId: string;
    receiptLineId: string | null;
    inventoryLogId: string | null;
  },
): InboundReceiptStockImpact {
  return {
    productId: state.product.id,
    sku: state.product.sku,
    stockGroupId: state.stockGroupId,
    receiptLineId: input.receiptLineId,
    beforeStock: state.beforeStock,
    afterStock: state.afterStock,
    delta: state.delta,
    baseDelta: state.baseDelta,
    inventoryLogId: input.inventoryLogId,
    beforeSnapshot: impactSnapshot(state, input, state.beforeStock),
    afterSnapshot: impactSnapshot(state, input, state.afterStock),
  };
}

function validateFinalizableReceipt(
  receipt: FinalizableInboundReceipt,
): void {
  if (receipt.stockBundleId) {
    conflict("Penerimaan Barang sudah memiliki bundle stok");
  }
  if (!receipt.goodsPurchaseId || !receipt.goodsPurchaseNumber) {
    conflict("Penerimaan Barang tidak terhubung ke Pembelian Barang");
  }
  if (!receipt.lines.every((line) => line.reviewStatus === "APPROVED")) {
    conflict("Masih ada produk Penerimaan Barang yang belum disetujui");
  }

  for (const line of receipt.lines) {
    if (!line.goodsPurchaseItem) {
      conflict("Produk Penerimaan Barang tidak terhubung ke Pembelian Barang");
    }
    if (
      line.goodsPurchaseItem.goodsPurchaseId !== receipt.goodsPurchaseId ||
      line.goodsPurchaseItem.productId !== line.productId
    ) {
      conflict("Produk Penerimaan Barang tidak cocok dengan Pembelian Barang");
    }
    if (
      !Number.isFinite(line.receivedQuantity) ||
      line.receivedQuantity < 0
    ) {
      conflict("Jumlah produk Penerimaan Barang tidak valid");
    }
    if (
      hasInboundQuantityConflict({
        orderedQuantity: line.goodsPurchaseItem.quantity,
        approvedReceivedQuantity:
          line.approvedReceivedExcludingCurrentReceipt,
        currentReceiptQuantity: line.receivedQuantity,
      })
    ) {
      conflict("Jumlah diterima sudah melebihi sisa Pembelian Barang");
    }
    if (line.receivedQuantity <= 0) continue;
    if (
      !line.product ||
      !line.product.isActive ||
      line.product.id !== line.productId ||
      line.product.storeId !== receipt.storeId
    ) {
      conflict("Produk Penerimaan Barang sudah tidak aktif atau tidak valid");
    }
  }
}

async function executeFinalization(
  input: FinalizeInboundReceiptInput,
): Promise<InboundReceiptMutationResult> {
  const storeId = input.user.storeId;
  if (!storeId) {
    conflict("Pengguna tidak memiliki scope toko");
  }

  const lockedReceipt = await input.repository.lockSubmittedReceipt(input.tx, {
    storeId,
    receiptId: input.receiptId,
  });
  if (!lockedReceipt) {
    conflict("Penerimaan Barang sudah tidak menunggu persetujuan");
  }
  if (lockedReceipt.stockBundleId) {
    conflict("Penerimaan Barang sudah memiliki bundle stok");
  }
  if (
    !lockedReceipt.lines.every((line) => line.reviewStatus === "APPROVED")
  ) {
    return {
      data: { id: lockedReceipt.id, status: "SUBMITTED" },
      finalized: false,
    };
  }
  if (!lockedReceipt.goodsPurchaseId) {
    conflict("Penerimaan Barang tidak terhubung ke Pembelian Barang");
  }

  const purchaseLocked = await input.repository.lockGoodsPurchase(input.tx, {
    storeId,
    goodsPurchaseId: lockedReceipt.goodsPurchaseId,
  });
  if (!purchaseLocked) {
    conflict("Pembelian Barang sudah tidak tersedia");
  }

  const receipt = await input.repository.findReceiptForFinalization(input.tx, {
    storeId,
    receiptId: lockedReceipt.id,
  });
  if (!receipt) {
    conflict("Penerimaan Barang berubah saat finalisasi");
  }
  validateFinalizableReceipt(receipt);
  if (receipt.goodsPurchaseId !== lockedReceipt.goodsPurchaseId) {
    conflict("Sumber Pembelian Barang berubah saat finalisasi");
  }

  const positiveLines = receipt.lines.filter(
    (line) => line.receivedQuantity > 0,
  );
  const grouped = new Map<string, GroupedReceiptLines>();
  for (const line of positiveLines) {
    if (!line.stockGroupId) continue;
    const current = grouped.get(line.stockGroupId) ?? {
      canonicalLines: [],
    };
    current.canonicalLines.push(line);
    grouped.set(line.stockGroupId, current);
  }

  const canonicalStateByLineId = new Map<string, StockState>();
  const variantImpacts: InboundReceiptStockImpact[] = [];

  const sortedStockGroupIds = Array.from(grouped.keys()).sort();
  for (const stockGroupId of sortedStockGroupIds) {
    const update = grouped.get(stockGroupId);
    if (!update) continue;
    const stockGroup = await input.repository.lockStockGroup(input.tx, {
      storeId,
      stockGroupId,
    });
    if (!stockGroup) {
      conflict("Grup stok produk sudah tidak tersedia");
    }
    if (
      stockGroup.variants.some(
        (variant) =>
          variant.conversionNeedsReview ||
          !Number.isFinite(variant.unitMultiplierToBase) ||
          variant.unitMultiplierToBase <= 0,
      )
    ) {
      conflict("Konversi stok bersama perlu ditinjau");
    }

    const lockedVariantByProductId = new Map(
      stockGroup.variants.map((variant) => [variant.id, variant]),
    );
    const canonicalLineDeltas: Array<{
      line: LockedSubmittedInboundReceiptLine;
      product: StockState["product"];
      baseDelta: number;
    }> = [];
    let baseDelta = 0;
    for (const line of update.canonicalLines) {
      const lockedVariant = lockedVariantByProductId.get(line.productId);
      if (
        !lockedVariant ||
        lockedVariant.storeId !== storeId ||
        lockedVariant.stockGroupId !== stockGroupId ||
        !lockedVariant.isActive
      ) {
        conflict("Produk penerimaan tidak aktif di grup stok");
      }
      const lineBaseDelta = calculateBaseQuantity(
        line.receivedQuantity,
        lockedVariant.unitMultiplierToBase,
      );
      if (!Number.isFinite(lineBaseDelta) || lineBaseDelta <= 0) {
        conflict("Konversi stok bersama perlu ditinjau");
      }
      canonicalLineDeltas.push({
        line,
        product: lockedVariant,
        baseDelta: lineBaseDelta,
      });
      baseDelta += lineBaseDelta;
    }
    if (!Number.isFinite(baseDelta) || baseDelta <= 0) {
      conflict("Konversi stok bersama perlu ditinjau");
    }

    const beforeBaseStock = stockGroup.baseStock;
    const afterBaseStock = beforeBaseStock + baseDelta;
    await input.repository.incrementStockGroupBase(input.tx, {
      storeId,
      stockGroupId,
      baseDelta,
    });

    let runningBaseStock = beforeBaseStock;
    for (const canonicalLine of canonicalLineDeltas) {
      const lineBeforeBaseStock = runningBaseStock;
      const lineAfterBaseStock =
        lineBeforeBaseStock + canonicalLine.baseDelta;
      const beforeStock = calculateDisplayStock(
        lineBeforeBaseStock,
        canonicalLine.product.unitMultiplierToBase,
      );
      const afterStock = calculateDisplayStock(
        lineAfterBaseStock,
        canonicalLine.product.unitMultiplierToBase,
      );
      canonicalStateByLineId.set(canonicalLine.line.id, {
        product: canonicalLine.product,
        stockGroupId,
        beforeStock,
        afterStock,
        delta: afterStock - beforeStock,
        baseDelta: canonicalLine.baseDelta,
      });
      runningBaseStock = lineAfterBaseStock;
    }

    for (const variant of stockGroup.variants) {
      const beforeStock = calculateDisplayStock(
        beforeBaseStock,
        variant.unitMultiplierToBase,
      );
      const afterStock = calculateDisplayStock(
        afterBaseStock,
        variant.unitMultiplierToBase,
      );
      const state: StockState = {
        product: variant,
        stockGroupId,
        beforeStock,
        afterStock,
        delta: afterStock - beforeStock,
        baseDelta,
      };
      variantImpacts.push(
        stockImpact(state, {
          kind: "VARIANT",
          receiptId: receipt.id,
          receiptLineId: null,
          inventoryLogId: null,
        }),
      );
    }
  }

  const standaloneLinesByProductId = new Map<
    string,
    LockedSubmittedInboundReceiptLine[]
  >();
  for (const line of positiveLines) {
    if (line.stockGroupId) continue;
    const lines = standaloneLinesByProductId.get(line.productId) ?? [];
    lines.push(line);
    standaloneLinesByProductId.set(line.productId, lines);
  }

  const sortedStandaloneProductIds = Array.from(
    standaloneLinesByProductId.keys(),
  ).sort();
  for (const productId of sortedStandaloneProductIds) {
    const lines = standaloneLinesByProductId.get(productId);
    if (!lines) continue;
    const quantity = lines.reduce(
      (sum, line) => sum + line.receivedQuantity,
      0,
    );
    if (!Number.isFinite(quantity) || quantity <= 0) {
      conflict("Jumlah produk Penerimaan Barang tidak valid");
    }
    const mutation =
      await input.repository.incrementStandaloneProductStock(input.tx, {
        storeId,
        productId,
        quantity,
      });
    if (
      !mutation ||
      mutation.product.id !== productId ||
      mutation.product.storeId !== storeId ||
      mutation.product.stockGroupId
    ) {
      conflict("Produk standalone berubah saat finalisasi");
    }
    let beforeStock = mutation.beforeStock;
    for (const line of lines) {
      const afterStock = beforeStock + line.receivedQuantity;
      canonicalStateByLineId.set(line.id, {
        product: mutation.product,
        stockGroupId: null,
        beforeStock,
        afterStock,
        delta: line.receivedQuantity,
        baseDelta: line.receivedQuantity,
      });
      beforeStock = afterStock;
    }
    if (Math.abs(beforeStock - mutation.afterStock) > 1e-9) {
      conflict("Perubahan stok produk tidak konsisten");
    }
  }

  const canonicalImpacts: InboundReceiptStockImpact[] = [];
  const lineLogIds: Array<{
    lineId: string;
    inventoryLogId: string;
    unitCost: number;
  }> = [];
  for (const line of positiveLines) {
    const state = canonicalStateByLineId.get(line.id);
    const goodsPurchaseItem = line.goodsPurchaseItem;
    if (!state || !goodsPurchaseItem) {
      conflict("Perubahan stok produk tidak dapat dihitung");
    }
    const log = await input.repository.createCanonicalInventoryLog(input.tx, {
      productId: line.productId,
      supplierId: receipt.supplierId,
      type: "IN",
      reason: "RESTOCK",
      quantity: line.receivedQuantity,
      unitCost: goodsPurchaseItem.latestUnitPrice,
      note: receipt.supplierName,
      createdBy: input.user.id,
      person: input.user.name ?? null,
      status: "APPROVED",
      approvedBy: input.user.id,
      approverName: input.user.name ?? null,
      decidedAt: input.now,
    });
    lineLogIds.push({
      lineId: line.id,
      inventoryLogId: log.id,
      unitCost: goodsPurchaseItem.latestUnitPrice,
    });
    canonicalImpacts.push(
      stockImpact(state, {
        kind: "CANONICAL",
        receiptId: receipt.id,
        receiptLineId: line.id,
        inventoryLogId: log.id,
      }),
    );
  }

  const bundle = await input.repository.createReceiptStockBundle(input.tx, {
    type: "INBOUND_RECEIPT",
    status: "COMMITTED",
    storeId,
    createdBy: input.user.id,
    approvedByName: input.user.name ?? null,
    approvedAt: input.now,
    title: receipt.supplierName,
    receiptId: receipt.id,
    goodsPurchaseId: receipt.goodsPurchaseId as string,
    goodsPurchaseNumber: receipt.goodsPurchaseNumber as string,
    supplierId: receipt.supplierId,
    supplierName: receipt.supplierName,
    canonicalImpacts,
    variantImpacts,
  });

  const data = await input.repository.markReceiptApproved(input.tx, {
    storeId,
    receiptId: receipt.id,
    approvedBy: input.user.id,
    approvedAt: input.now,
    stockBundleId: bundle.id,
    lineLogIds,
  });

  const fulfillmentItems =
    await input.repository.listGoodsPurchaseFulfillmentItems(input.tx, {
      storeId,
      goodsPurchaseId: receipt.goodsPurchaseId as string,
    });
  const fulfillmentStatus =
    resolveGoodsPurchaseFulfillment(fulfillmentItems);
  await input.repository.updateGoodsPurchaseFulfillment(input.tx, {
    storeId,
    goodsPurchaseId: receipt.goodsPurchaseId as string,
    fulfillmentStatus,
  });

  return {
    data,
    finalized: true,
    bundle: {
      id: bundle.id,
      type: "INBOUND_RECEIPT",
      title: receipt.supplierName,
      stockGroupCount: grouped.size,
      canonicalImpacts,
      variantImpacts,
    },
  };
}

export async function finalizeInboundReceiptIfReady(
  input: FinalizeInboundReceiptInput,
): Promise<InboundReceiptMutationResult> {
  try {
    return await executeFinalization(input);
  } catch (error) {
    if (error instanceof InboundReceiptFinalizationError) {
      throw error;
    }
    if (
      error instanceof Error &&
      (error.message === "INBOUND_RECEIPT_CONFLICT" ||
        error.message === "PRODUCT_NOT_FOUND" ||
        error.message === "CONVERSION_NEEDS_REVIEW")
    ) {
      throw new InboundReceiptFinalizationError(
        "Penerimaan Barang berubah saat finalisasi",
      );
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      ((error as { code?: unknown }).code === "P2002" ||
        (error as { code?: unknown }).code === "P2034")
    ) {
      throw new InboundReceiptFinalizationError(
        "Penerimaan Barang berubah saat finalisasi",
      );
    }
    throw error;
  }
}

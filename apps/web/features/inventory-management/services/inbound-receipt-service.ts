import {
  calculateInboundAvailability,
  getInboundStockQuantity,
  hasInboundQuantityConflict,
  requiresInboundLineNote,
  requiresInboundQuantityNote,
} from "../helpers/inbound-receipt-rules";
import type {
  InboundReceiptMatchStatus,
} from "../helpers/inbound-receipt-rules";
import type {
  CreateInboundReceiptDraftInput,
  InboundReceiptData,
  InboundReceiptLineStatus,
  InboundReceiptMutationResult,
  InboundReceiptStatus,
  InventoryInboundReceiptRepository,
  InventoryManagementUser,
  InboundPricingPayload,
  InboundPricingCollectionInput,
  InboundPricingSnapshot,
  InboundPricingUnit,
  InboundPaymentInput,
  LockedSubmittedInboundReceiptLine,
  ReceivingQueueResult,
} from "../types/inventory-management";
import { createInboundPricingCollectionSnapshot, createInboundPricingSnapshot, inboundCostForOrderedUnit, inboundPricingReference } from "../helpers/inbound-pricing";
import {
  finalizeInboundReceiptIfReady,
  InboundReceiptFinalizationError,
} from "./inbound-receipt-finalizer";
import { resolveReceiptCost } from "../helpers/receipt-cost";
import { normalizeInboundPayments, validateInboundPayments, sameInboundPayments, inboundPaymentSummary } from "../helpers/inbound-payment";

export class InventoryManagementError extends Error {
  constructor(
    public readonly code:
      | "STORE_REQUIRED"
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID_RECEIPT_LINE"
      | "VALIDATION_ERROR",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "InventoryManagementError";
  }
}

function isCollectionPricing(value: InboundPricingPayload | null | undefined): value is InboundPricingCollectionInput {
  return Boolean(value && "version" in value && value.version === 2);
}

function requireUnchangedReceiptPricing(line: LockedSubmittedInboundReceiptLine): void {
  const snapshot = line.pricingSnapshot;
  if (snapshot?.version !== 2) return;

  const units = line.pricingUnits.filter((unit) => unit.isActive !== false &&
    !unit.conversionNeedsReview && Number.isFinite(unit.unitMultiplierToBase) && unit.unitMultiplierToBase > 0);
  const unchanged = snapshot.orderedUnitMultiplierToBase === line.unitMultiplierToBase &&
    snapshot.units.length === units.length && snapshot.units.every((saved) => {
      const current = units.find((unit) => unit.productId === saved.productId);
      return current && current.unit === saved.unit && current.unitMultiplierToBase === saved.unitMultiplierToBase &&
        current.costPrice === saved.original.costPrice && current.price === saved.original.price &&
        current.hargaAgen === saved.original.hargaAgen && current.hargaDinas === saved.original.hargaDinas &&
        (current.pricingMode ?? "MANUAL") === saved.pricingMode &&
        (current.pricingSourceProductId ?? null) === saved.pricingSourceProductId &&
        (current.pricingConfigRevision ?? null) === saved.pricingConfigRevision;
    });
  if (!unchanged) {
    throw new InventoryManagementError(
      "CONFLICT",
      "Harga atau satuan produk berubah. Tolak penerimaan ini dan buat kembali untuk memeriksa data terbaru.",
      409,
    );
  }
}

function requireCurrentSubmissionPricing(pricing: InboundPricingCollectionInput, units: InboundPricingUnit[]): void {
  for (const proposal of pricing.units) {
    const current = units.find((unit) => unit.productId === proposal.productId);
    const baseline = proposal.baseline;
    if (!current || !baseline || current.unit !== baseline.unit ||
      current.unitMultiplierToBase !== baseline.unitMultiplierToBase || current.costPrice !== baseline.costPrice ||
      current.price !== baseline.price || current.hargaAgen !== baseline.hargaAgen || current.hargaDinas !== baseline.hargaDinas ||
      (current.pricingMode ?? "MANUAL") !== baseline.pricingMode ||
      (current.pricingSourceProductId ?? null) !== baseline.pricingSourceProductId ||
      (current.pricingConfigRevision ?? null) !== baseline.pricingConfigRevision) {
      throw new InventoryManagementError("CONFLICT", "Harga atau satuan produk berubah. Muat ulang dan periksa kembali sebelum mengajukan.", 409);
    }
  }
}

function requireCurrentReceiptLine(line: LockedSubmittedInboundReceiptLine, expectedUpdatedAt?: string): void {
  if (line.pricingSnapshot?.version !== 2) return;
  if (!expectedUpdatedAt || !line.updatedAt || line.updatedAt.toISOString() !== expectedUpdatedAt) {
    throw new InventoryManagementError("CONFLICT", "Produk penerimaan sudah berubah. Muat ulang halaman dan periksa data terbaru.", 409);
  }
}

interface InboundReceiptServiceInput {
  repository: InventoryInboundReceiptRepository;
  user: InventoryManagementUser & { name?: string | null };
  receiptId: string;
}

interface RejectInboundReceiptInput extends InboundReceiptServiceInput {
  rejectionReason: string;
}

interface InboundReceiptItemServiceInput extends InboundReceiptServiceInput {
  itemId: string;
  expectedUpdatedAt?: string;
}

interface EditInboundReceiptItemInput extends InboundReceiptItemServiceInput {
  input: {
    productId?: string;
    matchStatus: InboundReceiptMatchStatus;
    receivedQuantity: number;
    supplierCostPrice?: number | null;
    pricing?: InboundPricingPayload | null;
    note?: string | null;
  };
}

interface NeedsRevisionInboundReceiptInput extends InboundReceiptServiceInput {
  revisionReason: string;
}

interface UpdateAndSubmitInboundReceiptInput extends InboundReceiptServiceInput {
  input: {
    note?: string | null;
    lines: Array<{
      id: string;
      productId: string;
      expectedQuantity: number;
      receivedQuantity: number;
      status: InboundReceiptLineStatus;
      note?: string | null;
    }>;
  };
}

export interface GetReceivingQueueInput {
  repository: InventoryInboundReceiptRepository;
  user: InventoryManagementUser & { name?: string | null };
  input?: {
    search?: string | null;
    take?: number;
    goodsPurchaseId?: string | null;
    supplierId?: string | null;
  };
}

export interface CreateInboundReceiptServiceInput {
  repository: InventoryInboundReceiptRepository;
  user: InventoryManagementUser & { name?: string | null };
  input: {
    supplierId?: string | null;
    shoppingRequestId?: string | null;
    note?: string | null;
    lines: Array<{
      productId: string;
      shoppingRequestItemId?: string | null;
      expectedQuantity: number;
      receivedQuantity: number;
      status: InboundReceiptLineStatus;
      note?: string | null;
    }>;
  };
}

interface GoodsPurchaseForReceipt {
  id: string;
  number: string;
  shoppingRequestId: string;
  supplierId: string | null;
  supplierNameSnapshot: string;
  paymentMethod?: "TRANSFER" | "GIRO" | null;
  paymentDueDate?: Date | null;
  totalAmount?: number;
  payments?: InboundPaymentInput[];
  items: Array<{
    id: string;
    shoppingRequestItemId: string | null;
    productId: string;
    productNameSnapshot: string;
    skuSnapshot: string;
    unitSnapshot: string | null;
    latestUnitPrice: number;
    currentCostPrice: number | null;
    unitMultiplierToBase?: number;
    pricingUnits?: InboundPricingUnit[];
    quantity: number;
    inboundReceiptLines: Array<{
      status: InboundReceiptLineStatus;
      receivedQuantity: number;
      receipt: { status: InboundReceiptStatus };
    }>;
  }>;
}

interface SubmittedGoodsPurchaseReceiptLine {
  goodsPurchaseItemId: string;
  shoppingRequestItemId: string | null;
  productId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  unitSnapshot: string | null;
  costPriceSnapshot: number;
  supplierCostPrice: number | null;
  pricingSnapshot: InboundPricingSnapshot;
  supplierNameSnapshot: string;
  invoiceNumberSnapshot: string;
  expectedQuantity: number;
  receivedQuantity: number;
  status: "RECEIVED";
  matchStatus: InboundReceiptMatchStatus;
  reviewStatus: "PENDING";
  note: string | null;
}

interface GoodsPurchaseReceiptRepository
  extends InventoryInboundReceiptRepository {
  lockGoodsPurchase(
    tx: unknown,
    input: { storeId: string; goodsPurchaseId: string },
  ): Promise<boolean>;
  findGoodsPurchaseForReceipt(
    tx: unknown,
    input: { storeId: string; goodsPurchaseId: string },
  ): Promise<GoodsPurchaseForReceipt | null>;
  createSubmittedGoodsPurchaseReceipt(
    tx: unknown,
    input: {
      storeId: string;
      goodsPurchaseId: string;
      shoppingRequestId: string;
      supplierId: string | null;
      paymentMethod: "TRANSFER" | "GIRO" | null;
      paymentDueDate: Date | null;
      payments: Array<{ method: "TRANSFER" | "GIRO"; amount: number; dueDate: Date | null; note: string | null }>;
      submittedBy: string;
      submittedAt: Date;
      note: string | null;
      lines: SubmittedGoodsPurchaseReceiptLine[];
    },
  ): Promise<InboundReceiptData>;
}

export interface CreateGoodsPurchaseReceiptServiceInput {
  repository: GoodsPurchaseReceiptRepository;
  user: InventoryManagementUser & { name?: string | null };
  input: {
    goodsPurchaseId: string;
    paymentMethod?: "TRANSFER" | "GIRO";
    paymentDueDate?: string | null;
    payments?: InboundPaymentInput[];
    note?: string | null;
    lines: Array<{
      goodsPurchaseItemId: string;
      matchStatus: InboundReceiptMatchStatus;
      receivedQuantity: number;
      supplierCostPrice?: number | null;
      pricing?: InboundPricingPayload | null;
      note?: string | null;
    }>;
  };
}

function requireStoreId(user: InventoryManagementUser): string {
  if (!user.storeId) {
    throw new InventoryManagementError(
      "STORE_REQUIRED",
      "Inventory workflow requires a store-scoped user",
      403,
    );
  }
  return user.storeId;
}

function ensureSubmitted(status: string): void {
  if (status !== "SUBMITTED") {
    throw new InventoryManagementError(
      "CONFLICT",
      `Inbound receipt is ${status}`,
      409,
    );
  }
}

function isPrismaFinalizationConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "P2002" ||
      (error as { code?: unknown }).code === "P2034")
  );
}

function receiptCostOrValidationError(input: {
  supplierCostPrice?: number | null;
  masterCostPrice: number | null;
}): number | null {
  try {
    return resolveReceiptCost(input);
  } catch {
    throw new InventoryManagementError(
      "VALIDATION_ERROR",
      "Harga modal supplier tidak valid",
      422,
    );
  }
}

export async function getReceivingQueue(
  input: GetReceivingQueueInput,
): Promise<ReceivingQueueResult> {
  const storeId = requireStoreId(input.user);
  const rows = await input.repository.listReceivingQueue(storeId, input.input ?? {});
  const grouped = new Map<
    string,
    {
      purchase: ReceivingQueueResult["purchases"][number];
      pendingReceiptIds: Set<string>;
    }
  >();

  for (const row of rows) {
    const availability = calculateInboundAvailability({
      orderedQuantity: row.orderedQuantity,
      approvedReceivedQuantity: row.approvedReceivedQuantity,
      pendingReservedQuantity: row.pendingReservedQuantity,
    });
    let group = grouped.get(row.goodsPurchaseId);
    if (!group) {
      group = {
        purchase: {
          id: row.goodsPurchaseId,
          number: row.goodsPurchaseNumber,
          shoppingRequestName: row.shoppingRequestName ?? null,
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          paymentMethod: row.paymentMethod ?? null,
          paymentDueDate: row.paymentDueDate ?? null,
          totalAmount: row.totalAmount,
          payments: row.payments,
          fulfillmentStatus: row.fulfillmentStatus,
          pendingReceiptCount: 0,
          items: [],
        },
        pendingReceiptIds: new Set<string>(),
      };
      grouped.set(row.goodsPurchaseId, group);
    }

    row.pendingReceiptIds.forEach((receiptId) =>
      group.pendingReceiptIds.add(receiptId),
    );
    group.purchase.items.push({
      goodsPurchaseItemId: row.itemId,
      productId: row.productId,
      productName: row.productName,
      sku: row.sku,
      unit: row.unit,
      currentCostPrice: row.currentCostPrice,
      suggestedCostPrice: row.suggestedCostPrice ?? null,
      pricingUnits: row.pricingUnits ?? [],
      ...availability,
    });
  }

  const purchases = Array.from(grouped.values())
    .filter(({ purchase }) =>
      purchase.items.some((item) => item.availableQuantity > 0),
    )
    .map(({ purchase, pendingReceiptIds }) => ({
      ...purchase,
      pendingReceiptCount: pendingReceiptIds.size,
    }));

  return { purchases, items: [] };
}

export async function approveInboundReceipt(
  input: InboundReceiptServiceInput,
): Promise<InboundReceiptData> {
  const storeId = requireStoreId(input.user);

  try {
    return await input.repository.runInTransaction(async (tx) => {
      const receipt = await input.repository.findReceiptForApproval(tx, {
        storeId,
        receiptId: input.receiptId,
      });
      if (!receipt) {
        throw new InventoryManagementError(
          "NOT_FOUND",
          "Inbound receipt not found",
          404,
        );
      }
      if (receipt.goodsPurchaseId) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Penerimaan Barang dari Pembelian Barang harus disetujui per produk",
          409,
        );
      }
      if (receipt.status === "APPROVED") {
        return { id: receipt.id, status: "APPROVED" };
      }

      ensureSubmitted(receipt.status);

      const lineLogIds: Array<{ lineId: string; inventoryLogId: string }> = [];
      for (const line of receipt.lines) {
        const stockQuantity = getInboundStockQuantity({
          status: line.status,
          receivedQuantity: line.receivedQuantity,
        });
        if (stockQuantity <= 0) continue;
        if (!line.productIsActive || line.latestCostPrice === null || line.latestCostPrice <= 0) {
          throw new InventoryManagementError(
            "INVALID_RECEIPT_LINE",
            "Inbound receipt line is not eligible for approval",
            422,
          );
        }

        await input.repository.applyProductStockDelta(tx, {
          storeId,
          productId: line.productId,
          delta: stockQuantity,
        });
        const log = await input.repository.createInboundStockLog(tx, {
          productId: line.productId,
          quantity: stockQuantity,
          unitCost: line.latestCostPrice,
          supplierId: receipt.supplierId,
          createdBy: input.user.id,
          person: input.user.name ?? null,
          note: `Inbound receipt ${receipt.id}`,
        });
        lineLogIds.push({ lineId: line.id, inventoryLogId: log.id });
      }

      return input.repository.markReceiptApproved(tx, {
        storeId,
        receiptId: receipt.id,
        approvedBy: input.user.id,
        approvedAt: new Date(),
        legacyOnly: true,
        lineLogIds,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Inbound receipt status changed before approval",
        409,
      );
    }
    throw error;
  }
}

export async function submitInboundReceipt(
  input: InboundReceiptServiceInput,
): Promise<InboundReceiptData> {
  const storeId = requireStoreId(input.user);
  try {
    return await input.repository.runInTransaction((tx) =>
      input.repository.markReceiptSubmitted(tx, {
        storeId,
        receiptId: input.receiptId,
        submittedBy: input.user.id,
        submittedAt: new Date(),
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Inbound receipt status changed before submission",
        409,
      );
    }
    throw error;
  }
}

export async function updateAndSubmitInboundReceipt(
  input: UpdateAndSubmitInboundReceiptInput,
): Promise<InboundReceiptData> {
  const storeId = requireStoreId(input.user);
  if (input.input.lines.length === 0) {
    throw new InventoryManagementError(
      "VALIDATION_ERROR",
      "Inbound receipt requires at least one line",
      422,
    );
  }

  const lines = input.input.lines.map((line) => {
    if (!line.id) {
      throw new InventoryManagementError(
        "VALIDATION_ERROR",
        "Inbound receipt line id is required",
        422,
      );
    }
    if (
      line.expectedQuantity <= 0 ||
      line.receivedQuantity < 0 ||
      !Number.isFinite(line.expectedQuantity) ||
      !Number.isFinite(line.receivedQuantity)
    ) {
      throw new InventoryManagementError(
        "VALIDATION_ERROR",
        "Inbound receipt quantities are invalid",
        422,
      );
    }
    const note = line.note?.trim() || null;
    if (requiresInboundLineNote(line.status) && !note) {
      throw new InventoryManagementError(
        "VALIDATION_ERROR",
        "Inbound receipt line note is required",
        422,
      );
    }

    return {
      id: line.id,
      productId: line.productId,
      expectedQuantity: line.expectedQuantity,
      receivedQuantity: line.receivedQuantity,
      status: line.status,
      note,
    };
  });

  try {
    return await input.repository.runInTransaction(async (tx) => {
      const receipt = await input.repository.findReceiptForEdit(tx, {
        storeId,
        receiptId: input.receiptId,
      });
      if (!receipt) {
        throw new InventoryManagementError(
          "NOT_FOUND",
          "Inbound receipt not found",
          404,
        );
      }
      if (receipt.goodsPurchaseId) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Penerimaan Barang dari Pembelian Barang tidak dapat direvisi melalui alur lama",
          409,
        );
      }
      if (receipt.status !== "DRAFT" && receipt.status !== "NEEDS_REVISION") {
        throw new InventoryManagementError(
          "CONFLICT",
          `Inbound receipt is ${receipt.status}`,
          409,
        );
      }
      if (receipt.submittedBy !== input.user.id) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Only the receipt creator can revise this inbound receipt",
          409,
        );
      }

      await input.repository.updateReceiptDraft(tx, {
        storeId,
        receiptId: input.receiptId,
        note: input.input.note?.trim() || null,
        lines,
      });

      return input.repository.markReceiptSubmitted(tx, {
        storeId,
        receiptId: input.receiptId,
        submittedBy: input.user.id,
        submittedAt: new Date(),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Inbound receipt status changed before submission",
        409,
      );
    }
    throw error;
  }
}

export async function approveInboundReceiptItem(
  input: InboundReceiptItemServiceInput,
): Promise<InboundReceiptMutationResult> {
  const storeId = requireStoreId(input.user);

  try {
    return await input.repository.runInTransaction(async (tx) => {
      const receipt = await input.repository.lockSubmittedReceipt(tx, {
        storeId,
        receiptId: input.receiptId,
      });
      if (!receipt) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Penerimaan Barang sudah tidak menunggu persetujuan",
          409,
        );
      }

      const line = receipt.lines.find((candidate) => candidate.id === input.itemId);
      if (!line) {
        throw new InventoryManagementError(
          "NOT_FOUND",
          "Produk Penerimaan Barang tidak ditemukan",
          404,
        );
      }
      requireCurrentReceiptLine(line, input.expectedUpdatedAt);
      if (!line.goodsPurchaseItem) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Produk Penerimaan Barang tidak terhubung ke Pembelian Barang",
          409,
        );
      }
      if (
        hasInboundQuantityConflict({
          orderedQuantity: line.goodsPurchaseItem.quantity,
          approvedReceivedQuantity:
            line.approvedReceivedExcludingCurrentReceipt,
          currentReceiptQuantity: line.receivedQuantity,
        })
      ) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Jumlah diterima sudah melebihi sisa Pembelian Barang",
          409,
        );
      }

      const now = new Date();
      if (line.reviewStatus !== "APPROVED") {
        await input.repository.approveReceiptLine(tx, {
          storeId,
          receiptId: receipt.id,
          itemId: line.id,
          reviewStatus: "APPROVED",
          approvedById: input.user.id,
          approvedByName: input.user.name ?? null,
          approvedAt: now,
        });
      }

      return finalizeInboundReceiptIfReady({
        repository: input.repository,
        tx,
        receiptId: receipt.id,
        user: input.user,
        now,
      });
    });
  } catch (error) {
    if (error instanceof InboundReceiptFinalizationError) {
      throw new InventoryManagementError(
        error.code,
        error.message,
        error.status,
      );
    }
    if (isPrismaFinalizationConflict(error)) {
      throw new InventoryManagementError(
        "CONFLICT",
        "Penerimaan Barang berubah saat finalisasi",
        409,
      );
    }
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Penerimaan Barang berubah saat produk diproses",
        409,
      );
    }
    throw error;
  }
}

export async function editInboundReceiptItem(
  input: EditInboundReceiptItemInput,
): Promise<InboundReceiptMutationResult> {
  const storeId = requireStoreId(input.user);

  try {
    return await input.repository.runInTransaction(async (tx) => {
      let receipt = await input.repository.lockSubmittedReceipt(tx, {
        storeId,
        receiptId: input.receiptId,
      });
      if (!receipt) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Penerimaan Barang sudah tidak menunggu persetujuan",
          409,
        );
      }
      if (
        !Number.isFinite(input.input.receivedQuantity) ||
        input.input.receivedQuantity < 0
      ) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Jumlah produk yang diterima tidak valid",
          422,
        );
      }
      if (
        input.input.matchStatus !== "MATCHED" &&
        input.input.matchStatus !== "MISMATCHED"
      ) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Status kecocokan produk tidak valid",
          422,
        );
      }

      if (input.input.productId && input.input.productId !== receipt.lines.find(candidate => candidate.id === input.itemId)?.productId && receipt.goodsPurchaseId) {
        if (!receipt.replacementItems?.some(item => item.productId === input.input.productId)) {
          throw new InventoryManagementError("VALIDATION_ERROR", "Produk pengganti harus berasal dari Pembelian Barang yang sama", 422);
        }
        const locked = await input.repository.lockGoodsPurchase(tx, { storeId, goodsPurchaseId: receipt.goodsPurchaseId });
        if (!locked) throw new InventoryManagementError("CONFLICT", "Pembelian Barang sudah tidak tersedia", 409);
        const refreshed = await input.repository.findReceiptForFinalization(tx, { storeId, receiptId: receipt.id });
        if (!refreshed) throw new InventoryManagementError("CONFLICT", "Penerimaan Barang berubah. Muat ulang data terbaru.", 409);
        receipt = refreshed;
      }

      const line = receipt.lines.find((candidate) => candidate.id === input.itemId);
      if (!line) {
        throw new InventoryManagementError(
          "NOT_FOUND",
          "Produk Penerimaan Barang tidak ditemukan",
          404,
        );
      }
      requireCurrentReceiptLine(line, input.expectedUpdatedAt);
      if (!line.goodsPurchaseItem) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Produk Penerimaan Barang tidak terhubung ke Pembelian Barang",
          409,
        );
      }

      const replacement = input.input.productId && input.input.productId !== line.productId
        ? receipt.replacementItems?.find((item) => item.productId === input.input.productId)
        : undefined;
      if (input.input.productId && input.input.productId !== line.productId && !replacement) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Produk pengganti harus berasal dari Pembelian Barang yang sama",
          422,
        );
      }
      if (replacement && receipt.lines.some((candidate) => candidate.id !== line.id && candidate.goodsPurchaseItem?.id === replacement.id)) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Produk pengganti sudah ada pada Penerimaan Barang ini",
          422,
        );
      }

      const targetItem = replacement ?? {
        id: line.goodsPurchaseItem.id,
        productId: line.productId,
        productNameSnapshot: line.product?.name ?? "Produk",
        skuSnapshot: line.product?.sku ?? "",
        unitSnapshot: line.product?.unit ?? null,
        quantity: line.goodsPurchaseItem.quantity,
        latestUnitPrice: line.goodsPurchaseItem.latestUnitPrice,
        pricingUnits: line.pricingUnits,
        unitMultiplierToBase: line.unitMultiplierToBase,
        inboundReceiptLines: [],
      };
      const targetAvailability = replacement
        ? calculateInboundAvailability({
            orderedQuantity: replacement.quantity,
            approvedReceivedQuantity: replacement.inboundReceiptLines
              .filter((candidate) => candidate.receipt.status === "APPROVED")
              .reduce((sum, candidate) => sum + getInboundStockQuantity(candidate), 0),
            pendingReservedQuantity: replacement.inboundReceiptLines
              .filter((candidate) => candidate.receipt.status === "SUBMITTED")
              .reduce((sum, candidate) => sum + getInboundStockQuantity(candidate), 0),
          }).availableQuantity
        : line.expectedQuantity;
      if (replacement && (targetAvailability <= 1e-9 || input.input.receivedQuantity > targetAvailability + 1e-9)) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Jumlah diterima melebihi jumlah yang masih tersedia untuk produk pengganti",
          409,
        );
      }

      const note = input.input.note?.trim() || null;
      requireUnchangedReceiptPricing(line);
      if (replacement && (line.pricingSnapshot || targetItem.pricingUnits.length > 0)) {
        const pricing = input.input.pricing;
        const units = targetItem.pricingUnits.filter((unit) => unit.isActive !== false &&
          !unit.conversionNeedsReview && Number.isFinite(unit.unitMultiplierToBase) && unit.unitMultiplierToBase > 0);
        if (!isCollectionPricing(pricing) || pricing.units.length !== units.length ||
          units.some((unit) => !pricing.units.some((proposal) => proposal.productId === unit.productId))) {
          throw new InventoryManagementError("CONFLICT", "Harga atau satuan produk berubah. Muat ulang dan periksa kembali sebelum menyimpan.", 409);
        }
        requireCurrentSubmissionPricing(pricing, units);
      }
      if (!replacement && line.pricingSnapshot && input.input.pricing !== undefined &&
        (line.pricingSnapshot.version === 2) !== isCollectionPricing(input.input.pricing)) {
        throw new InventoryManagementError("CONFLICT", "Format harga penerimaan berubah. Muat ulang dan periksa kembali.", 409);
      }
      if (
        requiresInboundQuantityNote(
          targetAvailability,
          input.input.receivedQuantity,
        ) &&
        !note
      ) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Catatan produk wajib diisi saat jumlah diterima berbeda",
          422,
        );
      }
      const conflict = hasInboundQuantityConflict({
        orderedQuantity: targetItem.quantity,
        approvedReceivedQuantity: replacement
          ? targetItem.inboundReceiptLines
              .filter((candidate) => candidate.receipt.status === "APPROVED")
              .reduce((sum, candidate) => sum + getInboundStockQuantity(candidate), 0)
          : line.approvedReceivedExcludingCurrentReceipt,
        currentReceiptQuantity: input.input.receivedQuantity,
      });
      let pricingSnapshot: InboundPricingSnapshot | undefined;
      let supplierCostPrice: number | null;
      if (line.pricingSnapshot) {
        try {
          const proposal: InboundPricingPayload | null = input.input.pricing === undefined ? line.pricingSnapshot : input.input.pricing;
          pricingSnapshot = isCollectionPricing(proposal)
            ? createInboundPricingCollectionSnapshot(proposal, targetItem.pricingUnits, input.input.matchStatus === "MATCHED" && input.input.receivedQuantity > 0, targetItem.unitMultiplierToBase)
            : createInboundPricingSnapshot(proposal, targetItem.pricingUnits, input.input.matchStatus === "MATCHED" && input.input.receivedQuantity > 0, targetItem.unitMultiplierToBase);
          supplierCostPrice = inboundCostForOrderedUnit(pricingSnapshot, targetItem.unitMultiplierToBase, targetItem.productId);
        } catch (error) {
          throw new InventoryManagementError("VALIDATION_ERROR", error instanceof Error ? error.message : "Harga produk tidak valid", 422);
        }
      } else {
        supplierCostPrice = receiptCostOrValidationError({
          supplierCostPrice: input.input.supplierCostPrice ?? (replacement ? targetItem.latestUnitPrice : line.supplierCostPrice ?? line.costPriceSnapshot),
          masterCostPrice: line.product?.costPrice == null ? null : Number(line.product.costPrice.toString()),
        });
      }
      if (!line.pricingSnapshot && input.input.receivedQuantity > 0 && supplierCostPrice === null) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Harga modal supplier wajib diisi untuk jumlah yang diterima",
          422,
        );
      }

      if (input.input.matchStatus === "MATCHED" && pricingSnapshot?.version === 1) {
        const singlePricing = pricingSnapshot;
        const otherMatched = receipt.lines.filter((other) => other.id !== line.id && other.matchStatus === "MATCHED" && other.pricingSnapshot?.version === 1);
        const duplicate = singlePricing.productId && otherMatched.some((other) =>
          other.pricingSnapshot?.version === 1 && other.pricingSnapshot.productId === singlePricing.productId,
        );
        const unchangedUnit = line.matchStatus === "MATCHED" && line.pricingSnapshot?.version === 1 && line.pricingSnapshot.productId === singlePricing.productId;
        if (duplicate && !unchangedUnit) {
          throw new InventoryManagementError("VALIDATION_ERROR", "Satuan harga yang sama hanya dapat digunakan sekali dalam satu penerimaan.", 422);
        }
        const focus = inboundPricingReference(singlePricing, targetItem.pricingUnits);
        const previous = !replacement && line.matchStatus === "MATCHED" && line.pricingSnapshot?.version === 1 ? inboundPricingReference(line.pricingSnapshot, line.pricingUnits) : null;
        if (focus) {
          const others = otherMatched.map((other) => other.pricingSnapshot?.version === 1 ? inboundPricingReference(other.pricingSnapshot, other.pricingUnits) : null)
            .filter((reference) => reference?.productId === focus.productId);
          const newConflicts = others.filter((reference) => reference?.costPrice !== focus.costPrice).length;
          const oldConflicts = previous?.productId === focus.productId
            ? others.filter((reference) => reference?.costPrice !== previous.costPrice).length
            : 0;
          const unchangedCost = previous?.productId === focus.productId && previous.costPrice === focus.costPrice;
          if (newConflicts > 0 && (newConflicts > oldConflicts || (newConflicts === oldConflicts && !unchangedCost))) {
            throw new InventoryManagementError("VALIDATION_ERROR", `HPP acuan ${focus.unit} berbeda antar satuan. Periksa HPP pada produk terkait.`, 422);
          }
        }
      }

      await input.repository.updateReceiptLine(tx, {
        storeId,
        receiptId: receipt.id,
        itemId: line.id,
        ...(replacement ? {
          productId: targetItem.productId,
          goodsPurchaseItemId: targetItem.id,
          shoppingRequestItemId: replacement.shoppingRequestItemId ?? null,
          expectedQuantity: targetAvailability,
          productNameSnapshot: targetItem.productNameSnapshot,
          skuSnapshot: targetItem.skuSnapshot,
          unitSnapshot: targetItem.unitSnapshot,
          costPriceSnapshot: targetItem.latestUnitPrice,
        } : {}),
        matchStatus: input.input.matchStatus,
        receivedQuantity: input.input.receivedQuantity,
        note,
        supplierCostPrice,
        ...(pricingSnapshot ? { pricingSnapshot } : {}),
        reviewStatus: "PENDING",
        approvedById: null,
        approvedByName: null,
        approvedAt: null,
      });

      if (pricingSnapshot?.version === 2 && isCollectionPricing(input.input.pricing) &&
        input.input.matchStatus === "MATCHED" && input.input.receivedQuantity > 0) {
        const signature = (snapshot: typeof pricingSnapshot) => JSON.stringify(snapshot.units.map((unit) =>
          [unit.productId, unit.costPrice, unit.price, unit.hargaAgen, unit.hargaDinas, unit.priceEdited]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
        const pricesChanged = line.pricingSnapshot?.version !== 2 || signature(line.pricingSnapshot) !== signature(pricingSnapshot);
        const activating = line.receivedQuantity <= 0 || line.matchStatus !== "MATCHED";
        const conflictingSibling = activating && receipt.lines.some((sibling) => {
          const stockGroupId = replacement ? replacement.stockGroupId : line.stockGroupId;
          const sameGroup = stockGroupId ? sibling.stockGroupId === stockGroupId : sibling.productId === targetItem.productId;
          return sibling.id !== line.id && sameGroup && sibling.receivedQuantity > 0 && sibling.matchStatus === "MATCHED" &&
            sibling.pricingSnapshot?.version === 2 && signature(sibling.pricingSnapshot) !== signature(pricingSnapshot);
        });
        if (pricesChanged || conflictingSibling) {
          for (const sibling of receipt.lines) {
            const stockGroupId = replacement ? replacement.stockGroupId : line.stockGroupId;
            const sameGroup = stockGroupId ? sibling.stockGroupId === stockGroupId : sibling.productId === targetItem.productId;
            if (sibling.id === line.id || !sameGroup || sibling.receivedQuantity <= 0 || sibling.matchStatus !== "MATCHED" || sibling.pricingSnapshot?.version !== 2) continue;
            requireUnchangedReceiptPricing(sibling);
            let siblingPricing;
            try {
              siblingPricing = createInboundPricingCollectionSnapshot(input.input.pricing, sibling.pricingUnits, sibling.matchStatus === "MATCHED" && sibling.receivedQuantity > 0, sibling.unitMultiplierToBase);
            } catch (error) {
              throw new InventoryManagementError("VALIDATION_ERROR", error instanceof Error ? error.message : "Harga produk tidak valid", 422);
            }
            await input.repository.updateReceiptLine(tx, {
              storeId, receiptId: receipt.id, itemId: sibling.id, matchStatus: sibling.matchStatus ?? "MATCHED",
              receivedQuantity: sibling.receivedQuantity, note: sibling.note,
              supplierCostPrice: inboundCostForOrderedUnit(siblingPricing, sibling.unitMultiplierToBase, sibling.productId),
              pricingSnapshot: siblingPricing, reviewStatus: "PENDING", approvedById: null, approvedByName: null, approvedAt: null,
            });
          }
        }
      }

      return {
        data: { id: receipt.id, status: receipt.status },
        finalized: false,
        conflict,
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Penerimaan Barang berubah saat produk diedit",
        409,
      );
    }
    throw error;
  }
}

export async function removeInboundReceiptItem(
  input: InboundReceiptItemServiceInput,
): Promise<InboundReceiptMutationResult> {
  const storeId = requireStoreId(input.user);

  try {
    return await input.repository.runInTransaction(async (tx) => {
      const receipt = await input.repository.lockSubmittedReceipt(tx, {
        storeId,
        receiptId: input.receiptId,
      });
      if (!receipt) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Penerimaan Barang sudah tidak menunggu persetujuan",
          409,
        );
      }
      const line = receipt.lines.find((item) => item.id === input.itemId);
      if (!line) {
        throw new InventoryManagementError(
          "NOT_FOUND",
          "Produk Penerimaan Barang tidak ditemukan",
          404,
        );
      }
      requireCurrentReceiptLine(line, input.expectedUpdatedAt);
      if (receipt.lines.length <= 1) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Penerimaan Barang harus memiliki minimal satu produk",
          422,
        );
      }

      await input.repository.removeReceiptLine(tx, {
        storeId,
        receiptId: receipt.id,
        itemId: input.itemId,
      });

      return {
        data: { id: receipt.id, status: receipt.status },
        finalized: false,
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Penerimaan Barang berubah saat produk dihapus",
        409,
      );
    }
    throw error;
  }
}

export async function rejectInboundReceipt(
  input: RejectInboundReceiptInput,
): Promise<InboundReceiptMutationResult> {
  const storeId = requireStoreId(input.user);
  const rejectionReason = input.rejectionReason.trim();

  try {
    return await input.repository.runInTransaction(async (tx) => {
      const receipt = await input.repository.lockSubmittedReceipt(tx, {
        storeId,
        receiptId: input.receiptId,
      });
      if (!receipt) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Penerimaan Barang sudah tidak menunggu persetujuan",
          409,
        );
      }
      if (!rejectionReason) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Alasan penolakan wajib diisi",
          422,
        );
      }

      const data = await input.repository.markReceiptRejected(tx, {
        storeId,
        receiptId: receipt.id,
        rejectedBy: input.user.id,
        rejectionReason,
      });
      return { data, finalized: false };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Penerimaan Barang berubah saat ditolak",
        409,
      );
    }
    throw error;
  }
}

export async function needsRevisionInboundReceipt(
  input: NeedsRevisionInboundReceiptInput,
): Promise<InboundReceiptData> {
  const storeId = requireStoreId(input.user);
  const revisionReason = input.revisionReason.trim();
  if (!revisionReason) {
    throw new InventoryManagementError(
      "VALIDATION_ERROR",
      "Revision reason is required",
      422,
    );
  }

  try {
    return await input.repository.runInTransaction(async (tx) => {
      const receipt = await input.repository.findReceiptForEdit(tx, {
        storeId,
        receiptId: input.receiptId,
      });
      if (receipt?.goodsPurchaseId) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Penerimaan Barang dari Pembelian Barang tidak mendukung status perlu revisi",
          409,
        );
      }

      return input.repository.markReceiptNeedsRevision(tx, {
        storeId,
        receiptId: input.receiptId,
        revisedBy: input.user.id,
        revisionReason,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Inbound receipt status changed before revision",
        409,
      );
    }
    throw error;
  }
}

export async function createInboundReceipt(
  input: CreateInboundReceiptServiceInput,
): Promise<InboundReceiptData> {
  const storeId = requireStoreId(input.user);
  if (input.input.lines.length === 0) {
    throw new InventoryManagementError(
      "VALIDATION_ERROR",
      "Inbound receipt requires at least one line",
      422,
    );
  }

  const lines: CreateInboundReceiptDraftInput["lines"] = input.input.lines.map(
    (line) => {
      if (
        line.expectedQuantity <= 0 ||
        line.receivedQuantity < 0 ||
        !Number.isFinite(line.expectedQuantity) ||
        !Number.isFinite(line.receivedQuantity)
      ) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Inbound receipt quantities are invalid",
          422,
        );
      }
      const note = line.note?.trim() || null;
      if (requiresInboundLineNote(line.status) && !note) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Inbound receipt line note is required",
          422,
        );
      }

      return {
        productId: line.productId,
        shoppingRequestItemId: line.shoppingRequestItemId ?? null,
        expectedQuantity: line.expectedQuantity,
        receivedQuantity: line.receivedQuantity,
        status: line.status,
        note,
      };
    },
  );

  return input.repository.runInTransaction((tx) =>
    input.repository.createInboundReceiptDraft(tx, {
      storeId,
      createdBy: input.user.id,
      supplierId: input.input.supplierId ?? null,
      shoppingRequestId: input.input.shoppingRequestId ?? null,
      note: input.input.note?.trim() || null,
      lines,
    }),
  );
}

export async function createAndSubmitInboundReceipt(
  input: CreateInboundReceiptServiceInput,
): Promise<InboundReceiptData> {
  const storeId = requireStoreId(input.user);
  if (input.input.lines.length === 0) {
    throw new InventoryManagementError(
      "VALIDATION_ERROR",
      "Inbound receipt requires at least one line",
      422,
    );
  }

  const lines: CreateInboundReceiptDraftInput["lines"] = input.input.lines.map(
    (line) => {
      if (
        line.expectedQuantity <= 0 ||
        line.receivedQuantity < 0 ||
        !Number.isFinite(line.expectedQuantity) ||
        !Number.isFinite(line.receivedQuantity)
      ) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Inbound receipt quantities are invalid",
          422,
        );
      }
      const note = line.note?.trim() || null;
      if (requiresInboundLineNote(line.status) && !note) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Inbound receipt line note is required",
          422,
        );
      }

      return {
        productId: line.productId,
        shoppingRequestItemId: line.shoppingRequestItemId ?? null,
        expectedQuantity: line.expectedQuantity,
        receivedQuantity: line.receivedQuantity,
        status: line.status,
        note,
      };
    },
  );

  try {
    return await input.repository.runInTransaction(async (tx) => {
      const draft = await input.repository.createInboundReceiptDraft(tx, {
        storeId,
        createdBy: input.user.id,
        supplierId: input.input.supplierId ?? null,
        shoppingRequestId: input.input.shoppingRequestId ?? null,
        note: input.input.note?.trim() || null,
        lines,
      });

      return input.repository.markReceiptSubmitted(tx, {
        storeId,
        receiptId: draft.id,
        submittedBy: input.user.id,
        submittedAt: new Date(),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Inbound receipt status changed before submission",
        409,
      );
    }
    throw error;
  }
}

export async function createAndSubmitGoodsPurchaseReceipt(
  input: CreateGoodsPurchaseReceiptServiceInput,
): Promise<InboundReceiptData> {
  const storeId = requireStoreId(input.user);

  return input.repository.runInTransaction(async (tx) => {
    const locked = await input.repository.lockGoodsPurchase(tx, {
      storeId,
      goodsPurchaseId: input.input.goodsPurchaseId,
    });
    if (!locked) {
      throw new InventoryManagementError(
        "NOT_FOUND",
        "Pembelian Barang tidak ditemukan",
        404,
      );
    }

    const purchase = await input.repository.findGoodsPurchaseForReceipt(tx, {
      storeId,
      goodsPurchaseId: input.input.goodsPurchaseId,
    });
    if (!purchase) {
      throw new InventoryManagementError(
        "NOT_FOUND",
        "Pembelian Barang yang disetujui tidak ditemukan",
        404,
      );
    }

    const legacyPayment = {
      method: input.input.paymentMethod ?? purchase.paymentMethod ?? "TRANSFER",
      dueDate: input.input.paymentDueDate ?? purchase.paymentDueDate?.toISOString().slice(0, 10) ?? null,
    } as const;
    const purchaseTotalAmount = purchase.totalAmount ?? purchase.items.reduce(
      (sum, item) => sum + item.latestUnitPrice * item.quantity,
      0,
    );
    let payments: Array<{ method: "TRANSFER" | "GIRO"; amount: number; dueDate: Date | null; note: string | null }>;
    try {
      const established = purchase.payments?.length || purchase.paymentMethod
        ? normalizeInboundPayments({ totalAmount: purchaseTotalAmount, payments: purchase.payments,
            legacy: purchase.paymentMethod ? { method: purchase.paymentMethod, dueDate: purchase.paymentDueDate?.toISOString().slice(0, 10) ?? null } : null }).payments
        : null;
      const normalized = input.input.payments !== undefined
        ? validateInboundPayments(purchaseTotalAmount, input.input.payments)
        : normalizeInboundPayments({
            totalAmount: purchaseTotalAmount,
            payments: input.input.paymentMethod || input.input.paymentDueDate !== undefined ? [] : established,
            legacy: legacyPayment,
          });
      if (established && !sameInboundPayments(established, normalized.payments)) {
        throw new InventoryManagementError("CONFLICT", "Pembayaran pembelian telah berubah. Muat ulang jadwal terbaru.", 409);
      }
      payments = normalized.payments.map((payment) => ({
        ...payment,
        dueDate: payment.dueDate ? new Date(`${payment.dueDate}T00:00:00.000Z`) : null,
        note: payment.note ?? null,
      }));
    } catch (error) {
      if (error instanceof InventoryManagementError) throw error;
      throw new InventoryManagementError("VALIDATION_ERROR", error instanceof Error ? error.message : "Pembayaran tidak valid", 422);
    }

    const availableItems = purchase.items.flatMap((item) => {
      const approvedReceivedQuantity = item.inboundReceiptLines
        .filter((line) => line.receipt.status === "APPROVED")
        .reduce(
          (sum, line) =>
            sum +
            getInboundStockQuantity({
              status: line.status,
              receivedQuantity: line.receivedQuantity,
            }),
          0,
        );
      const pendingReservedQuantity = item.inboundReceiptLines
        .filter((line) => line.receipt.status === "SUBMITTED")
        .reduce(
          (sum, line) =>
            sum +
            getInboundStockQuantity({
              status: line.status,
              receivedQuantity: line.receivedQuantity,
            }),
          0,
        );
      const availability = calculateInboundAvailability({
        orderedQuantity: item.quantity,
        approvedReceivedQuantity,
        pendingReservedQuantity,
      });

      return availability.availableQuantity > 1e-9
        ? [{ item, availableQuantity: availability.availableQuantity }]
        : [];
    });

    const submittedIds = input.input.lines.map(
      (line) => line.goodsPurchaseItemId,
    );
    const submittedIdSet = new Set(submittedIds);
    const availableIdSet = new Set(
      availableItems.map(({ item }) => item.id),
    );
    if (
      submittedIds.length !== availableItems.length ||
      submittedIdSet.size !== submittedIds.length ||
      submittedIds.some((itemId) => !availableIdSet.has(itemId))
    ) {
      throw new InventoryManagementError(
        "VALIDATION_ERROR",
        "Semua produk yang masih tersedia wajib diisi",
        422,
      );
    }

    const inputByItemId = new Map(
      input.input.lines.map((line) => [line.goodsPurchaseItemId, line]),
    );
    const lines = availableItems.map(({ item, availableQuantity }) => {
      const line = inputByItemId.get(item.id);
      if (!line) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Semua produk yang masih tersedia wajib diisi",
          422,
        );
      }
      if (line.matchStatus !== "MATCHED" && line.matchStatus !== "MISMATCHED") {
        throw new InventoryManagementError("VALIDATION_ERROR", "Status kesesuaian produk tidak valid", 422);
      }
      if (
        !Number.isFinite(line.receivedQuantity) ||
        line.receivedQuantity < 0
      ) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Jumlah produk yang diterima tidak valid",
          422,
        );
      }
      if (line.receivedQuantity > availableQuantity + 1e-9) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Jumlah diterima melebihi jumlah yang masih tersedia",
          409,
        );
      }

      let pricingSnapshot: InboundPricingSnapshot;
      let supplierCostPrice: number | null;
      try {
        if (!item.pricingUnits || item.unitMultiplierToBase === undefined) {
          throw new Error("Data satuan produk belum tersedia. Muat ulang dan coba lagi.");
        }
        if (isCollectionPricing(line.pricing)) requireCurrentSubmissionPricing(line.pricing, item.pricingUnits);
        if (isCollectionPricing(line.pricing) && line.receivedQuantity > 0 &&
          !item.pricingUnits.some((unit) => unit.productId === item.productId && unit.isActive !== false &&
            !unit.conversionNeedsReview && Number.isFinite(unit.unitMultiplierToBase) && unit.unitMultiplierToBase > 0)) {
          throw new Error("Satuan pesanan tidak aktif atau konversinya perlu ditinjau.");
        }
        pricingSnapshot = isCollectionPricing(line.pricing)
          ? createInboundPricingCollectionSnapshot(line.pricing, item.pricingUnits, line.matchStatus === "MATCHED" && line.receivedQuantity > 0, item.unitMultiplierToBase)
          : createInboundPricingSnapshot(line.pricing, item.pricingUnits, line.matchStatus === "MATCHED" && line.receivedQuantity > 0, item.unitMultiplierToBase);
        supplierCostPrice = inboundCostForOrderedUnit(pricingSnapshot, item.unitMultiplierToBase, item.productId);
      } catch (error) {
        if (error instanceof InventoryManagementError) throw error;
        throw new InventoryManagementError("VALIDATION_ERROR", error instanceof Error ? error.message : "Harga produk tidak valid", 422);
      }

      const note = line.note?.trim() || null;
      if (
        requiresInboundQuantityNote(
          availableQuantity,
          line.receivedQuantity,
        ) &&
        !note
      ) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Catatan produk wajib diisi saat jumlah diterima berbeda",
          422,
        );
      }

      return {
        goodsPurchaseItemId: item.id,
        shoppingRequestItemId: item.shoppingRequestItemId,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        skuSnapshot: item.skuSnapshot,
        unitSnapshot: item.unitSnapshot,
        costPriceSnapshot: item.latestUnitPrice,
        supplierCostPrice,
        pricingSnapshot,
        supplierNameSnapshot: purchase.supplierNameSnapshot,
        invoiceNumberSnapshot: purchase.number,
        expectedQuantity: availableQuantity,
        receivedQuantity: line.receivedQuantity,
        status: "RECEIVED" as const,
        matchStatus: line.matchStatus,
        reviewStatus: "PENDING" as const,
        note,
      };
    });

    const priceUnits = new Map<string, string>();
    for (const line of lines) {
      if (line.receivedQuantity <= 0 || line.matchStatus !== "MATCHED") continue;
      const prices = line.pricingSnapshot.version === 2 ? line.pricingSnapshot.units : [line.pricingSnapshot];
      for (const price of prices) {
        if (!price.productId) continue;
        const value = JSON.stringify([price.costPrice, price.price, price.hargaAgen, price.hargaDinas]);
        if (priceUnits.has(price.productId) && priceUnits.get(price.productId) !== value) {
          throw new InventoryManagementError("VALIDATION_ERROR", "Harga satuan yang sama berbeda pada penerimaan ini.", 422);
        }
        priceUnits.set(price.productId, value);
      }
    }

    const summary = inboundPaymentSummary(payments.map(row => ({ ...row, dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null })));
    return input.repository.createSubmittedGoodsPurchaseReceipt(tx, {
      storeId,
      goodsPurchaseId: purchase.id,
      shoppingRequestId: purchase.shoppingRequestId,
      supplierId: purchase.supplierId,
      paymentMethod: summary.paymentMethod,
      paymentDueDate: summary.paymentDueDate ? new Date(`${summary.paymentDueDate}T00:00:00Z`) : null,
      payments,
      submittedBy: input.user.id,
      submittedAt: new Date(),
      note: input.input.note?.trim() || null,
      lines,
    });
  });
}

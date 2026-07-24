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
  ReceivingQueueResult,
} from "../types/inventory-management";
import {
  finalizeInboundReceiptIfReady,
  InboundReceiptFinalizationError,
} from "./inbound-receipt-finalizer";

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
}

interface EditInboundReceiptItemInput extends InboundReceiptItemServiceInput {
  input: {
    matchStatus: InboundReceiptMatchStatus;
    receivedQuantity: number;
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
  items: Array<{
    id: string;
    shoppingRequestItemId: string | null;
    productId: string;
    productNameSnapshot: string;
    skuSnapshot: string;
    unitSnapshot: string | null;
    latestUnitPrice: number;
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
    note?: string | null;
    lines: Array<{
      goodsPurchaseItemId: string;
      matchStatus: InboundReceiptMatchStatus;
      receivedQuantity: number;
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
          supplierId: row.supplierId,
          supplierName: row.supplierName,
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

      const line = receipt.lines.find((candidate) => candidate.id === input.itemId);
      if (!line) {
        throw new InventoryManagementError(
          "NOT_FOUND",
          "Produk Penerimaan Barang tidak ditemukan",
          404,
        );
      }
      if (!line.goodsPurchaseItem) {
        throw new InventoryManagementError(
          "CONFLICT",
          "Produk Penerimaan Barang tidak terhubung ke Pembelian Barang",
          409,
        );
      }

      const note = input.input.note?.trim() || null;
      if (
        requiresInboundQuantityNote(
          line.expectedQuantity,
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
        orderedQuantity: line.goodsPurchaseItem.quantity,
        approvedReceivedQuantity:
          line.approvedReceivedExcludingCurrentReceipt,
        currentReceiptQuantity: input.input.receivedQuantity,
      });

      await input.repository.updateReceiptLine(tx, {
        storeId,
        receiptId: receipt.id,
        itemId: line.id,
        matchStatus: input.input.matchStatus,
        receivedQuantity: input.input.receivedQuantity,
        note,
        reviewStatus: "PENDING",
        approvedById: null,
        approvedByName: null,
        approvedAt: null,
      });

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
      if (!receipt.lines.some((line) => line.id === input.itemId)) {
        throw new InventoryManagementError(
          "NOT_FOUND",
          "Produk Penerimaan Barang tidak ditemukan",
          404,
        );
      }
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

    return input.repository.createSubmittedGoodsPurchaseReceipt(tx, {
      storeId,
      goodsPurchaseId: purchase.id,
      shoppingRequestId: purchase.shoppingRequestId,
      supplierId: purchase.supplierId,
      submittedBy: input.user.id,
      submittedAt: new Date(),
      note: input.input.note?.trim() || null,
      lines,
    });
  });
}

import { db, Prisma } from "@pos/db";
import { applyProductStockDelta } from "@/features/product-stock-groups/stock-mutations";
import type {
  InternalStockOutRepository as InternalStockOutRepositoryContract,
  InternalStockOutRequestMutationResult,
} from "../types/inventory-management";

type Tx = Prisma.TransactionClient;

export class InternalStockOutRepository implements InternalStockOutRepositoryContract {
  runInTransaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> {
    return db.$transaction((tx) => callback(tx));
  }

  async createRequest(input: {
    storeId: string;
    productId: string;
    quantity: number;
    reason: string;
    requestedBy: string;
    requestedByName: string;
    requestedByRole: string;
  }): Promise<InternalStockOutRequestMutationResult> {
    const request = await db.internalStockOutRequest.create({
      data: {
        storeId: input.storeId,
        productId: input.productId,
        quantity: input.quantity,
        reason: input.reason,
        requestedBy: input.requestedBy,
        requestedByName: input.requestedByName,
        requestedByRole: input.requestedByRole as any,
        status: "PENDING",
      },
      select: { id: true, status: true },
    });

    return {
      id: request.id,
      status: request.status,
    };
  }

  async approveRequest(
    tx: Tx,
    input: {
      storeId: string;
      requestId: string;
      approvedBy: string;
      approvedByName: string;
    },
  ): Promise<InternalStockOutRequestMutationResult> {
    const request = await tx.internalStockOutRequest.findFirst({
      where: {
        id: input.requestId,
        storeId: input.storeId,
        status: "PENDING",
      },
      select: {
        id: true,
        productId: true,
        quantity: true,
        reason: true,
        requestedByName: true,
      },
    });

    if (!request) {
      throw new Error("INTERNAL_STOCK_OUT_REQUEST_NOT_FOUND");
    }

    const updated = await tx.internalStockOutRequest.updateMany({
      where: {
        id: input.requestId,
        storeId: input.storeId,
        status: "PENDING",
      },
      data: {
        status: "APPROVED",
        approvedBy: input.approvedBy,
        approvedByName: input.approvedByName,
        approvedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new Error("INTERNAL_STOCK_OUT_REQUEST_CONFLICT");
    }

    const inventoryLog = await tx.inventoryLog.create({
      data: {
        productId: request.productId,
        type: "OUT",
        quantity: request.quantity,
        reason: "USAGE",
        note: request.reason,
        createdBy: input.approvedBy,
        person: request.requestedByName,
        status: "APPROVED",
        approvedBy: input.approvedBy,
        approverName: input.approvedByName,
        decidedAt: new Date(),
      },
      select: { id: true },
    });

    await tx.internalStockOutRequest.update({
      where: { id: input.requestId },
      data: { inventoryLogId: inventoryLog.id },
    });

    await applyProductStockDelta(tx, {
      storeId: input.storeId,
      productId: request.productId,
      delta: -request.quantity,
    });

    return { id: input.requestId, status: "APPROVED" };
  }

  async rejectRequest(input: {
    storeId: string;
    requestId: string;
    rejectedBy: string;
    rejectedByName: string;
    rejectionReason: string;
  }): Promise<InternalStockOutRequestMutationResult> {
    const updated = await db.internalStockOutRequest.updateMany({
      where: {
        id: input.requestId,
        storeId: input.storeId,
        status: "PENDING",
      },
      data: {
        status: "REJECTED",
        rejectedBy: input.rejectedBy,
        rejectedByName: input.rejectedByName,
        rejectedAt: new Date(),
        rejectionReason: input.rejectionReason,
      },
    });

    if (updated.count !== 1) {
      throw new Error("INTERNAL_STOCK_OUT_REQUEST_NOT_FOUND");
    }

    return { id: input.requestId, status: "REJECTED" };
  }

  async listRequests(
    storeId: string,
    status?: "PENDING" | "APPROVED" | "REJECTED",
  ): Promise<any[]> {
    return db.internalStockOutRequest.findMany({
      where: {
        storeId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        productId: true,
        quantity: true,
        reason: true,
        status: true,
        requestedByName: true,
        requestedByRole: true,
        createdAt: true,
        product: {
          select: {
            name: true,
          },
        },
      },
    }).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        productId: row.productId,
        productName: row.product.name,
        quantity: row.quantity,
        reason: row.reason,
        status: row.status,
        requestedByName: row.requestedByName,
        requestedByRole: row.requestedByRole,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  }
}

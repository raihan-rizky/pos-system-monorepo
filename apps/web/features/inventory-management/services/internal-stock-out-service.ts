import type {
  InternalStockOutRepository,
  InventoryManagementUser,
} from "../types/inventory-management";

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

function requireStoreId(user: InventoryManagementUser): string {
  if (!user.storeId) {
    throw new InventoryManagementError(
      "STORE_REQUIRED",
      "Store is required for this operation",
      403,
    );
  }
  return user.storeId;
}

export interface CreateInternalStockOutRequestInput {
  repository: InternalStockOutRepository;
  user: InventoryManagementUser & { name?: string | null };
  input: {
    productId: string;
    quantity: number;
    reason: string;
  };
}

export interface ApproveInternalStockOutRequestInput {
  repository: InternalStockOutRepository;
  user: InventoryManagementUser & { name?: string | null };
  requestId: string;
}

export interface RejectInternalStockOutRequestInput {
  repository: InternalStockOutRepository;
  user: InventoryManagementUser & { name?: string | null };
  requestId: string;
  rejectionReason: string;
}

export async function createInternalStockOutRequest(
  input: CreateInternalStockOutRequestInput,
) {
  const storeId = requireStoreId(input.user);
  const reason = input.input.reason.trim();

  if (!reason) {
    throw new InventoryManagementError(
      "VALIDATION_ERROR",
      "Reason is required",
      422,
    );
  }

  if (input.input.quantity <= 0) {
    throw new InventoryManagementError(
      "VALIDATION_ERROR",
      "Quantity must be positive",
      422,
    );
  }

  return await input.repository.createRequest({
    storeId,
    productId: input.input.productId,
    quantity: input.input.quantity,
    reason,
    requestedBy: input.user.id,
    requestedByName: input.user.name || input.user.id,
    requestedByRole: input.user.role,
  });
}

export async function approveInternalStockOutRequest(
  input: ApproveInternalStockOutRequestInput,
) {
  const storeId = requireStoreId(input.user);

  return await input.repository.runInTransaction((tx) =>
    input.repository.approveRequest(tx, {
      storeId,
      requestId: input.requestId,
      approvedBy: input.user.id,
      approvedByName: input.user.name || input.user.id,
    }),
  );
}

export async function rejectInternalStockOutRequest(
  input: RejectInternalStockOutRequestInput,
) {
  const storeId = requireStoreId(input.user);
  const rejectionReason = input.rejectionReason.trim();

  if (!rejectionReason) {
    throw new InventoryManagementError(
      "VALIDATION_ERROR",
      "Rejection reason is required",
      422,
    );
  }

  return await input.repository.rejectRequest({
    storeId,
    requestId: input.requestId,
    rejectedBy: input.user.id,
    rejectedByName: input.user.name || input.user.id,
    rejectionReason,
  });
}

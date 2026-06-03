type InventoryDecisionStatus = "PENDING" | "APPROVED" | "REJECTED";
type BatchDecisionStatus = "PENDING" | "COMMITTED";

export type BulkApprovalItemStatus = {
  status: InventoryDecisionStatus;
};

export type BulkApprovalBundleSummary = {
  status: BatchDecisionStatus;
  totalCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
};

export function summarizeBulkApprovalBundle(
  items: BulkApprovalItemStatus[],
): BulkApprovalBundleSummary {
  const pendingCount = items.filter((item) => item.status === "PENDING").length;
  const approvedCount = items.filter((item) => item.status === "APPROVED").length;
  const rejectedCount = items.filter((item) => item.status === "REJECTED").length;

  return {
    status: pendingCount > 0 ? "PENDING" : "COMMITTED",
    totalCount: items.length,
    pendingCount,
    approvedCount,
    rejectedCount,
  };
}

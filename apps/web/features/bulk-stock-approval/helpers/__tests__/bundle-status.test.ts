import { describe, expect, it } from "vitest";

import { summarizeBulkApprovalBundle } from "../bundle-status";

describe("summarizeBulkApprovalBundle", () => {
  it("keeps a bundle pending while at least one item is pending", () => {
    const summary = summarizeBulkApprovalBundle([
      { status: "APPROVED" },
      { status: "PENDING" },
      { status: "REJECTED" },
    ]);

    expect(summary.status).toBe("PENDING");
    expect(summary.pendingCount).toBe(1);
    expect(summary.approvedCount).toBe(1);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.totalCount).toBe(3);
  });

  it("marks a bundle committed after every item has been decided", () => {
    const summary = summarizeBulkApprovalBundle([
      { status: "APPROVED" },
      { status: "REJECTED" },
    ]);

    expect(summary.status).toBe("COMMITTED");
    expect(summary.pendingCount).toBe(0);
  });
});

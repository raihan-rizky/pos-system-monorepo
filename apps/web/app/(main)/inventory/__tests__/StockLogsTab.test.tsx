import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import StockLogsTab from "../StockLogsTab";

vi.mock("@/hooks/useInventoryLogs", () => ({
  useInventoryLogs: () => ({
    data: {
      data: [],
      pagination: { total: 0, pendingTotal: 0, page: 1, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  }),
  useApproveInventoryLog: () => ({ isPending: false }),
  useRejectInventoryLog: () => ({ isPending: false }),
  useCancelInventoryLog: () => ({ isPending: false }),
}));

vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({
    role: "INVENTORY",
    userId: "user-1",
    canPerform: () => true,
  }),
}));

vi.mock("@/features/internal-use-recap/hooks/useInternalUseRecap", () => ({
  useInternalUseRecap: () => ({
    data: {
      data: {
        range: { label: "1 Jun - 7 Jun" },
        summary: { entryCount: 0, productCount: 0, totalQuantity: 0, totalValue: 0 },
        products: [],
      },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useProducts", () => ({
  useProducts: () => ({
    data: [],
    isFetching: false,
  }),
}));

describe("StockLogsTab", () => {
  it("uses responsive root container and wraps the content safely", () => {
    const html = renderToStaticMarkup(<StockLogsTab />);
    // Expect the root div to contain "w-full min-w-0" to prevent horizontal stretching
    expect(html).toContain('class="flex w-full min-w-0 flex-col gap-5"');
  });
});

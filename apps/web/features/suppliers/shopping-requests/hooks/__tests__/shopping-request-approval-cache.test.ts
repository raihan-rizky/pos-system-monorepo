import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import * as shoppingRequestHooks from "../useShoppingRequests";

describe("shopping request approval cache", () => {
  it("publishes the authoritative approval response to detail and list views", () => {
    const syncApproval = (
      shoppingRequestHooks as Record<string, unknown>
    ).syncShoppingRequestApprovalCaches as
      | ((queryClient: QueryClient, detail: Record<string, unknown>) => void)
      | undefined;

    expect(syncApproval).toBeTypeOf("function");
    if (!syncApproval) return;

    const queryClient = new QueryClient();
    queryClient.setQueryData(["shopping-requests", "request-1"], {
      data: {
        id: "request-1",
        status: "REQUESTED",
        decidedItemCount: 0,
        pendingItemCount: 1,
        items: [{ id: "item-1", decisionStatus: "PENDING" }],
      },
    });
    queryClient.setQueryData(
      ["shopping-requests", { page: 1, limit: 10 }],
      {
        data: [
          {
            id: "request-1",
            status: "REQUESTED",
            decidedItemCount: 0,
            pendingItemCount: 1,
          },
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
      },
    );

    const approvedDetail = {
      id: "request-1",
      status: "APPROVED",
      decidedItemCount: 1,
      pendingItemCount: 0,
      items: [{ id: "item-1", decisionStatus: "APPROVED" }],
    };

    syncApproval(queryClient, approvedDetail);

    expect(
      queryClient.getQueryData(["shopping-requests", "request-1"]),
    ).toEqual({ data: approvedDetail });
    expect(
      queryClient.getQueryData([
        "shopping-requests",
        { page: 1, limit: 10 },
      ]),
    ).toEqual({
      data: [
        expect.objectContaining({
          id: "request-1",
          status: "APPROVED",
          decidedItemCount: 1,
          pendingItemCount: 0,
        }),
      ],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { useDatabaseResetExecute } from "@/hooks/useDatabaseReset";

const mocks = vi.hoisted(() => ({ client: null as unknown, useMutation: vi.fn() }));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useMutation: mocks.useMutation,
  useQueryClient: () => mocks.client,
}));

describe("database reset cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invalidates cached price history and other sub-data after a successful reset", async () => {
    const client = new QueryClient();
    mocks.client = client;
    client.setQueryData(["product-price-logs", { page: 1 }], [{ id: "old-log" }]);
    client.setQueryData(["brands"], [{ id: "old-brand" }]);
    useDatabaseResetExecute();
    await mocks.useMutation.mock.calls[0][0].onSuccess();
    expect(client.getQueryState(["product-price-logs", { page: 1 }])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["brands"])?.isInvalidated).toBe(true);
    client.clear();
  });
});

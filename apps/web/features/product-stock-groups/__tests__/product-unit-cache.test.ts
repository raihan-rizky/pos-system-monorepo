import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { useCreateProduct } from "@/hooks/useProducts";

const mocks = vi.hoisted(() => ({ client: null as QueryClient | null, onSuccess: null as (() => void) | null }));
vi.mock("@tanstack/react-query", async (original) => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQueryClient: () => mocks.client,
  useMutation: (options: { onSuccess: () => void }) => { mocks.onSuccess = options.onSuccess; return {}; },
}));

describe("product creation refreshes shared-stock views", () => {
  it("invalidates product counts, inventory, and group detail as well as the product list", () => {
    mocks.client = new QueryClient();
    const keys = [["products", ""], ["product-stats", ""], ["stock-group", "detail", "group-1"], ["inventory-management", "summary"], ["product-price-logs"], ["dashboard"]];
    keys.forEach((key) => mocks.client!.setQueryData(key, { value: 1 }));
    mocks.client.setQueryData(["suppliers"], { value: 1 });
    useCreateProduct();
    mocks.onSuccess!();
    keys.forEach((key) => expect(mocks.client!.getQueryState(key)?.isInvalidated, key.join("/")).toBe(true));
    expect(mocks.client.getQueryState(["suppliers"])?.isInvalidated).toBe(false);
    mocks.client.clear();
  });
});

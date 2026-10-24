import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { useCreateProduct, useUpdateProduct, useDeleteProduct, useBulkDeleteProducts } from "@/hooks/useProducts";
import { useUndoBatchOperation } from "@/features/batch-operations/hooks/useUndoBatchOperation";
import { useProductImportCommit } from "@/features/product-import/hooks/useProductImport";

const mocks = vi.hoisted(() => ({ client: null as QueryClient | null, onSuccess: null as (() => void) | null }));
vi.mock("@tanstack/react-query", async (original) => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQueryClient: () => mocks.client,
  useMutation: (options: { onSuccess: () => void }) => { mocks.onSuccess = options.onSuccess; return {}; },
}));

describe("product creation refreshes shared-stock views", () => {
  it.each([useUpdateProduct, useDeleteProduct, useBulkDeleteProducts, useUndoBatchOperation, useProductImportCommit])("refreshes every affected catalog, group and pricing history after %s", (hook) => {
    mocks.client = new QueryClient();
    const keys = [["products", "pos"], ["products", "inventory"], ["product-stats"], ["stock-group", "detail", "old"], ["stock-group", "history", "new"], ["inventory-management"], ["product-price-logs", "sibling"]];
    keys.forEach(key => mocks.client!.setQueryData(key, {}));
    hook(); mocks.onSuccess!();
    keys.forEach(key => expect(mocks.client!.getQueryState(key)?.isInvalidated, key.join("/")).toBe(true));
    mocks.client.clear();
  });
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

import { beforeEach, expect, it, vi } from "vitest";
const invalidate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: invalidate }),
}));
vi.mock("../../api/shopping-request-deletion-api", () => ({
  getShoppingRequestDeletionPreview: vi.fn(), deleteShoppingRequest: vi.fn(),
}));
import * as hooks from "../useShoppingRequestDeletion";

beforeEach(() => invalidate.mockClear());
it("hanya memuat pratinjau saat daftar dipilih", () => {
  const hook = (hooks as any).useShoppingRequestDeletionPreview;
  expect(hook).toBeTypeOf("function");
  expect(hook(null)).toMatchObject({ enabled: false });
  expect(hook("sr-1")).toMatchObject({ enabled: true, queryKey: ["shopping-requests", "deletion-preview", "sr-1"] });
});
it("memperbarui cache daftar, pembelian dan stok setelah berhasil", () => {
  const hook = (hooks as any).useDeleteShoppingRequest;
  expect(hook).toBeTypeOf("function");
  hook().onSuccess();
  for (const key of ["shopping-requests", "goods-purchases", "inventory-management", "inventory-logs", "inventory-bulk", "products", "product-stats", "stock-group"]) {
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
  }
});

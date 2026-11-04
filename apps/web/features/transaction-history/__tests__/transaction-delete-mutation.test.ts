import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(), useSuspenseQuery: vi.fn(),
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useDeleteTransaction as createDeleteMutationOptions } from "@/hooks/useTransactions";

function mutation() {
  return createDeleteMutationOptions() as unknown as { mutationFn: (id: string) => Promise<unknown> };
}

describe("transaction delete mutation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns an empty warning list for an empty 204 response", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await expect(mutation().mutationFn("tx-1")).resolves.toEqual({ warnings: [] });
    expect(fetch).toHaveBeenCalledWith("/api/transactions/tx-1", { method: "DELETE" });
  });

  it("preserves review warnings from successful quotation deletion", async () => {
    const warnings = [{ code: "STOCK_HISTORY_REVIEW_REQUIRED", message: "Riwayat stok perlu diperiksa." }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ warnings })));
    await expect(mutation().mutationFn("quote-1")).resolves.toEqual({ warnings });
  });

  it("still rejects permission failures with their API message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Anda tidak memiliki izin menghapus transaksi." }, { status: 403 })));
    await expect(mutation().mutationFn("tx-1")).rejects.toThrow("Anda tidak memiliki izin menghapus transaksi.");
  });
});

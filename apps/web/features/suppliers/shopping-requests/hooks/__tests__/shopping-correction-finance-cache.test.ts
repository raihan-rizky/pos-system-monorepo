import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ client: null as QueryClient | null }));
vi.mock("@tanstack/react-query", async (loadOriginal) => ({
  ...await loadOriginal<typeof import("@tanstack/react-query")>(),
  useQueryClient: () => state.client,
  useMutation: (options: unknown) => options,
}));
vi.mock("../../api/shopping-request-correction-api", () => ({
  getCorrectionEditor: vi.fn(), getCorrectionHistory: vi.fn(), previewCorrection: vi.fn(), saveCorrection: vi.fn(),
}));
import { useSaveCorrection } from "../useShoppingRequestCorrection";

describe("cache setelah koreksi daftar belanja", () => {
  it("menandai ringkasan dan riwayat keuangan lama agar dimuat ulang", async () => {
    const client = new QueryClient();
    state.client = client;
    const summary = ["finance", "cash-flow-summary", "user", "store", "role", "2026-11"];
    const history = ["finance", "expense-list", "user", "store", "role", "2026-11", 1, "all"];
    client.setQueryData(summary, { total: 100 });
    client.setQueryData(history, { data: ["old"] });
    const mutation = useSaveCorrection("request-1") as unknown as { onSuccess: () => Promise<void> };
    await mutation.onSuccess();
    expect(client.getQueryState(summary)?.isInvalidated).toBe(true);
    expect(client.getQueryState(history)?.isInvalidated).toBe(true);
  });
});

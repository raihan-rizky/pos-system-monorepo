import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUpdateTransaction } from "@/hooks/useTransactions";

describe("cache rincian transaksi setelah catatan disimpan", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("langsung memperbarui catatan rincian dan meminta data terbaru untuk cetak ulang", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    client.setQueryData(["transaction", "tx-1"], { id: "tx-1", note: "Lama", payments: [{ method: "CASH" }] });
    client.setQueryData(["transaction", "tx-2"], { id: "tx-2", note: "Lain" });
    const historyKey = ["transaction-history", { page: 1 }];
    client.setQueryData(historyKey, {
      data: [{ id: "tx-1", note: "Lama", total: 100 }, { id: "tx-2", note: "Lain", total: 200 }],
      pagination: { total: 2 },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "tx-1", note: "Baru" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    })));

    let mutation: ReturnType<typeof useUpdateTransaction> | undefined;
    function Harness() {
      mutation = useUpdateTransaction();
      return null;
    }
    renderToStaticMarkup(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    await mutation!.mutateAsync({ id: "tx-1", note: "Baru", expectedNote: "Lama" });

    expect(client.getQueryData(["transaction", "tx-1"])).toEqual({
      id: "tx-1", note: "Baru", payments: [{ method: "CASH" }],
    });
    expect(client.getQueryState(["transaction", "tx-1"])?.isInvalidated).toBe(true);
    expect(client.getQueryData(historyKey)).toEqual({
      data: [{ id: "tx-1", note: "Baru", total: 100 }, { id: "tx-2", note: "Lain", total: 200 }],
      pagination: { total: 2 },
    });
    expect(client.getQueryState(historyKey)?.isInvalidated).toBe(true);
    expect(client.getQueryData(["transaction", "tx-2"])).toEqual({ id: "tx-2", note: "Lain" });
    expect(client.getQueryState(["transaction", "tx-2"])?.isInvalidated).toBe(false);
  });

  it("meminta data terbaru setelah penyimpanan catatan ditolak karena konflik", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const historyKey = ["transaction-history", { page: 1 }];
    client.setQueryData(historyKey, { data: [{ id: "tx-1", note: "Lama" }], pagination: { total: 1 } });
    client.setQueryData(["transaction", "tx-1"], { id: "tx-1", note: "Lama" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Catatan sudah berubah" }), {
      status: 409, headers: { "Content-Type": "application/json" },
    })));

    let mutation: ReturnType<typeof useUpdateTransaction> | undefined;
    function Harness() {
      mutation = useUpdateTransaction();
      return null;
    }
    renderToStaticMarkup(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);

    await expect(mutation!.mutateAsync({ id: "tx-1", note: "Baru", expectedNote: "Lama" })).rejects.toThrow();
    expect(client.getQueryState(historyKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(["transaction", "tx-1"])?.isInvalidated).toBe(true);
    expect(client.getQueryData(["transaction", "tx-1"])).toEqual({ id: "tx-1", note: "Lama" });
  });
});

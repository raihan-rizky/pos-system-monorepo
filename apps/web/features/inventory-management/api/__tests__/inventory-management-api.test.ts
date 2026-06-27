import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveInboundReceipt,
  createInboundReceipt,
  fetchInboundReceipts,
  fetchReceivingQueue,
  needsRevisionInboundReceipt,
  rejectInboundReceipt,
  submitInboundReceipt,
  submitDailyStockMatching,
  reportDamagedProduct,
  submitWeeklyCleaningProof,
  createInternalStockOutRequest,
  createInternalUseStockLog,
  approveInternalStockOutRequest,
  rejectInternalStockOutRequest,
} from "../inventory-management-api";

describe("inventory management api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "record-1" } }),
      }),
    );
  });

  it("submits weekly cleaning proof to the workspace endpoint", async () => {
    const result = await submitWeeklyCleaningProof({
      proofUrl: "https://prnt.sc/abc123",
      note: "Bersih",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/inventory-management/weekly-cleaning-proof",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proofUrl: "https://prnt.sc/abc123",
          note: "Bersih",
        }),
      },
    );
    expect(result).toEqual({ id: "record-1" });
  });

  it("submits damaged product reports to the workspace endpoint", async () => {
    await reportDamagedProduct({
      productId: "product-1",
      quantity: 2,
      proofUrl: "https://prnt.sc/dmg123",
      note: "Pecah",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/inventory-management/damaged-products",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: "product-1",
          quantity: 2,
          proofUrl: "https://prnt.sc/dmg123",
          note: "Pecah",
        }),
      },
    );
  });

  it("submits daily stock matching to the workspace endpoint", async () => {
    const payload = {
      lines: [{ productId: "product-1", physicalStock: 10, note: "Sesuai fisik" }],
    };
    await submitDailyStockMatching(payload);

    expect(fetch).toHaveBeenCalledWith(
      "/api/inventory-management/daily-stock-matching",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
  });

  it("throws the server message when a workspace submission fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Proof image could not be resolved" }),
    } as Response);

    await expect(
      submitWeeklyCleaningProof({ proofUrl: "https://prnt.sc/missing" }),
    ).rejects.toThrow("Proof image could not be resolved");
  });

  it("loads inbound receipts through the workspace endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "receipt-1" }] }),
    } as Response);

    const result = await fetchInboundReceipts({ status: "SUBMITTED" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/inventory-management/inbound-receipts?status=SUBMITTED",
    );
    expect(result).toEqual([{ id: "receipt-1" }]);
  });

  it("loads receiving queue through the workspace endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { items: [{ shoppingRequestId: "shopping-1" }] } }),
    } as Response);

    const result = await fetchReceivingQueue({ search: "DPB", take: 10 });

    expect(fetch).toHaveBeenCalledWith(
      "/api/inventory-management/receiving-queue?search=DPB&take=10",
    );
    expect(result).toEqual({ items: [{ shoppingRequestId: "shopping-1" }] });
  });

  it("creates and transitions inbound receipts through feature-local API helpers", async () => {
    await createInboundReceipt({
      supplierId: "supplier-1",
      shoppingRequestId: "shopping-1",
      note: "Invoice A",
      lines: [
        {
          productId: "product-1",
          expectedQuantity: 10,
          receivedQuantity: 8,
          status: "PARTIAL",
          note: "Kurang 2",
        },
      ],
    });
    await submitInboundReceipt("receipt-1");
    await approveInboundReceipt("receipt-1");
    await needsRevisionInboundReceipt("receipt-1", "Perlu cek ulang");
    await rejectInboundReceipt("receipt-2", "Tidak cocok");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/inventory-management/inbound-receipts",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/inventory-management/inbound-receipts/receipt-1/submit",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/inventory-management/inbound-receipts/receipt-1/approve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/inventory-management/inbound-receipts/receipt-1/needs-revision",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ revisionReason: "Perlu cek ulang" }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/inventory-management/inbound-receipts/receipt-2/reject",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ rejectionReason: "Tidak cocok" }),
      }),
    );
  });

  it("creates and transitions internal stock-out requests through API helpers", async () => {
    await createInternalStockOutRequest({
      productId: "product-1",
      quantity: 5,
      reason: "Rusak",
    });
    await approveInternalStockOutRequest("request-1");
    await rejectInternalStockOutRequest("request-2", "Stock tidak cukup");

    expect(fetch).toHaveBeenCalledWith(
      "/api/internal-stock-out",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          productId: "product-1",
          quantity: 5,
          reason: "Rusak",
        }),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/internal-stock-out/request-1/approve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/internal-stock-out/request-2/reject",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ rejectionReason: "Stock tidak cukup" }),
      }),
    );
  });

  it("creates quick internal use as a pending stock log with staff reason in note", async () => {
    await createInternalUseStockLog({
      productId: "product-1",
      quantity: 5,
      reason: "Dipakai untuk tester display",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/inventory",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          productId: "product-1",
          type: "OUT",
          reason: "USAGE",
          quantity: 5,
          note: "Dipakai untuk tester display",
        }),
      }),
    );
  });
});

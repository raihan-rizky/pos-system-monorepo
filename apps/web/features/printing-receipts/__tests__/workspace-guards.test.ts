import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrintingReceiptScopeKey, getPrintingReceiptWritePermissions } from "../permissions";
import { getPrintingReceiptPreviewRecord } from "../receipt-api";
import type { PrintingReceipt } from "../types";

const draft = (): PrintingReceipt => ({
  id: "receipt", storeId: "store", subcategory: "SPANDUK", number: "SP-01", revision: 1,
  transactionId: null, createdAt: "2026-10-20", updatedAt: "2026-10-20",
  document: { customerName: "Contoh", customerPhone: "", customerId: null, date: "2026-10-20", note: "", completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "", lines: [] },
});

afterEach(() => vi.unstubAllGlobals());

describe("printing receipt workspace permissions", () => {
  it("separates identities sharing the same store, role, and permissions", () => {
    const scope = { storeId: "store", authorizationFingerprint: "same-role-permissions" };
    expect(getPrintingReceiptScopeKey({ ...scope, userId: "user-a" })).not.toBe(getPrintingReceiptScopeKey({ ...scope, userId: "user-b" }));
  });
  it("keeps create-only transaction permission from enabling edits or deletion", () => {
    const permission = vi.fn((resource: string, action: string) => resource === "transaction" && action === "create");
    expect(getPrintingReceiptWritePermissions("CASHIER", permission)).toEqual({ canCreate: true, canUpdate: false, canDelete: false });
  });

  it("uses request create/update and transaction delete for SALES", () => {
    const permission = vi.fn((resource: string, action: string) => resource === "transaction.request" && action === "update");
    expect(getPrintingReceiptWritePermissions("SALES", permission)).toEqual({ canCreate: false, canUpdate: true, canDelete: false });
    expect(permission).toHaveBeenCalledWith("transaction", "delete");
    expect(permission).not.toHaveBeenCalledWith("transaction", "update");
  });

  it("does not apply SALES request permissions to other roles", () => {
    expect(getPrintingReceiptWritePermissions("ADMIN", (resource: string) => resource === "transaction.request")).toEqual({ canCreate: false, canUpdate: false, canDelete: false });
  });
});

describe("printing receipt preview freshness", () => {
  it("fetches the latest processed receipt before previewing payment and status", async () => {
    const selected = { ...draft(), transactionId: "sale" };
    const fresh = { ...selected, transaction: { id: "sale", total: 75000, amountPaid: 75000, status: "VOIDED" } };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: fresh })));
    vi.stubGlobal("fetch", fetcher);
    expect(await getPrintingReceiptPreviewRecord(selected)).toEqual(fresh);
    expect(fetcher).toHaveBeenCalledWith("/api/printing-receipts/receipt", { cache: "no-store" });
  });

  it("keeps unsent draft values and reports failed processed refreshes", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Nota belum dapat dimuat." }), { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const selected = draft();
    expect(await getPrintingReceiptPreviewRecord(selected)).toBe(selected);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(getPrintingReceiptPreviewRecord({ ...selected, transactionId: "sale" })).rejects.toThrow("Nota belum dapat dimuat.");
  });
});

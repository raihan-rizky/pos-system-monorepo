import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPrintingReceiptDocument } from "../domain";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), review: vi.fn(), save: vi.fn() }));
vi.mock("../server/processed-permission", () => ({ requireProcessedPrintingReceiptPermission: mocks.permission }));
vi.mock("../server/processed-edit-service", () => ({ reviewProcessedPrintingReceipt: mocks.review, saveProcessedPrintingReceipt: mocks.save }));
vi.mock("../server/route-support", () => ({ readPrintingReceiptJson: (request: Request) => request.json(), printingReceiptErrorResponse: (error: any) => Response.json({ message: error.message }, { status: error.status ?? 422 }) }));
import { POST, PATCH } from "@/app/api/printing-receipts/[id]/processed/route";

describe("processed receipt API permission boundary", () => {
  const input = { revision: 2, number: "NT-1", document: createEmptyPrintingReceiptDocument() };
  const context = { params: Promise.resolve({ id: "receipt" }) };
  const request = (body: unknown) => new Request("http://localhost/api/printing-receipts/receipt/processed", { method: "POST", body: JSON.stringify(body) });
  beforeEach(() => { vi.clearAllMocks(); mocks.permission.mockResolvedValue({ id: "owner", name: "Owner", role: "OWNER", storeId: "store" }); mocks.review.mockResolvedValue({ reviewToken: "token" }); mocks.save.mockResolvedValue({ id: "receipt" }); });
  it("denies review and commit without processed-edit permission before touching the service", async () => {
    mocks.permission.mockRejectedValue(Object.assign(new Error("Belum diizinkan"), { status: 403 }));
    expect((await POST(request(input), context)).status).toBe(403);
    expect((await PATCH(request({ ...input, acknowledged: true, reviewToken: "token" }), context)).status).toBe(403);
    expect(mocks.permission).toHaveBeenCalledTimes(2); expect(mocks.review).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("uses authenticated store and actor for review/commit and wraps results in data", async () => {
    expect(await (await POST(request({ ...input, storeId: "other" }), context)).json()).toEqual({ data: { reviewToken: "token" } });
    expect(mocks.review).toHaveBeenCalledWith("store", "receipt", expect.objectContaining(input));
    expect(await (await PATCH(request({ ...input, acknowledged: true, reviewToken: "token" }), context)).json()).toEqual({ data: { id: "receipt" } });
    expect(mocks.save).toHaveBeenCalledWith("store", "receipt", expect.objectContaining({ acknowledged: true, reviewToken: "token" }), { id: "owner", name: "Owner", role: "OWNER" });
  });
  it("rejects unacknowledged commits before starting service work", async () => {
    const response = await PATCH(request(input), context);
    expect(response.status).toBe(422); expect(mocks.save).not.toHaveBeenCalled();
  });
});

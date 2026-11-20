import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn(), preview: vi.fn(), commit: vi.fn() }));
vi.mock("@/features/keuangan/services/expense-correction-access", () => ({ requireExpenseCorrectionAccess: mocks.access }));
vi.mock("@/features/keuangan/services/expense-correction-service", () => ({
  loadExpenseCorrectionEditor: mocks.read, previewExpenseCorrection: mocks.preview, commitExpenseCorrection: mocks.commit,
}));
vi.mock("@/lib/rbac/guard", () => ({ handleAuthError: (error: { statusCode?: number }) =>
  error.statusCode ? Response.json({ message: "Akses ditolak" }, { status: error.statusCode }) : null }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET, POST } from "../route";
import { POST as preview } from "../preview/route";

const url = "http://localhost/api/finance/expense-corrections";
const actor = { id: "actor-1", storeId: "store-1", name: "Pemilik" };
const subject = { type: "BACKDATED_PURCHASE", id: "bt-1", payment: { kind: "BACKDATED_PAYMENT", id: "payment-1" } };
const draft = { subject, operation: "cancel", draft: { reason: "Pembayaran ganda", dispositions: [] } };
const input = { ...draft, version: "a".repeat(64), requestId: "43c10dcf-8281-4fa0-8cfb-64e835ae9051" };

function request(body: unknown) {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

describe("API koreksi pengeluaran", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue(actor);
    mocks.read.mockResolvedValue({ subject });
    mocks.preview.mockResolvedValue({ version: input.version });
    mocks.commit.mockResolvedValue({ auditId: "audit-1" });
  });

  it("memeriksa hak edit pembayaran sebelum membaca transaksi", async () => {
    const response = await GET(new Request(`${url}?type=BACKDATED_PURCHASE&id=bt-1&paymentKind=BACKDATED_PAYMENT&paymentId=payment-1&operation=edit`));
    expect(response.status).toBe(200);
    expect(mocks.access).toHaveBeenCalledWith(subject, "edit");
    expect(mocks.read).toHaveBeenCalledWith(subject, "edit", actor);
  });

  it("memeriksa hak sebelum membuat pratinjau maupun menyimpan", async () => {
    expect((await preview(request(draft))).status).toBe(200);
    expect((await POST(request(input))).status).toBe(200);
    expect(mocks.access).toHaveBeenNthCalledWith(1, subject, "cancel");
    expect(mocks.access).toHaveBeenNthCalledWith(2, subject, "cancel");
    expect(mocks.preview).toHaveBeenCalledWith(draft, actor);
    expect(mocks.commit).toHaveBeenCalledWith(input, actor);
  });

  it("menolak input tidak sah atau akses yang ditolak sebelum memanggil layanan", async () => {
    expect((await POST(request(draft))).status).toBe(422);
    mocks.access.mockRejectedValueOnce({ statusCode: 403 });
    expect((await preview(request(draft))).status).toBe(403);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});

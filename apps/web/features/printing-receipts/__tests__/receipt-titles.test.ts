import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPrintingReceiptDocument, parsePrintingReceiptDocument } from "../domain";
import { createPrintingReceipt, getPrintingReceipt, listPrintingReceipts, savePrintingReceipt } from "../server/receipt-store";

const storage = vi.hoisted(() => ({
  findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn(),
  invoice: vi.fn(), counter: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@pos/db", () => ({ db: {
  printingReceipt: { findFirst: storage.findFirst, findMany: storage.findMany, count: storage.count },
  $transaction: storage.transaction,
} }));

const number = "NT-SP-20261020-000001";
const row = (title?: string) => ({
  id: "receipt", storeId: "store", subcategory: "SPANDUK", number, revision: 1,
  transactionId: null, transaction: null,
  document: { ...createEmptyPrintingReceiptDocument(new Date("2026-10-20T00:00:00Z")), ...(title === undefined ? {} : { title }) },
  createdAt: new Date("2026-10-20T00:00:00Z"), updatedAt: new Date("2026-10-20T00:00:00Z"),
});

beforeEach(() => {
  vi.resetAllMocks();
  storage.transaction.mockImplementation(callback => callback({
    printingReceipt: { findFirst: storage.findFirst, findUnique: storage.findUnique, create: storage.create, updateMany: storage.updateMany },
    printingReceiptCounter: { upsert: storage.counter }, transaction: { findUnique: storage.invoice },
  }));
  storage.findUnique.mockResolvedValue(null);
  storage.invoice.mockResolvedValue(null);
  storage.updateMany.mockResolvedValue({ count: 1 });
  storage.counter.mockResolvedValue({ value: 1 });
  storage.create.mockImplementation(({ data }) => ({ ...row(), ...data }));
  storage.updateMany.mockImplementation(({ data }) => {
    storage.findFirst.mockResolvedValue({ ...row(), ...data, revision: 2 });
    return { count: 1 };
  });
});

describe("judul internal nota", () => {
  it("keeps and trims a custom title during document validation", () => {
    expect(parsePrintingReceiptDocument({ ...row().document, title: "  Banner Oktober  " })).toHaveProperty("title", "Banner Oktober");
  });
  it.each(["x".repeat(101), "Banner\nOktober", "Banner\tOktober"])("rejects an invalid title %j", title => {
    expect(() => parsePrintingReceiptDocument({ ...row().document, title })).toThrow();
  });
  it("uses the receipt number as title for older notes", async () => {
    storage.findFirst.mockResolvedValue(row());
    expect((await getPrintingReceipt("store", "receipt")).document).toHaveProperty("title", number);
    expect(storage.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "receipt", storeId: "store" } }));
  });
  it("persists the allocated number as the default title for new notes", async () => {
    const created = await createPrintingReceipt("store", "cashier", "SPANDUK");
    expect(created.document).toHaveProperty("title", created.number);
    expect(storage.create.mock.calls[0][0].data.document.title).toBe(created.number);
  });
  it("persists a custom title without changing the receipt number", async () => {
    storage.findFirst.mockResolvedValue(row());
    const saved = await savePrintingReceipt("store", "receipt", { revision: 1, number, document: { ...row().document, title: "Banner Oktober" } });
    expect(saved.document).toHaveProperty("title", "Banner Oktober");
    expect(saved.number).toBe(number);
  });
  it.each([undefined, "", number])("keeps the default title in sync when the receipt number changes (%j)", title => {
    storage.findFirst.mockResolvedValue(row(title));
    return expect(savePrintingReceipt("store", "receipt", { revision: 1, number: "SP-BARU", document: row(title).document })).resolves.toMatchObject({
      number: "SP-BARU", document: { title: "SP-BARU" },
    });
  });
  it("preserves a custom title when an older client saves without the title field", async () => {
    storage.findFirst.mockResolvedValue(row("Banner Oktober"));
    expect((await savePrintingReceipt("store", "receipt", { revision: 1, number: "SP-BARU", document: row().document })).document).toHaveProperty("title", "Banner Oktober");
  });
  it.each([{ revision: 2 }, { transactionId: "sale" }])("retains revision and processed-note guards for title edits (%j)", async overrides => {
    storage.findFirst.mockResolvedValue({ ...row(), ...overrides });
    await expect(savePrintingReceipt("store", "receipt", { revision: 1, number, document: { ...row().document, title: "Ubah judul" } })).rejects.toThrow("Nota sudah berubah atau diproses");
    expect(storage.updateMany).not.toHaveBeenCalled();
  });
  it("searches titles without losing store and subcategory boundaries", async () => {
    storage.findMany.mockResolvedValue([row("Banner Oktober")]);
    storage.count.mockResolvedValue(1);
    const result = await listPrintingReceipts("store", { subcategory: "SPANDUK", search: "Banner", page: 1, limit: 12, skip: 0 });
    expect(result.data[0].document).toHaveProperty("title", "Banner Oktober");
    expect(storage.findMany.mock.calls[0][0].where).toMatchObject({
      storeId: "store", subcategory: "SPANDUK",
      OR: expect.arrayContaining([{ document: { path: ["title"], string_contains: "Banner", mode: "insensitive" } }]),
    });
  });
});

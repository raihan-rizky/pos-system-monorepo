import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), authError: vi.fn(), find: vi.fn(), lock: vi.fn(),
  updateItem: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@pos/db", () => ({ db: { transaction: { findFirst: mocks.find }, $transaction: mocks.transaction } }));

const originalItems = [
  { id: "item-1", transactionId: "draft-1", productId: "product-1", productName: "Banner POS", documentName: null as string | null, quantity: 2, unitPrice: 100, subtotal: 200 },
  { id: "item-2", transactionId: "draft-1", productId: "product-2", productName: "Stiker POS", documentName: "Stiker acara" as string | null, quantity: 1, unitPrice: 50, subtotal: 50 },
];
let draft: { id: string; storeId: string; status: string; items: typeof originalItems } | null;
const params = { params: Promise.resolve({ id: "draft-1" }) };
const request = (items: unknown) => new Request("http://localhost/api/transactions/draft-1/document-item-names", {
  method: "PATCH", body: JSON.stringify({ items }),
});
const changes = () => [
  { id: "item-1", documentName: "  Banner kegiatan  " as string | null, expectedDocumentName: null as string | null },
  { id: "item-2", documentName: null as string | null, expectedDocumentName: "Stiker acara" as string | null },
];
const visibleItems = () => draft?.items.map(({ id, productName, documentName }) => ({ id, productName, documentName }));

describe("draft document item names", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    draft = { id: "draft-1", storeId: "store-main", status: "DRAFT", items: structuredClone(originalItems) };
    mocks.permission.mockResolvedValue({ storeId: "store-main", role: "CASHIER" });
    mocks.authError.mockReturnValue(null);
    mocks.lock.mockResolvedValue([{ id: "draft-1" }]);
    mocks.find.mockImplementation(async ({ where }) => {
      if (!draft || draft.id !== where.id || draft.storeId !== where.storeId) return null;
      return { id: draft.id, status: draft.status, items: structuredClone(visibleItems()) };
    });
    mocks.updateItem.mockImplementation(async ({ where, data }) => {
      const item = draft?.items.find(row => row.id === where.id && row.transactionId === where.transactionId && row.documentName === where.documentName);
      if (!item) return { count: 0 };
      Object.assign(item, data);
      return { count: 1 };
    });
    mocks.transaction.mockImplementation(async callback => {
      const before = structuredClone(draft);
      try {
        return await callback({
          $queryRaw: mocks.lock, transaction: { findFirst: mocks.find },
          transactionItem: { updateMany: mocks.updateItem },
        });
      } catch (error) {
        draft = before;
        throw error;
      }
    });
  });

  it("reads original and saved document names for the authenticated store", async () => {
    const { GET } = await import("../route");
    const response = await GET(new Request("http://localhost"), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [
      { id: "item-1", productName: "Banner POS", documentName: null },
      { id: "item-2", productName: "Stiker POS", documentName: "Stiker acara" },
    ] });
    expect(mocks.permission).toHaveBeenCalledWith("transaction.draft", "read");
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "draft-1", storeId: "store-main" } }));
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("trims custom names and restores originals without changing products, prices, or quantities", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(request(changes()), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [
      { id: "item-1", productName: "Banner POS", documentName: "Banner kegiatan" },
      { id: "item-2", productName: "Stiker POS", documentName: null },
    ] });
    expect(draft?.items).toEqual([
      { ...originalItems[0], documentName: "Banner kegiatan" },
      { ...originalItems[1], documentName: null },
    ]);
    expect(mocks.permission).toHaveBeenCalledWith("transaction.draft", "update");
    expect(mocks.updateItem).toHaveBeenNthCalledWith(1, {
      where: { id: "item-1", transactionId: "draft-1", documentName: null }, data: { documentName: "Banner kegiatan" },
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    const [sql, ...parameters] = mocks.lock.mock.calls[0];
    expect(sql.join("?")).toMatch(/pos_transactions.*FOR UPDATE/s);
    expect(parameters).toEqual(["draft-1", "store-main"]);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.find.mock.invocationCallOrder[0]);
  });

  it.each([1, 300])("accepts a trimmed name of %s characters", async length => {
    const { PATCH } = await import("../route");
    const items = changes();
    items[0].documentName = "  " + "N".repeat(length) + "  ";
    const response = await PATCH(request(items), params);
    expect(response.status).toBe(200);
    expect((await response.json()).items[0].documentName).toBe("N".repeat(length));
  });

  it.each(["", "   ", "N".repeat(301), 10, {}, [], undefined].map(documentName => ({ documentName })))("rejects invalid document names: $documentName", async ({ documentName }) => {
    const { PATCH } = await import("../route");
    expect((await PATCH(request([{ ...changes()[0], documentName }, changes()[1]]), params)).status).toBe(422);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it.each([
    undefined, null, {}, "items", [],
    [{ id: "item-1", documentName: "Banner" }],
    [{ id: "", documentName: "Banner", expectedDocumentName: null }],
    [{ id: "item-1", documentName: "Banner", expectedDocumentName: 10 }],
    [{ id: "item-1", documentName: "Banner", expectedDocumentName: null, productName: "Replaced POS name" }],
  ].map(items => ({ items })))("rejects malformed or unsafe payloads: $items", async ({ items }) => {
    const { PATCH } = await import("../route");
    expect((await PATCH(request(items), params)).status).toBe(422);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("returns 422 for malformed JSON", async () => {
    const { PATCH } = await import("../route");
    const malformed = new Request("http://localhost", { method: "PATCH", body: "{" });
    expect((await PATCH(malformed, params)).status).toBe(422);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("rejects duplicate IDs before saving any names", async () => {
    const { PATCH } = await import("../route");
    expect((await PATCH(request([changes()[0], changes()[0]]), params)).status).toBe(422);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it.each([
    [changes()[0]],
    [...changes(), { id: "foreign-item", documentName: "Asing", expectedDocumentName: null }],
    [changes()[0], { id: "foreign-item", documentName: "Asing", expectedDocumentName: null }],
  ].map(items => ({ items })))("rejects a stale or foreign item set atomically", async ({ items }) => {
    const { PATCH } = await import("../route");
    expect((await PATCH(request(items), params)).status).toBe(409);
    expect(draft?.items).toEqual(originalItems);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("rejects stale expected names even when the desired value is already saved", async () => {
    const { PATCH } = await import("../route");
    draft!.items[0].documentName = "Banner kegiatan";
    expect((await PATCH(request(changes()), params)).status).toBe(409);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("rolls back prior rows if an item disappears or its name changes during saving", async () => {
    const { PATCH } = await import("../route");
    const update = mocks.updateItem.getMockImplementation()!;
    mocks.updateItem.mockImplementationOnce(update).mockResolvedValueOnce({ count: 0 });
    expect((await PATCH(request(changes()), params)).status).toBe(409);
    expect(draft?.items).toEqual(originalItems);
  });

  it("checks the current draft status after acquiring the transaction lock", async () => {
    const { PATCH } = await import("../route");
    mocks.lock.mockImplementation(async () => {
      draft!.status = "COMPLETED";
      return [{ id: "draft-1" }];
    });
    expect((await PATCH(request(changes()), params)).status).toBe(409);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it.each(["COMPLETED", "DP", "PENDING_APPROVAL", "VOIDED", "REFUNDED"])("rejects reads and writes for %s transactions", async status => {
    const { GET, PATCH } = await import("../route");
    draft!.status = status;
    expect((await GET(new Request("http://localhost"), params)).status).toBe(409);
    expect((await PATCH(request(changes()), params)).status).toBe(409);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it.each(["missing", "other-store"])("returns 404 for %s transactions", async kind => {
    const { GET, PATCH } = await import("../route");
    if (kind === "missing") draft = null;
    else mocks.permission.mockResolvedValue({ storeId: "store-other" });
    expect((await GET(new Request("http://localhost"), params)).status).toBe(404);
    expect((await PATCH(request(changes()), params)).status).toBe(404);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("uses the authenticated store for reads and row locks", async () => {
    const { PATCH } = await import("../route");
    draft!.storeId = "store-other";
    mocks.permission.mockResolvedValue({ storeId: "store-other" });
    expect((await PATCH(request(changes()), params)).status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "draft-1", storeId: "store-other" } }));
    expect(mocks.lock.mock.calls[0].slice(1)).toEqual(["draft-1", "store-other"]);
  });

  it.each([401, 403])("preserves authorization failure %s for reads and writes", async status => {
    const { GET, PATCH } = await import("../route");
    mocks.permission.mockRejectedValue(new Error("denied"));
    mocks.authError.mockReturnValue(new Response("denied", { status }));
    expect((await GET(new Request("http://localhost"), params)).status).toBe(status);
    expect((await PATCH(request(changes()), params)).status).toBe(status);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("reports a serialization conflict as 409 without retrying stale input", async () => {
    const { PATCH } = await import("../route");
    mocks.transaction.mockRejectedValue({ code: "P2034" });
    expect((await PATCH(request(changes()), params)).status).toBe(409);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("reports persistence failures without claiming a successful save", async () => {
    const { PATCH } = await import("../route");
    mocks.updateItem.mockRejectedValue(new Error("database unavailable"));
    expect((await PATCH(request(changes()), params)).status).toBe(500);
    expect(draft?.items).toEqual(originalItems);
  });

  it("matches changes by item ID when the client sends the complete set in a different order", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(request(changes().reverse()), params);

    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual([
      { id: "item-1", productName: "Banner POS", documentName: "Banner kegiatan" },
      { id: "item-2", productName: "Stiker POS", documentName: null },
    ]);
    expect(draft?.items).toEqual([
      { ...originalItems[0], documentName: "Banner kegiatan" },
      { ...originalItems[1], documentName: null },
    ]);
  });

  it("keeps separate aliases for two rows referring to the same POS product", async () => {
    const { PATCH } = await import("../route");
    draft!.items[1].productId = "product-1";
    draft!.items[1].productName = "Banner POS";
    const before = structuredClone(draft!.items);
    const items = changes();
    items[1].documentName = "Banner pintu masuk";

    const response = await PATCH(request(items), params);

    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual([
      { id: "item-1", productName: "Banner POS", documentName: "Banner kegiatan" },
      { id: "item-2", productName: "Banner POS", documentName: "Banner pintu masuk" },
    ]);
    expect(draft?.items).toEqual([
      { ...before[0], documentName: "Banner kegiatan" },
      { ...before[1], documentName: "Banner pintu masuk" },
    ]);
  });

  it("reloads the saved aliases and persists a later reset to the original product names", async () => {
    const { GET, PATCH } = await import("../route");
    expect((await PATCH(request(changes()), params)).status).toBe(200);
    const saved = await GET(new Request("http://localhost"), params);
    expect(saved.status).toBe(200);
    const savedItems = (await saved.json()).items;
    expect(savedItems.map((item: { documentName: string | null }) => item.documentName)).toEqual(["Banner kegiatan", null]);

    const reset = savedItems.map((item: { id: string; documentName: string | null }) => ({
      id: item.id, documentName: null, expectedDocumentName: item.documentName,
    }));
    expect((await PATCH(request(reset), params)).status).toBe(200);
    const reloaded = await GET(new Request("http://localhost"), params);

    expect(reloaded.status).toBe(200);
    expect((await reloaded.json()).items).toEqual([
      { id: "item-1", productName: "Banner POS", documentName: null },
      { id: "item-2", productName: "Stiker POS", documentName: null },
    ]);
    expect(draft?.items).toEqual(originalItems.map(item => ({ ...item, documentName: null })));
  });

  it("allows a complete unchanged snapshot without replacing null aliases with product names", async () => {
    const { PATCH } = await import("../route");
    const items = originalItems.map(item => ({
      id: item.id, documentName: item.documentName, expectedDocumentName: item.documentName,
    }));

    const response = await PATCH(request(items), params);

    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual(visibleItems());
    expect(draft?.items).toEqual(originalItems);
  });

  it("preserves Indonesian text, punctuation, emoji, and meaningful internal spaces in aliases", async () => {
    const { PATCH } = await import("../route");
    const items = changes();
    items[0].documentName = "  Spanduk  Selamat Datang — Ukuran 3×2 m 🎉  ";

    const response = await PATCH(request(items), params);

    expect(response.status).toBe(200);
    expect((await response.json()).items[0]).toEqual({
      id: "item-1", productName: "Banner POS", documentName: "Spanduk  Selamat Datang — Ukuran 3×2 m 🎉",
    });
    expect(draft!.items[0]).toEqual({ ...originalItems[0], documentName: "Spanduk  Selamat Datang — Ukuran 3×2 m 🎉" });
  });

  it("accepts a saved 300-character alias as the exact comparison value when restoring the original", async () => {
    const { PATCH } = await import("../route");
    draft!.items[1].documentName = "N".repeat(300);
    const items = changes();
    items[1].expectedDocumentName = "N".repeat(300);

    const response = await PATCH(request(items), params);

    expect(response.status).toBe(200);
    expect(draft!.items[1]).toEqual({ ...originalItems[1], documentName: null });
  });

  it("rejects a stale second row before saving a valid change to the first row", async () => {
    const { PATCH } = await import("../route");
    draft!.items[1].documentName = "Diperbarui oleh kasir lain";
    const before = structuredClone(draft!.items);

    const response = await PATCH(request(changes()), params);

    expect(response.status).toBe(409);
    expect(draft!.items).toEqual(before);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it.each(["stiker acara", " Stiker acara", "Stiker acara "])(
    "compares saved aliases exactly without normalizing the expected value: %j", async expectedDocumentName => {
      const { PATCH } = await import("../route");
      const items = changes();
      items[1].expectedDocumentName = expectedDocumentName;

      expect((await PATCH(request(items), params)).status).toBe(409);
      expect(draft?.items).toEqual(originalItems);
      expect(mocks.updateItem).not.toHaveBeenCalled();
    },
  );

  it("keeps the first editor's save, rejects the stale editor, and accepts a refreshed snapshot", async () => {
    const { GET, PATCH } = await import("../route");
    const staleEditor = changes();
    staleEditor[0].documentName = "Banner dari editor kedua";
    expect((await PATCH(request(changes()), params)).status).toBe(200);
    const firstSave = structuredClone(draft!.items);
    mocks.updateItem.mockClear();

    expect((await PATCH(request(staleEditor), params)).status).toBe(409);
    expect(draft?.items).toEqual(firstSave);
    expect(mocks.updateItem).not.toHaveBeenCalled();

    const snapshot = await GET(new Request("http://localhost"), params);
    expect(snapshot.status).toBe(200);
    const refreshed = (await snapshot.json()).items.map((item: { id: string; documentName: string | null }) => ({
      id: item.id,
      documentName: item.id === "item-1" ? "Banner dari editor kedua" : item.documentName,
      expectedDocumentName: item.documentName,
    }));
    expect((await PATCH(request(refreshed), params)).status).toBe(200);
    expect(draft?.items).toEqual([
      { ...originalItems[0], documentName: "Banner dari editor kedua" },
      { ...originalItems[1], documentName: null },
    ]);
  });

  it.each(["added", "removed"])("rejects a row %s while waiting for the transaction lock", async change => {
    const { PATCH } = await import("../route");
    mocks.lock.mockImplementation(async () => {
      if (change === "added") draft!.items.push({ ...originalItems[0], id: "item-3" });
      else draft!.items.pop();
      return [{ id: "draft-1" }];
    });

    expect((await PATCH(request(changes()), params)).status).toBe(409);
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("rejects an invalid final row without saving earlier valid rows or opening a transaction", async () => {
    const { PATCH } = await import("../route");
    const items = changes();
    items[1].documentName = "N".repeat(301);

    expect((await PATCH(request(items), params)).status).toBe(422);
    expect(draft?.items).toEqual(originalItems);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it.each([
    { field: "productId", value: "replacement-product" },
    { field: "transactionId", value: "other-draft" },
    { field: "quantity", value: 99 },
    { field: "unitPrice", value: 1 },
    { field: "subtotal", value: 1 },
  ])("rejects attempts to change immutable item field $field", async ({ field, value }) => {
    const { PATCH } = await import("../route");
    const items = [changes()[0], { ...changes()[1], [field]: value }];

    expect((await PATCH(request(items), params)).status).toBe(422);
    expect(draft?.items).toEqual(originalItems);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it.each([
    { storeId: "store-other" },
    { status: "DRAFT" },
    { role: "SUPER_ADMIN" },
    { total: 1 },
  ])("rejects extra transaction or authorization fields in the request envelope: %j", async extra => {
    const { PATCH } = await import("../route");
    const unsafeRequest = new Request("http://localhost", {
      method: "PATCH", body: JSON.stringify({ items: changes(), ...extra }),
    });

    expect((await PATCH(unsafeRequest, params)).status).toBe(422);
    expect(draft?.items).toEqual(originalItems);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("authorizes before parsing a malformed body or opening any database transaction", async () => {
    const { PATCH } = await import("../route");
    mocks.permission.mockRejectedValue(new Error("denied"));
    mocks.authError.mockReturnValue(new Response("denied", { status: 403 }));
    const malformed = new Request("http://localhost", { method: "PATCH", body: "{" });
    const parse = vi.spyOn(malformed, "json");

    expect((await PATCH(malformed, params)).status).toBe(403);
    expect(parse).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("rolls back the first saved alias if the second row throws a database error", async () => {
    const { PATCH } = await import("../route");
    const update = mocks.updateItem.getMockImplementation()!;
    mocks.updateItem.mockImplementationOnce(update).mockRejectedValueOnce(new Error("internal storage failure detail"));

    const response = await PATCH(request(changes()), params);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Nama item dokumen gagal disimpan. Silakan coba lagi." });
    expect(mocks.updateItem).toHaveBeenCalledTimes(2);
    expect(draft?.items).toEqual(originalItems);
  });

  it.each(["40001", "40P01"])("reports SQLSTATE %s as a conflict without retrying the snapshot", async code => {
    const { PATCH } = await import("../route");
    mocks.lock.mockRejectedValue({ code: "P2010", meta: { code } });

    const response = await PATCH(request(changes()), params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "Item atau faktur sudah berubah. Tutup dan buka kembali nota sebelum mencoba lagi." });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.lock).toHaveBeenCalledTimes(1);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
    expect(draft?.items).toEqual(originalItems);
  });

  it.each([
    { code: "P2010", meta: { code: "23505", detail: "internal storage failure detail" } },
    { code: "P2010" },
  ])("does not disguise an unrelated raw query error as an edit conflict: %j", async error => {
    const { PATCH } = await import("../route");
    mocks.lock.mockRejectedValue(error);

    const response = await PATCH(request(changes()), params);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Nama item dokumen gagal disimpan. Silakan coba lagi." });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.updateItem).not.toHaveBeenCalled();
    expect(draft?.items).toEqual(originalItems);
  });

  it("returns a friendly read error without exposing database details or changing aliases", async () => {
    const { GET } = await import("../route");
    mocks.find.mockRejectedValue(new Error("internal storage failure detail"));

    const response = await GET(new Request("http://localhost"), params);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Nama item dokumen belum dapat dimuat." });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
    expect(draft?.items).toEqual(originalItems);
  });
});

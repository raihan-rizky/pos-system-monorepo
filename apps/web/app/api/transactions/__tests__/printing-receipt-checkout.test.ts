import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/features/product-price-rounding/server/rounding-settings", () => ({ getPriceRoundingSettings: vi.fn().mockResolvedValue({ enabled: false, increment: 500, threshold: 50 }) }));

const mocks = vi.hoisted(() => ({
  role: vi.fn(), permission: vi.fn(), receipt: vi.fn(), lock: vi.fn(), link: vi.fn(),
  findTransaction: vi.fn(), create: vi.fn(), products: vi.fn(), stock: vi.fn(),
  journal: vi.fn(), dbTransaction: vi.fn(), can: vi.fn(), customer: vi.fn(),
  stockLock: vi.fn(), customerUpdate: vi.fn(),
}));

vi.mock("next/server", async () => ({
  ...await vi.importActual<typeof import("next/server")>("next/server"), after: vi.fn(),
}));
vi.mock("@/lib/rbac/guard", () => ({
  requireRole: mocks.role, requirePermission: mocks.permission,
  handleAuthError: () => null, AuthError: class extends Error {},
}));
vi.mock("@/features/rbac/helpers/rbac-core", () => ({canRolePerformAction: mocks.can}));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({getGlobalRolePermissions: async () => []}));
vi.mock("@/lib/push-events", () => ({sendRolePushEvent: vi.fn()}));
vi.mock("@/features/invoice-date/services/internet-clock", () => ({
  getInvoiceNow: async () => new Date("2026-10-20T03:00:00Z"),
}));
vi.mock("@/features/customer-category-pricing/helpers/base-cost", () => ({loadProductBaseCosts: async () => new Map()}));
vi.mock("@/features/product-stock-groups/stock-mutations", () => ({
  applyProductStockDeltas: mocks.stock, StockMutationError: class extends Error {},
}));
vi.mock("@pos/db", () => ({
  Prisma: {}, db: {
    printingReceipt: {findFirst: mocks.receipt},
    product: {findMany: mocks.products},
    customer: {findFirst: mocks.customer},
    salesperson: {findFirst: vi.fn()},
    printingService: {findMany: vi.fn(async () => [])},
    transaction: {count: async () => 0, findFirst: mocks.findTransaction},
    categoryCustomerPricingRule: {findMany: async () => []},
    $transaction: mocks.dbTransaction,
  },
}));

const document = () => ({
  customerName: "Pelanggan Plat", customerPhone: "081234", customerId: null,
  date: "2026-10-20", note: "Dibuat sesuai contoh", completionDate: "", completionTime: "",
  receiver: "", setter: "", signatory: "",
  lines: [{id: "line-1", name: "Plat nomor pesanan", material: "Aluminium",
    quantity: 2, price: 50000, stockLink: null}],
});
const receipt = () => ({
  id: "receipt-1", storeId: "store-1", subcategory: "PLAT", number: "PL-20261020-00001",
  revision: 3, document: document(), transactionId: null,
});

async function checkout(overrides: Record<string, unknown> = {}) {
  const { POST } = await import("../route");
  return POST(new Request("http://localhost/api/transactions", {
    method: "POST", body: JSON.stringify({
      printingReceiptId: "receipt-1", printingReceiptRevision: 3,
      items: [], paymentMethod: "CASH", amountPaid: 100000, ...overrides,
    }),
  }));
}

describe("checkout nota Percetakan", () => {
  beforeAll(async () => { await import("../route"); }, 30000);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role.mockResolvedValue({id:"cashier-1",role:"CASHIER",storeId:"store-1",name:"Kasir"});
    mocks.permission.mockImplementation(() => mocks.role());
    mocks.can.mockReturnValue(true);
    mocks.receipt.mockResolvedValue(receipt());
    mocks.customer.mockResolvedValue(true);
    mocks.products.mockResolvedValue([]);
    mocks.stockLock.mockImplementation(async (_strings: TemplateStringsArray, rowId: string) => [{ id: rowId }]);
    mocks.customerUpdate.mockResolvedValue({});
    mocks.lock.mockResolvedValue({count:1});
    mocks.link.mockResolvedValue({});
    mocks.stock.mockResolvedValue([]);
    mocks.journal.mockResolvedValue({count:0});
    mocks.findTransaction.mockResolvedValue(null);
    mocks.create.mockImplementation(async ({data}: {data: Record<string, unknown>}) => ({
      id:"transaction-1",...data,items:[],payments:[],
    }));
    mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      printingReceipt: {updateMany:mocks.lock,update:mocks.link,findFirst:mocks.receipt},
      transaction: {create:mocks.create,findFirst:mocks.findTransaction},
      inventoryLog:{createMany:mocks.journal},customer:{update:mocks.customerUpdate},
      product:{findMany:mocks.products},$queryRaw:mocks.stockLock,
    }));
  });

  it("membuat satu transaksi dari isi tersimpan, mengabaikan keranjang klien", async () => {
    const response = await checkout({items:[{productId:"forged-product",price:1,quantity:99}]});
    expect(response.status).toBe(201);
    expect(mocks.receipt).toHaveBeenCalledWith(expect.objectContaining({where:{id:"receipt-1",storeId:"store-1"}}));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
      invoiceNumber:"PL-20261020-00001",transactionCategory:"PERCETAKAN",printingSubcategory:"PLAT",
      subtotal:100000,total:100000,customerName:"Pelanggan Plat",
      items:{create:[expect.objectContaining({productId:null,printingServiceId:null,
        productName:"Plat nomor pesanan",quantity:2,unitPrice:50000,subtotal:100000})]},
    })}));
    expect(mocks.link).toHaveBeenCalledWith(expect.objectContaining({where:{id:"receipt-1"},data:{transactionId:"transaction-1"}}));
    expect(mocks.stock).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({items:[]}));
    expect(mocks.journal).not.toHaveBeenCalled();
  });

  it("mengunci revision dan menautkan transaksi di dalam transaksi database yang sama", async () => {
    expect((await checkout()).status).toBe(201);
    expect(mocks.lock).toHaveBeenCalledWith({where:{id:"receipt-1",storeId:"store-1",revision:3,transactionId:null},data:{revision:{increment:1}}});
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.link.mock.invocationCallOrder[0]);
    expect(mocks.dbTransaction).toHaveBeenCalledTimes(1);
  });

  it("pengulangan checkout mengembalikan transaksi tersimpan tanpa stok atau pembayaran baru", async () => {
    const existing={id:"transaction-existing",invoiceNumber:"PL-20261020-00001",items:[]};
    mocks.receipt.mockResolvedValue({...receipt(),transactionId:existing.id});
    mocks.findTransaction.mockResolvedValue(existing);
    const response=await checkout();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(existing);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.dbTransaction).not.toHaveBeenCalled();
    expect(mocks.stock).not.toHaveBeenCalled();
  });

  it("menolak revision lama tanpa membuat transaksi", async () => {
    expect((await checkout({printingReceiptRevision:2})).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("checkout bersamaan mengembalikan transaksi pertama setelah penguncian nota", async () => {
    const existing={id:"transaction-existing",invoiceNumber:"PL-20261020-00001",items:[]};
    mocks.lock.mockResolvedValue({count:0});
    mocks.receipt.mockResolvedValueOnce(receipt()).mockResolvedValueOnce({...receipt(),transactionId:existing.id});
    mocks.findTransaction.mockResolvedValue(existing);
    const response=await checkout();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(existing);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.stock).not.toHaveBeenCalled();
  });

  it("menolak jumlah pembayaran yang dihitung dari harga palsu di klien", async () => {
    const response=await checkout({amountPaid:2,items:[{lineType:"PRINTING_SERVICE",printingServiceId:null,name:"Palsu",quantity:2,price:1}]});
    expect(response.status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("menolak stok yang sudah berganti satuan setelah nota disimpan", async () => {
    const value=receipt();
    mocks.receipt.mockResolvedValue({...value,document:{...value.document,lines:[{...value.document.lines[0],stockLink:{productId:"aluminium",quantity:3,unit:"lembar"}}]}});
    mocks.products.mockResolvedValue([{id:"aluminium",name:"Aluminium",unit:"pack",costPrice:7000,category:{name:"Bahan"}}]);
    expect((await checkout()).status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("membatalkan checkout ketika satuan bahan berubah saat stok dikunci", async () => {
    const value = receipt();
    mocks.receipt.mockResolvedValue({
      ...value,
      document: { ...value.document, customerId: "customer-1", lines: [{
        ...value.document.lines[0],
        stockLink: { productId: "aluminium", quantity: 3, unit: "lembar" },
      }] },
    });
    let currentUnit = "lembar";
    mocks.products.mockImplementation(async () => [{
      id: "aluminium", name: "Aluminium", unit: currentUnit, costPrice: 7000,
      stock: 20, stockGroupId: null, category: { name: "Bahan" },
    }]);
    mocks.stockLock.mockImplementation(async (_strings: TemplateStringsArray, rowId: string) => {
      currentUnit = "pack";
      return [{ id: rowId }];
    });
    mocks.stock.mockResolvedValue([{ productId: "aluminium", stockGroupId: null, baseDelta: -3 }]);
    let commits = 0;
    const runTransaction = mocks.dbTransaction.getMockImplementation()!;
    mocks.dbTransaction.mockImplementation(async (...args) => {
      const result = await runTransaction(...args);
      commits += 1;
      return result;
    });

    const response = await checkout();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ message: expect.stringMatching(/satuan.*bahan/i) });
    expect(mocks.stockLock).toHaveBeenCalled();
    expect(commits).toBe(0);
    expect(mocks.stock).not.toHaveBeenCalled();
    expect(mocks.journal).not.toHaveBeenCalled();
  });

  it("menolak penyimpanan yang berubah sesudah dibaca, tanpa side effect", async () => {
    mocks.lock.mockResolvedValue({count:0});
    expect((await checkout()).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.stock).not.toHaveBeenCalled();
  });

  it("tidak membaca nota toko lain", async () => {
    mocks.receipt.mockResolvedValue(null);
    expect((await checkout()).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("mempertahankan aturan izin tanggal nota untuk kasir", async () => {
    const value=receipt();
    mocks.receipt.mockResolvedValue({...value,document:{...value.document,date:"2026-10-19"}});
    expect((await checkout()).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("tanggal transaksi mengikuti tanggal nota tersimpan saat Owner memberi alasan", async () => {
    mocks.role.mockResolvedValue({id:"owner-1",role:"OWNER",storeId:"store-1",name:"Owner"});
    const value=receipt();
    mocks.receipt.mockResolvedValue({...value,document:{...value.document,date:"2026-10-19"}});
    expect((await checkout({invoiceDate:"2026-10-20",invoiceDateReason:"Sesuai tanggal nota"})).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({invoiceDate:new Date("2026-10-19T03:00:00Z")})}));
  });

  it("membolehkan DP memakai jumlah yang dihitung server", async () => {
    expect((await checkout({amountPaid:25000,paymentStatus:"DP"})).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
      total:100000,amountPaid:25000,status:"DP",change:0,
    })}));
  });

  it("menolak total nota yang melampaui kapasitas uang setelah pajak tanpa side effect", async () => {
    const value = receipt();
    value.document.lines[0].quantity = 1;
    value.document.lines[0].price = 9_999_999_999.99;
    mocks.receipt.mockResolvedValue(value);
    const response = await checkout({ taxRate: 11, amountPaid: 11_099_999_999.99 });
    expect(response.status).toBe(422);
    expect(mocks.dbTransaction).not.toHaveBeenCalled();
    expect(mocks.stock).not.toHaveBeenCalled();
    expect(mocks.journal).not.toHaveBeenCalled();
  });
  it("menerima total besar yang masih dalam kapasitas setelah pajak", async () => {
    const value = receipt();
    value.document.lines[0].quantity = 1;
    value.document.lines[0].price = 9_000_000_000;
    mocks.receipt.mockResolvedValue(value);
    expect((await checkout({ taxRate: 11, amountPaid: 9_990_000_000 })).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ subtotal: 9_000_000_000, tax: 990_000_000, total: 9_990_000_000 }) }));
  });
  it.each([
    ["uang dibayar", { amountPaid: 10_000_000_000 }],
    ["diskon", { discount: 10_000_000_000, amountPaid: 0 }],
    ["jumlah pembayaran terpisah", { payments: [{ method: "CASH", amount: 6_000_000_000 }, { method: "TRANSFER", amount: 4_000_000_000 }] }],
  ])("menolak %s yang melampaui kapasitas penyimpanan nota", async (_label, overrides) => {
    expect((await checkout(overrides as Record<string, unknown>)).status).toBe(422);
    expect(mocks.dbTransaction).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("menerima pembayaran tepat di batas kapasitas dan menghitung kembaliannya", async () => {
    expect((await checkout({ amountPaid: 9_999_999_999.99 })).status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data.amountPaid).toBe(9_999_999_999.99);
    expect(mocks.create.mock.calls[0][0].data.change).toBeCloseTo(9_999_899_999.99, 2);
  });

  it("mengurangi bahan terkait dengan pemakaian eksplisit, tidak mengalikan jumlah pesanan", async () => {
    const value=receipt();
    const linked={...value,document:{...value.document,customerId:"customer-1",lines:[{...value.document.lines[0],stockLink:{productId:"aluminium",quantity:3,unit:"lembar"}}]}};
    mocks.receipt.mockResolvedValue(linked);
    mocks.products.mockResolvedValue([{id:"aluminium",name:"Aluminium",unit:"lembar",costPrice:7000,stock:20,category:{name:"Bahan"}}]);
    mocks.stock.mockResolvedValue([{productId:"aluminium",stockGroupId:null,baseDelta:-3}]);
    expect((await checkout()).status).toBe(201);
    expect(mocks.stockLock).toHaveBeenCalled();
    expect(mocks.customerUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.stockLock.mock.invocationCallOrder[0]);
    expect(mocks.stockLock.mock.invocationCallOrder[0]).toBeLessThan(mocks.stock.mock.invocationCallOrder[0]);
    expect(mocks.stock).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({items:[{productId:"aluminium",delta:-3}]}));
    expect(mocks.journal).toHaveBeenCalledWith({data:expect.arrayContaining([expect.objectContaining({productId:"aluminium",quantity:3,reason:"USAGE"})])});
  });

  it("nota yang menunggu persetujuan tidak langsung mengurangi stok", async () => {
    mocks.can.mockImplementation((_role,resource) => resource!=="transaction.auto_approve");
    expect((await checkout()).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"PENDING_APPROVAL"})}));
    expect(mocks.stock).not.toHaveBeenCalled();
  });

  it("mempertahankan pemakaian pecahan pada dua baris yang memakai bahan sama", async () => {
    const value = receipt();
    const first = { ...value.document.lines[0], stockLink: { productId: "flexi", quantity: 0.5, unit: "m" } };
    const second = { ...first, id: "line-2", name: "Cetak kedua", quantity: 3, stockLink: { productId: "flexi", quantity: 1.25, unit: "m" } };
    mocks.receipt.mockResolvedValue({ ...value, document: { ...value.document, lines: [first, second] } });
    mocks.products.mockResolvedValue([{ id: "flexi", name: "Flexi", unit: "m", costPrice: 1000, stock: 20, category: { name: "Bahan" } }]);
    mocks.stock.mockResolvedValue([{ productId: "flexi", stockGroupId: null, baseDelta: -1.75 }]);
    expect((await checkout({ amountPaid: 250000 })).status).toBe(201);
    expect(mocks.stock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ items: [
      { productId: "flexi", delta: -0.5 }, { productId: "flexi", delta: -1.25 },
    ] }));
    const savedItems = mocks.create.mock.calls[0][0].data.items.create;
    expect(savedItems.map((item: Record<string, unknown>) => ({ quantity: item.quantity, used: item.rawMaterialQuantity }))).toEqual([
      { quantity: 2, used: 0.5 }, { quantity: 3, used: 1.25 },
    ]);
    expect(mocks.journal.mock.calls[0][0].data.map((entry: Record<string, unknown>) => entry.stockBaseDelta)).toEqual([-0.5, -1.25]);
  });
  it("menolak bahan yang telah dinonaktifkan atau dihapus setelah draft tersimpan", async () => {
    const value = receipt();
    mocks.receipt.mockResolvedValue({ ...value, document: { ...value.document, lines: [{ ...value.document.lines[0], stockLink: { productId: "missing", quantity: 1, unit: "m" } }] } });
    mocks.products.mockResolvedValue([]);
    expect((await checkout()).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.stock).not.toHaveBeenCalled();
  });

  it("tidak membolehkan layanan manual tanpa nota tersimpan", async () => {
    const response=await checkout({printingReceiptId:undefined,printingReceiptRevision:undefined,
      items:[{lineType:"PRINTING_SERVICE",printingServiceId:null,name:"Manual",price:50000,quantity:2}]});
    expect(response.status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

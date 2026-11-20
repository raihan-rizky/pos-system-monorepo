import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ expenses: vi.fn(), backdated: vi.fn() }));
vi.mock("@pos/db", async (loadOriginal) => {
  const actual = await loadOriginal<typeof import("@pos/db")>();
  return { ...actual, db: { $transaction: (callback: (tx: unknown) => unknown) => callback({
    $queryRaw: async () => [],
    expense: { findMany: mocks.expenses }, backdatedPurchase: { findMany: mocks.backdated },
  }) } };
});
import * as finance from "../recognized-finance";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const expense = {
  id: "expense-1", storeId: "store-1", applicantName: "Pemasok A", category: "SUPPLIES", customCategoryId: null,
  description: "Pembelian A", amount: "100000.00", changeAmount: "0", occurredAt: new Date("2026-10-31T17:00:00.000Z"),
  createdAt: new Date("2026-11-01T00:00:00.000Z"), transactionId: null, attachmentUrl: null,
  hasMissingCostSnapshot: false, manualPurchasePaymentMethod: null, goodsPurchaseId: "purchase-1", shoppingRequestId: "request-1",
  recordedBy: { id: "user-1", name: "Pengguna" }, shoppingRequest: null,
  goodsPurchase: {
    id: "purchase-1", storeId: "store-1", number: "PB-1", status: "APPROVED", statusBeforeCancellation: null,
    totalAmount: "100000.00", paymentMethod: "GIRO", paymentDueDate: date("2026-12-15"),
    initialTransferAmount: null, initialTransferPaidAt: null, supplierNameSnapshot: "Pemasok A",
    payments: [{ id: "giro-1", method: "GIRO", amount: "100000.00", dueDate: date("2026-12-15") }],
    supplierPayable: { storeId: "store-1", giroHistoryVerifiedAt: date("2026-11-01"), payments: [
      { id: "payment-1", amount: "30000.00", paidAt: date("2026-11-10") },
      { id: "payment-2", amount: "70000.00", paidAt: date("2026-12-20") },
    ] },
    shoppingRequest: { corrections: [] },
  },
};

type Result = { monthlyTotal: number | null; incomplete: boolean; rows: Array<{ netAmount: number; recognitionKind?: string }> };
type Build = (input: { storeId: string; month: string; now: Date; expenses: unknown[]; backdatedPurchases: unknown[] }) => Result;
const build = () => (finance as { buildRecognizedExpenses?: Build }).buildRecognizedExpenses;

describe("sumber koreksi pengeluaran otomatis", () => {
  it("mempertahankan identitas daftar lama dan menautkan pembayaran ke pembelian yang terverifikasi", () => {
    const legacy = {
      ...expense, goodsPurchaseId: null, goodsPurchase: null,
      shoppingRequest: { id: "request-1", number: "DPB-1", goodsPurchases: [expense.goodsPurchase] },
    };
    const result = build()!({
      storeId: "store-1", month: "2026-11", now: date("2026-11-30"),
      expenses: [legacy], backdatedPurchases: [],
    });
    expect(result.rows).toMatchObject([{
      source: { type: "SHOPPING_REQUEST", id: "request-1", number: "DPB-1", goodsPurchaseId: "purchase-1" },
      paymentSource: { kind: "SUPPLIER_PAYABLE_PAYMENT", id: "payment-1" },
    }]);
  });

  it("tetap menunjuk pembayaran yang sama saat nominalnya terbagi ke dua jadwal giro", () => {
    const split = {
      ...expense,
      goodsPurchase: {
        ...expense.goodsPurchase,
        payments: [
          { id: "giro-1", method: "GIRO", amount: "20000", dueDate: date("2026-11-20") },
          { id: "giro-2", method: "GIRO", amount: "80000", dueDate: date("2026-12-15") },
        ],
      },
    };
    const result = build()!({
      storeId: "store-1", month: "2026-11", now: date("2026-11-30"),
      expenses: [split], backdatedPurchases: [],
    });

    expect(result.rows).toMatchObject([
      {
        netAmount: 20_000,
        source: { type: "GOODS_PURCHASE", id: "purchase-1" },
        allocation: { scheduleId: "giro-1" },
        paymentSource: { kind: "SUPPLIER_PAYABLE_PAYMENT", id: "payment-1" },
      },
      {
        netAmount: 10_000,
        source: { type: "GOODS_PURCHASE", id: "purchase-1" },
        allocation: { scheduleId: "giro-2" },
        paymentSource: { kind: "SUPPLIER_PAYABLE_PAYMENT", id: "payment-1" },
      },
    ]);
  });

  it("membedakan pembayaran belanja terdahulu dari sisa utang pembelian yang sama", () => {
    const purchase = {
      id: "old-1", storeId: "store-1", purchaseDate: date("2026-11-01"), dueDate: date("2026-11-20"),
      reference: "GIRO-OLD", amount: "100000", paymentMethod: "GIRO", createdById: "user-1",
      createdByName: "Pengguna", createdAt: date("2026-11-01"),
      payments: [
        { id: "first-payment", amount: "30000", paidAt: date("2026-11-10") },
        { id: "second-payment", amount: "20000", paidAt: date("2026-11-11") },
      ],
    };
    const result = build()!({
      storeId: "store-1", month: "2026-11", now: date("2026-11-30"),
      expenses: [], backdatedPurchases: [purchase],
    });

    expect(result.rows).toMatchObject([
      { source: { type: "BACKDATED_PURCHASE", id: "old-1" }, recognitionKind: "giro_due" },
      {
        source: { type: "BACKDATED_PURCHASE", id: "old-1" },
        paymentSource: { kind: "BACKDATED_PAYMENT", id: "second-payment" },
      },
      {
        source: { type: "BACKDATED_PURCHASE", id: "old-1" },
        paymentSource: { kind: "BACKDATED_PAYMENT", id: "first-payment" },
      },
    ]);
    expect(result.rows[0]).not.toHaveProperty("paymentSource");
  });

  it("menunjukkan transfer awal yang tercatat tanpa menjadikannya ID baris atau jadwal", () => {
    const transfer = {
      ...expense,
      goodsPurchase: {
        ...expense.goodsPurchase, paymentMethod: "TRANSFER", paymentDueDate: null,
        initialTransferAmount: "100000", initialTransferPaidAt: date("2026-11-02"), supplierPayable: null,
        payments: [{ id: "transfer-schedule", method: "TRANSFER", amount: "100000", dueDate: null }],
      },
    };
    const result = build()!({
      storeId: "store-1", month: "2026-11", now: date("2026-11-30"),
      expenses: [transfer], backdatedPurchases: [],
    });

    expect(result.rows).toMatchObject([{
      source: { type: "GOODS_PURCHASE", id: "purchase-1" },
      paymentSource: { kind: "GOODS_INITIAL_TRANSFER", id: "purchase-1" },
    }]);
  });
});

describe("proyeksi pengeluaran keuangan", () => {
  it("memindahkan sisa giro ke jatuh tempo terbaru dan menjaga pembayaran awal", () => {
    const calculate = build();
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;
    const common = { storeId: "store-1", now: new Date("2026-12-31T12:00:00.000Z"), expenses: [expense], backdatedPurchases: [] };
    const november = calculate({ ...common, month: "2026-11" });
    const december = calculate({ ...common, month: "2026-12" });
    expect(november).toMatchObject({ monthlyTotal: 30_000, incomplete: false, rows: [{ netAmount: 30_000, recognitionKind: "giro_payment", source: { type: "GOODS_PURCHASE", id: "purchase-1", number: "PB-1" } }] });
    expect(december).toMatchObject({ monthlyTotal: 70_000, incomplete: false, rows: [{ netAmount: 70_000, recognitionKind: "giro_due" }] });
  });

  it("menandai riwayat giro yang belum diverifikasi sebagai belum lengkap", () => {
    const calculate = build();
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;
    const unknown = { ...expense, goodsPurchase: { ...expense.goodsPurchase, supplierPayable: { ...expense.goodsPurchase.supplierPayable, giroHistoryVerifiedAt: null } } };
    const result = calculate({ storeId: "store-1", month: "2026-11", now: new Date("2026-11-30T12:00:00.000Z"), expenses: [unknown], backdatedPurchases: [] });
    expect(result.incomplete).toBe(true);
    expect(result.monthlyTotal).toBeNull();
  });

  it("menandai bulan sebelum tanggal pengeluaran bila jadwal atau pembayaran yang belum diverifikasi ada di bulan itu", () => {
    const unknown = { ...expense, goodsPurchase: { ...expense.goodsPurchase,
      payments: [{ id: "giro-1", method: "GIRO", amount: "100000.00", dueDate: date("2026-10-15") }],
      supplierPayable: { ...expense.goodsPurchase.supplierPayable, giroHistoryVerifiedAt: null,
        payments: [{ id: "early", amount: "30000.00", paidAt: date("2026-10-10") }] },
    } };
    const result = build()!({ storeId: "store-1", month: "2026-10", now: new Date("2026-11-30T12:00:00Z"), expenses: [unknown], backdatedPurchases: [] });
    expect(result).toMatchObject({ incomplete: true, monthlyTotal: null });
  });

  it("mempertahankan baris yang valid saat nominal jadwal lain tidak sah", () => {
    const invalid = { ...expense, goodsPurchase: { ...expense.goodsPurchase,
      payments: [{ id: "bad", method: "GIRO", amount: "-1.00", dueDate: date("2026-11-20") }],
    } };
    const manual = { ...expense, id: "manual", amount: "20000", goodsPurchaseId: null, shoppingRequestId: null, goodsPurchase: null };
    const result = build()!({ storeId: "store-1", month: "2026-11", now: new Date("2026-11-30T12:00:00Z"), expenses: [invalid, manual], backdatedPurchases: [] });
    expect(result).toMatchObject({ incomplete: true, monthlyTotal: null, rows: [{ netAmount: 20_000, recognitionKind: "manual" }] });
  });

  it("menyediakan tanggal jadwal dan asal alokasi otomatis untuk pembayaran giro", () => {
    const result = build()!({ storeId: "store-1", month: "2026-11", now: new Date("2026-11-30T12:00:00Z"), expenses: [expense], backdatedPurchases: [] });
    expect(result.rows[0]).toMatchObject({ recognitionKind: "giro_payment", allocation: { scheduleId: "giro-1", dueDate: "2026-12-15", source: "automatic" } });
  });
});

describe("komponen pengeluaran", () => {
  it("menjumlahkan pengeluaran manual bersih dan transfer bersama pembayaran giro", () => {
    const calculate = build();
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;
    const manual = { ...expense, id: "manual", goodsPurchaseId: null, shoppingRequestId: null, goodsPurchase: null,
      amount: "22000.00", changeAmount: "2000.00", description: "Pengeluaran manual" };
    const mixed = { ...expense, goodsPurchase: { ...expense.goodsPurchase, paymentMethod: "TRANSFER", paymentDueDate: null,
      payments: [
        { id: "transfer", method: "TRANSFER", amount: "20000.00", dueDate: null },
        { id: "giro", method: "GIRO", amount: "80000.00", dueDate: date("2026-12-15") },
      ],
    } };
    const result = calculate({ storeId: "store-1", month: "2026-11", now: new Date("2026-12-31T12:00:00.000Z"), expenses: [manual, mixed], backdatedPurchases: [] });
    expect(result).toMatchObject({ monthlyTotal: 70_000, incomplete: false,
      components: { manual: 20_000, transfer: 20_000, giroPayment: 30_000, giroDue: 0, overpayment: 0 } });
  });
});

describe("belanja terdahulu dan koreksi", () => {
  it("mengakui pembayaran dan sisa belanja terdahulu pada tanggalnya", () => {
    const calculate = build();
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;
    const purchase = { id: "old-1", storeId: "store-1", purchaseDate: date("2026-10-01"), dueDate: date("2026-12-15"),
      reference: "GIRO-OLD", amount: "100000.00", paymentMethod: "GIRO", createdById: "user-1", createdByName: "Pengguna",
      createdAt: date("2026-11-01"), payments: [
        { id: "early", amount: "30000.00", paidAt: date("2026-11-10") },
        { id: "late", amount: "70000.00", paidAt: date("2026-12-20") },
      ] };
    const common = { storeId: "store-1", now: new Date("2026-12-31T12:00:00.000Z"), expenses: [], backdatedPurchases: [purchase] };
    expect(calculate({ ...common, month: "2026-11" })).toMatchObject({ monthlyTotal: 30_000, incomplete: false });
    expect(calculate({ ...common, month: "2026-12" })).toMatchObject({ monthlyTotal: 70_000, incomplete: false });
  });

  it("mempertahankan kelebihan pembayaran saat koreksi menurunkan nilai pembelian", () => {
    const calculate = build();
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;
    const source = { paymentId: "payment-1", sourceKind: "PAYABLE_PAYMENT", amount: "100000.00", paidAt: "2026-11-10" };
    const allocation = { paymentId: "payment-1", sourceKind: "PAYABLE_PAYMENT", method: "GIRO", amount: "100000.00" };
    const corrected = { ...expense, amount: "70000.00", goodsPurchase: { ...expense.goodsPurchase, totalAmount: "70000.00",
      payments: [{ id: "giro-1", method: "GIRO", amount: "70000.00", dueDate: date("2026-11-30") }],
      supplierPayable: { ...expense.goodsPurchase.supplierPayable, payments: [{ id: "payment-1", amount: "100000.00", paidAt: date("2026-11-10") }] },
      shoppingRequest: { corrections: [{ afterSnapshot: { paymentSnapshot: { sources: [source], allocations: [allocation] } },
        allocations: [{ ...allocation, sourceAmount: "100000.00", paidAt: date("2026-11-10") }] }] },
    } };
    const result = calculate({ storeId: "store-1", month: "2026-11", now: new Date("2026-11-20T12:00:00.000Z"), expenses: [corrected], backdatedPurchases: [] });
    expect(result).toMatchObject({ monthlyTotal: 100_000, incomplete: false,
      components: { giroPayment: 70_000, overpayment: 30_000 } });
  });
});

describe("pembacaan pengeluaran per toko", () => {
  it("hanya menghitung data toko yang diminta", async () => {
    const load = (finance as { loadRecognizedExpenses?: (storeId: string, month: string, now: Date) => Promise<Result> }).loadRecognizedExpenses;
    expect(load).toBeTypeOf("function");
    if (!load) return;
    mocks.expenses.mockImplementation(async ({ where }: { where: { storeId: string } }) =>
      [expense, { ...expense, id: "other", storeId: "store-2" }].filter(row => row.storeId === where.storeId));
    mocks.backdated.mockResolvedValue([]);
    const result = await load("store-1", "2026-11", new Date("2026-12-31T12:00:00.000Z"));
    expect(result.monthlyTotal).toBe(30_000);
  });

  it("membatasi belanja terdahulu pada jatuh tempo atau pembayaran di bulan yang dipilih", async () => {
    mocks.expenses.mockResolvedValue([]);
    mocks.backdated.mockResolvedValue([]);
    await finance.loadRecognizedExpenses("store-1", "2026-11", new Date("2026-11-30T12:00:00Z"));
    expect(mocks.backdated).toHaveBeenCalledWith(expect.objectContaining({ where: {
      storeId: "store-1",
      cancelledAt: null,
      OR: [
        { dueDate: { gte: date("2026-11-01"), lt: date("2026-12-01") } },
        { payments: { some: { paidAt: { gte: date("2026-11-01"), lt: date("2026-12-01") }, cancelledAt: null } } },
      ],
    } }));
  });

  it("tidak meminta seluruh pembelian terkait tanpa batas tanggal", async () => {
    mocks.expenses.mockResolvedValue([]);
    mocks.backdated.mockResolvedValue([]);
    await finance.loadRecognizedExpenses("store-1", "2026-11", new Date("2026-11-30T12:00:00Z"));
    const where = mocks.expenses.mock.calls.at(-1)![0].where;
    expect(where.OR).not.toContainEqual({ goodsPurchaseId: { not: null } });
    expect(where.OR).not.toContainEqual({ shoppingRequestId: { not: null } });
    expect(JSON.stringify(where)).toContain("dueDate");
    expect(JSON.stringify(where)).toContain("paidAt");
    const purchaseFilter = where.OR.find((row: { goodsPurchase?: unknown }) => row.goodsPurchase)?.goodsPurchase.is;
    expect(purchaseFilter.OR).toEqual(expect.arrayContaining([
      { payments: { some: { dueDate: { gte: date("2026-11-01"), lt: date("2026-12-01") } } } },
      { supplierPayable: { is: { payments: { some: { paidAt: { gte: date("2026-11-01"), lt: date("2026-12-01") } } } } } },
      { supplierPayable: { is: { giroHistoryVerifiedAt: null } } },
      { shoppingRequest: { is: { corrections: { some: {} } } } },
    ]));
  });
});

describe("validasi sumber pembayaran koreksi", () => {
  it("mengakui nominal dan tanggal yang dikoreksi secara eksplisit serta pembayaran baru setelah audit", () => {
    const transfer = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", amount: "40000.00", paidAt: "2026-11-12" };
    const giro = { paymentId: "payment-1", sourceKind: "PAYABLE_PAYMENT", amount: "20000.00", paidAt: "2026-11-16" };
    const allocations = [{ ...transfer, method: "TRANSFER" }, { ...giro, method: "GIRO" }].map(({ paidAt: _paidAt, ...row }) => row);
    const snapshot = { sources: [transfer, giro], allocations };
    const stored = allocations.map(row => ({ ...row, sourceAmount: row.amount, paidAt: date(row.paymentId === "expense-1" ? transfer.paidAt : giro.paidAt) }));
    const previous = { afterSnapshot: { data: { payment: { corrections: [transfer, giro] } }, paymentSnapshot: snapshot }, allocations: stored };
    const latest = { afterSnapshot: { data: { payment: { corrections: [] } }, paymentSnapshot: snapshot }, allocations: stored };
    const corrected = { ...expense, goodsPurchase: { ...expense.goodsPurchase, paymentMethod: null, paymentDueDate: date("2026-12-15"),
      initialTransferAmount: "100000.00", initialTransferPaidAt: date("2026-11-10"),
      payments: [{ id: "transfer", method: "TRANSFER", amount: "40000.00", dueDate: null }, { id: "giro-1", method: "GIRO", amount: "60000.00", dueDate: date("2026-12-15") }],
      supplierPayable: { ...expense.goodsPurchase.supplierPayable, payments: [{ id: "payment-1", amount: "30000.00", paidAt: date("2026-11-10") }, { id: "new-payment", amount: "5000.00", paidAt: date("2026-11-18") }] },
      shoppingRequest: { corrections: [latest, previous] },
    } };
    const result = build()!({ storeId: "store-1", month: "2026-11", now: new Date("2026-11-20T12:00:00Z"), expenses: [corrected], backdatedPurchases: [] });
    expect(result).toMatchObject({ incomplete: false, monthlyTotal: 65000, components: { transfer: 40000, giroPayment: 25000 } });
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ netAmount: 40000, occurredAt: "2026-11-11T17:00:00.000Z" }),
      expect.objectContaining({ netAmount: 20000, occurredAt: "2026-11-15T17:00:00.000Z" }),
      expect.objectContaining({ netAmount: 5000, occurredAt: "2026-11-17T17:00:00.000Z" }),
    ]));
  });
  it("menolak snapshot yang tidak cocok dengan koreksi eksplisit terakhir", () => {
    const source = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", amount: "40000.00", paidAt: "2026-11-12" };
    const allocation = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", method: "TRANSFER", amount: "40000.00" };
    const corrupted = { ...expense, goodsPurchase: { ...expense.goodsPurchase, paymentMethod: "TRANSFER", paymentDueDate: null,
      initialTransferAmount: "100000.00", initialTransferPaidAt: date("2026-11-10"),
      payments: [{ id: "transfer", method: "TRANSFER", amount: "100000.00", dueDate: null }], supplierPayable: null,
      shoppingRequest: { corrections: [{ afterSnapshot: { data: { payment: { corrections: [{ ...source, amount: "50000.00" }] } }, paymentSnapshot: { sources: [source], allocations: [allocation] } },
        allocations: [{ ...allocation, sourceAmount: source.amount, paidAt: date(source.paidAt) }] }] },
    } };
    expect(build()!({ storeId: "store-1", month: "2026-11", now: new Date("2026-11-20T12:00:00Z"), expenses: [corrupted], backdatedPurchases: [] }))
      .toMatchObject({ incomplete: true, monthlyTotal: null, rows: [] });
  });
  it("menandai riwayat giro belum diverifikasi meski jadwal dikoreksi menjadi transfer", () => {
    const calculate = build()!;
    const corrected = { ...expense, goodsPurchase: { ...expense.goodsPurchase, paymentMethod: "TRANSFER", paymentDueDate: null,
      initialTransferAmount: "0", payments: [{ id: "transfer", method: "TRANSFER", amount: "100000.00", dueDate: null }],
      supplierPayable: { ...expense.goodsPurchase.supplierPayable, giroHistoryVerifiedAt: null },
    } };
    const result = calculate({ storeId: "store-1", month: "2026-11", now: new Date("2026-11-20T12:00:00.000Z"), expenses: [corrected], backdatedPurchases: [] });
    expect(result).toMatchObject({ incomplete: true, monthlyTotal: null });
  });

  it("menampilkan sumber transfer yang dialokasikan ke giro sesuai pembayaran aslinya", () => {
    const calculate = build()!;
    const source = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", amount: "100000.00", paidAt: "2026-11-10" };
    const allocation = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", method: "GIRO", amount: "100000.00" };
    const corrected = { ...expense, amount: "70000.00", goodsPurchase: { ...expense.goodsPurchase, totalAmount: "70000.00",
      initialTransferAmount: "100000.00", initialTransferPaidAt: date("2026-11-10"),
      payments: [{ id: "giro-1", method: "GIRO", amount: "70000.00", dueDate: date("2026-11-30") }],
      supplierPayable: { ...expense.goodsPurchase.supplierPayable, payments: [] },
      shoppingRequest: { corrections: [{ afterSnapshot: { paymentSnapshot: { sources: [source], allocations: [allocation] } },
        allocations: [{ ...allocation, sourceAmount: "100000.00", paidAt: date("2026-11-10") }] }] },
    } };
    const result = calculate({ storeId: "store-1", month: "2026-11", now: new Date("2026-11-20T12:00:00.000Z"), expenses: [corrected], backdatedPurchases: [] });
    expect(result).toMatchObject({ monthlyTotal: 100_000, incomplete: false,
      components: { transfer: 70_000, giroPayment: 0, overpayment: 30_000 } });
  });

  it("tidak mempercayai sumber transfer koreksi yang berbeda dari pembayaran awal tersimpan", () => {
    const calculate = build()!;
    const source = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", amount: "100000.00", paidAt: "2026-11-10" };
    const allocation = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", method: "TRANSFER", amount: "100000.00" };
    const corrupted = { ...expense, goodsPurchase: { ...expense.goodsPurchase, paymentMethod: "TRANSFER", paymentDueDate: null,
      initialTransferAmount: "50000.00", initialTransferPaidAt: date("2026-11-10"),
      payments: [{ id: "transfer", method: "TRANSFER", amount: "100000.00", dueDate: null }], supplierPayable: null,
      shoppingRequest: { corrections: [{ afterSnapshot: { paymentSnapshot: { sources: [source], allocations: [allocation] } },
        allocations: [{ ...allocation, sourceAmount: "100000.00", paidAt: date("2026-11-10") }] }] },
    } };
    const result = calculate({ storeId: "store-1", month: "2026-11", now: new Date("2026-11-20T12:00:00.000Z"), expenses: [corrupted], backdatedPurchases: [] });
    expect(result).toMatchObject({ incomplete: true, monthlyTotal: null, rows: [] });
  });

  it("tidak menggunakan pembayaran hutang milik toko lain dalam koreksi transfer", () => {
    const calculate = build();
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;
    const source = { paymentId: "foreign", sourceKind: "PAYABLE_PAYMENT", amount: "100000.00", paidAt: "2026-11-10" };
    const allocation = { paymentId: "foreign", sourceKind: "PAYABLE_PAYMENT", method: "TRANSFER", amount: "100000.00" };
    const corrupted = { ...expense, goodsPurchase: { ...expense.goodsPurchase, paymentMethod: "TRANSFER", paymentDueDate: null,
      payments: [{ id: "transfer", method: "TRANSFER", amount: "100000.00", dueDate: null }],
      supplierPayable: { storeId: "store-2", giroHistoryVerifiedAt: date("2026-11-01"), payments: [{ id: "foreign", amount: "100000.00", paidAt: date("2026-11-10") }] },
      shoppingRequest: { corrections: [{ afterSnapshot: { paymentSnapshot: { sources: [source], allocations: [allocation] } },
        allocations: [{ ...allocation, sourceAmount: "100000.00", paidAt: date("2026-11-10") }] }] },
    } };
    const result = calculate({ storeId: "store-1", month: "2026-11", now: new Date("2026-11-20T12:00:00.000Z"), expenses: [corrupted], backdatedPurchases: [] });
    expect(result).toMatchObject({ incomplete: true, monthlyTotal: null, rows: [] });
  });
});

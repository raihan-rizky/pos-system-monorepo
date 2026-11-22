import { describe, expect, it } from "vitest";
import { buildManualPayableReport } from "../manual-payable-report";

const debt = {
  id: "debt-1", storeId: "store-1", supplierName: "Pemasok", amountCents: 100_000,
  debtDate: "2026-11-01", dueDate: "2026-11-03", category: "ATK" as const, payments: [],
};
const base = { storeId: "store-1", todayWib: "2026-11-16", from: "2026-11-01", to: "2026-11-16", payables: [debt], transfers: [] };

describe("perhitungan laporan hutang dan alokasi transfer", () => {
  it("mempertahankan tanggal pembayaran lama dan melunasi sisanya pada jatuh tempo", () => {
    const result = buildManualPayableReport({ ...base, payables: [{ ...debt, payments: [
      { id: "late", amountCents: 40_000, paidAt: "2026-11-05", origin: "MANUAL" },
    ] }] });
    expect(result.payments).toMatchObject([
      { id: "auto:debt-1", date: "2026-11-03", amountCents: 60_000, category: "ATK", origin: "AUTO" },
      { id: "late", date: "2026-11-05", amountCents: 40_000, category: "ATK", origin: "MANUAL" },
    ]);
  });

  it("menghitung saldo pada akhir periode tanpa memajukan pembayaran manual yang lebih belakangan", () => {
    const result = buildManualPayableReport({ ...base, to: "2026-11-03", payables: [{ ...debt, payments: [
      { id: "late", amountCents: 40_000, paidAt: "2026-11-05", origin: "MANUAL" },
    ] }] });
    expect(result.balances).toMatchObject([{ id: "debt-1", amountCents: 40_000 }]);
    expect(result.payments).toMatchObject([{ id: "auto:debt-1", amountCents: 60_000 }]);
  });

  it("tidak melunasi hutang tanpa jatuh tempo atau jatuh tempo mendatang", () => {
    const result = buildManualPayableReport({ ...base, payables: [{ ...debt, dueDate: null }, { ...debt, id: "future", dueDate: "2026-11-17" }] });
    expect(result.payments).toEqual([]);
  });

  it("membagi satu transfer menurut kategori hutang dan sisanya menurut kategori transfer", () => {
    const atk = { ...debt, dueDate: null, amountCents: 10_000, payments: [{ id: "p1", amountCents: 10_000, paidAt: "2026-11-05", origin: "MANUAL" as const }] };
    const spanduk = { ...debt, id: "debt-2", dueDate: null, amountCents: 20_000, category: "SPANDUK" as const, payments: [{ id: "p2", amountCents: 20_000, paidAt: "2026-11-05", origin: "MANUAL" as const }] };
    const result = buildManualPayableReport({ ...base, payables: [atk, spanduk], transfers: [{
      id: "transfer-1", storeId: "store-1", date: "2026-11-05", amountCents: 35_000, category: "SALARY",
      allocations: [{ paymentId: "p1", payableId: "debt-1", amountCents: 10_000 }, { paymentId: "p2", payableId: "debt-2", amountCents: 20_000 }],
    }] });
    expect(result.payments).toEqual([]);
    expect(result.transfers).toEqual([{ id: "transfer-1", segments: [
      { paymentId: "p1", category: "ATK", amountCents: 10_000 },
      { paymentId: "p2", category: "SPANDUK", amountCents: 20_000 },
      { paymentId: null, category: "SALARY", amountCents: 5_000 },
    ] }]);
  });

  it("menghitung bagian pembayaran yang belum dialokasikan sebagai pengeluaran terpisah", () => {
    const result = buildManualPayableReport({ ...base, payables: [{ ...debt, dueDate: null, payments: [{ id: "p1", amountCents: 10_001, paidAt: "2026-11-05", origin: "MANUAL" }] }], transfers: [{
      id: "transfer-1", storeId: "store-1", date: "2026-11-05", amountCents: 6_000, category: "SALARY", allocations: [{ paymentId: "p1", payableId: "debt-1", amountCents: 6_000 }],
    }] });
    expect(result.payments).toMatchObject([{ id: "p1", amountCents: 4_001, category: "ATK" }]);
    expect(result.transfers[0].segments).toMatchObject([{ paymentId: "p1", amountCents: 6_000, category: "ATK" }]);
  });

  it("menolak alokasi lintas toko, pembayaran yang tidak cocok, tanggal berbeda, dan nominal berlebih", () => {
    const transfer = { id: "t", storeId: "store-1", date: "2026-11-05", amountCents: 100, category: "ATK" as const, allocations: [{ paymentId: "p", payableId: "debt-1", amountCents: 100 }] };
    const payable = { ...debt, dueDate: null, payments: [{ id: "p", amountCents: 100, paidAt: "2026-11-05", origin: "MANUAL" as const }] };
    for (const bad of [
      { ...transfer, storeId: "other" },
      { ...transfer, date: "2026-11-06" },
      { ...transfer, allocations: [{ ...transfer.allocations[0], payableId: "other" }] },
      { ...transfer, allocations: [{ ...transfer.allocations[0], amountCents: 101 }] },
    ]) expect(() => buildManualPayableReport({ ...base, payables: [payable], transfers: [bad] })).toThrow();
  });

  it("menolak hubungan transfer yang tidak termasuk periode laporan", () => {
    const payable = { ...debt, dueDate: null, payments: [{ id: "p", amountCents: 100, paidAt: "2026-11-05", origin: "MANUAL" as const }] };
    expect(() => buildManualPayableReport({ ...base, from: "2026-11-01", to: "2026-11-03", payables: [payable], transfers: [{
      id: "t", storeId: "store-1", date: "2026-11-05", amountCents: 100, category: "ATK", allocations: [{ paymentId: "p", payableId: "debt-1", amountCents: 100 }],
    }] })).toThrow();
  });
});

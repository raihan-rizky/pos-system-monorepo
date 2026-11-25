import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMonthlyWorkbook } from '../../helpers/monthly-workbook';
import { getMonthlyFinancialReport } from '../monthly-report';

const db = vi.hoisted(() => ({
  transaction: { findMany: vi.fn() },
  expense: { findMany: vi.fn() },
  customerReceivable: { findMany: vi.fn() },
  backdatedPurchase: { findMany: vi.fn() },
  manualIncome: { findMany: vi.fn() },
  supplierPayable: { findMany: vi.fn() },
}));
vi.mock('@pos/db', async importOriginal => ({
  Prisma: (await importOriginal<typeof import('@pos/db')>()).Prisma,
  db: { $transaction: async (read: (client: typeof db) => unknown) => read(db) },
}));
vi.mock('../monthly-balances', () => ({ getMonthlyBalances: async () => ({ supplierDebts: [], supplierDebtBalance: 0 }) }));
vi.mock('@/features/keuangan/repositories/expense-correction-cash-repository', () => ({
  loadExpenseCorrectionCash: async () => ({ outflow: [], refunds: [] }),
}));

const storeId = 'store-test';
const now = new Date('2026-12-06T10:00:00+07:00');

function report(month: number) {
  return getMonthlyFinancialReport(storeId, 2026, month, now, { basis: 'keuangan' });
}

describe('ekspor bulanan mengikuti periode Keuangan', () => {
  beforeEach(() => {
    Object.values(db).forEach(model => model.findMany.mockReset().mockResolvedValue([]));
  });

  it('mencatat pembayaran awal berdasarkan tanggal nota pada ringkasan dan rincian pendapatan', async () => {
    const received = new Date('2026-11-07T09:13:25+07:00');
    db.transaction.findMany.mockResolvedValue([{
      id: 'nota', invoiceNumber: 'INV-TEST', invoiceDate: new Date('2026-06-06T09:13:00+07:00'),
      createdAt: received, status: 'COMPLETED', paymentMethod: 'TRANSFER', total: 630_000, amountPaid: 630_000,
      change: 0, transactionCategory: 'ATK', items: [], debtPaymentLogs: [],
      payments: [{ id: 'payment', method: 'TRANSFER', createdAt: received, amount: 630_000 }],
    }]);

    const november = await report(11);
    const june = await report(6);
    expect(buildMonthlyWorkbook(november).Sheets['LAP KEU'].E24.v).toBe(0);
    expect(november.income).toEqual([]);
    expect(buildMonthlyWorkbook(june).Sheets['LAP KEU'].E24.v).toBe(630_000);
    expect(june.income).toEqual([expect.objectContaining({
      reference: 'INV-TEST', date: '2026-06-06', amounts: expect.objectContaining({ ATK: 630_000 }),
    })]);
  });

  it('membagi pengeluaran giro dan kelebihan bayar ke tanggal pengakuan masing-masing', async () => {
    const paidAt = new Date('2026-11-17T00:00:00Z');
    const dueDate = new Date('2026-11-21T00:00:00Z');
    const source = { sourceKind: 'TRANSFER_EXPENSE', paymentId: 'expense', amount: '8936156.00', paidAt: '2026-11-17' };
    const allocation = { sourceKind: source.sourceKind, paymentId: source.paymentId, amount: source.amount, method: 'TRANSFER' };
    const purchase = {
      id: 'purchase', number: 'PB-TEST', storeId, status: 'APPROVED', statusBeforeCancellation: null,
      totalAmount: 8_930_001.24, paymentMethod: 'GIRO', paymentDueDate: dueDate,
      initialTransferAmount: 8_936_156, initialTransferPaidAt: paidAt, supplierNameSnapshot: 'Pemasok',
      payments: [
        { id: 'due-november', method: 'GIRO', amount: 4_947_500, dueDate },
        { id: 'due-december', method: 'GIRO', amount: 3_982_501.24, dueDate: new Date('2026-12-05T00:00:00Z') },
      ],
      supplierPayable: { id: 'payable', storeId, debtDate: paidAt, giroHistoryVerifiedAt: paidAt, payments: [] },
      shoppingRequest: { corrections: [{
        afterSnapshot: { paymentSnapshot: { sources: [source], allocations: [allocation] } },
        allocations: [{ ...allocation, sourceAmount: source.amount, paidAt }],
      }] },
    };
    db.expense.findMany.mockImplementation(async ({ where }) => where.manualTransferAllocations ? [] : [{
      id: 'expense', category: 'SUPPLIES', amount: 8_930_001.24, changeAmount: 0, storeId,
      occurredAt: new Date('2026-11-17T10:00:00+07:00'), createdAt: paidAt,
      description: 'Belanja uji', goodsPurchaseId: purchase.id, goodsPurchase: purchase,
      shoppingRequestId: null, manualPurchasePaymentMethod: null,
    }]);

    const november = await report(11);
    const december = await report(12);
    const workbook = buildMonthlyWorkbook(november);
    expect(workbook.Sheets['LAP KEU'].E26.v).toBe(4_953_654.76);
    expect(workbook.Sheets.NOVEMBER.K25.v).toBe(6_154.76);
    expect(workbook.Sheets.NOVEMBER.K29.v).toBe(4_947_500);
    expect(workbook.Sheets.NOVEMBER.K39.v).toBe(4_953_654.76);
    expect(november.purchasePayments).toEqual([
      expect.objectContaining({ date: '2026-11-17', amount: 6_154.76 }),
      expect.objectContaining({ date: '2026-11-21', paidAt: '2026-11-17', amount: 4_947_500 }),
    ]);
    expect(buildMonthlyWorkbook(december).Sheets['LAP KEU'].E26.v).toBe(3_982_501.24);
    expect(december.purchasePayments).toEqual([expect.objectContaining({ date: '2026-12-05', amount: 3_982_501.24 })]);
  });
});

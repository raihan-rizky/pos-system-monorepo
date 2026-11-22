import { describe, expect, it, vi } from 'vitest';
import { postGiroPayment, readPendingGiroPayment } from '../giro-payment-request';

const scope = { storeId: 'store-1', userId: 'user-1', payableId: 'debt-1' };
const draft = { amount: '300.00', paidAt: '2026-10-10', expectedBalance: '1000.00', expectedLedgerVersion: '15' };
const lock = async (_name: string, operation: () => Promise<void>) => operation();
function storage() {
  const records = new Map<string, string>();
  return { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); }, removeItem: (key: string) => { records.delete(key); } };
}

describe('server ledger version in saved payment requests', () => {
  it('retains the exact version in storage and in a retry after a lost response', async () => {
    const saved = storage();
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 201 }));
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => 'b14f880a-fb50-43bc-a2aa-4733c8811dad', lock)).rejects.toThrow();
    expect(readPendingGiroPayment(saved, scope)).toMatchObject({ expectedLedgerVersion: '15' });
    await postGiroPayment(saved, scope, draft, fetcher, () => 'unused', lock);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ expectedLedgerVersion: '15' });
  });

  it('prevents a pending request from being retried with a different version', async () => {
    const saved = storage();
    const fetcher = vi.fn().mockRejectedValue(new Error('lost'));
    await expect(postGiroPayment(saved, scope, draft, fetcher, () => 'b14f880a-fb50-43bc-a2aa-4733c8811dad', lock)).rejects.toThrow();
    await expect(postGiroPayment(saved, scope, { ...draft, expectedLedgerVersion: '16' }, fetcher, () => 'unused', lock)).rejects.toThrow(/pembayaran sebelumnya/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reserves a new request before payment and safely retries a lost reservation response', async () => {
    const saved = storage();
    const versioned = { ...draft, resource: 'MANUAL' as const };
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ reserved: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 201 }));
    await expect(postGiroPayment(saved, scope, versioned, fetcher, () => 'b14f880a-fb50-43bc-a2aa-4733c8811dad', lock)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain('reserve=1');
    expect(readPendingGiroPayment(saved, scope)).toMatchObject({ resource: 'MANUAL' });
    await postGiroPayment(saved, scope, versioned, fetcher, () => 'unused', lock);
    expect(String(fetcher.mock.calls[1][0])).toContain('reserve=1');
    expect(String(fetcher.mock.calls[2][0])).not.toContain('reserve=1');
    expect(readPendingGiroPayment(saved, scope)).toBeNull();
  });

  it('uses the registered original scope to resolve a stale payment after its debt changes type', async () => {
    const saved = storage();
    const versioned = { ...draft, resource: 'MANUAL' as const };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ reserved: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'BalanceChanged', message: 'Saldo berubah.' }), { status: 409 }));
    await expect(postGiroPayment(saved, scope, versioned, fetcher, () => 'b14f880a-fb50-43bc-a2aa-4733c8811dad', lock)).rejects.toMatchObject({ refreshBalance: true });
    expect(String(fetcher.mock.calls[2][0])).toContain('resolve=1');
    expect(readPendingGiroPayment(saved, scope)).toBeNull();
  });

  it('resolves an unregistered attempt after its debt changed type even when both permissions exist', async () => {
    const saved = storage();
    const versioned = { ...draft, resource: 'MANUAL' as const };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code:'Conflict' }), { status:409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code:'BalanceChanged', message:'Saldo berubah.' }), { status:409 }));
    await expect(postGiroPayment(saved, scope, versioned, fetcher, () => 'b14f880a-fb50-43bc-a2aa-4733c8811dad', lock)).rejects.toMatchObject({ refreshBalance:true });
    expect(String(fetcher.mock.calls[1][0])).toContain('resolve=1');
    expect(readPendingGiroPayment(saved, scope)).toBeNull();
  });
});

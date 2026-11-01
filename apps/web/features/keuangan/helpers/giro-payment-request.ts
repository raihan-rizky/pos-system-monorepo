import { parseAmount, validDate } from './supplier-payable-input';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type GiroPaymentScope = { storeId: string; userId: string; payableId: string };
export type GiroPaymentDraft = { amount: string; paidAt: string; expectedBalance?: string };
export type PendingGiroPayment = GiroPaymentDraft & { key: string };

export const giroPaymentStorageKey = (scope: GiroPaymentScope) => `giro-payment:${JSON.stringify([scope.storeId, scope.userId, scope.payableId])}`;
const uncertainMessage = 'Hasil pembayaran belum dapat dipastikan. Gunakan “Pastikan pembayaran” untuk memeriksa kembali.';
export type WithLock = (name: string, operation: () => Promise<void>, signal?: AbortSignal) => Promise<void>;

export class GiroPaymentError extends Error {
  readonly refreshBalance = true;
}

async function withBrowserLock(name: string, operation: () => Promise<void>, signal?: AbortSignal): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    throw new Error('Peramban tidak mendukung penguncian pembayaran. Gunakan peramban terbaru dan periksa riwayat giro.');
  }
  await navigator.locks.request(name, { mode: 'exclusive', ...(signal ? { signal } : {}) }, operation);
}

export function readPendingGiroPayment(storage: StorageLike, scope: GiroPaymentScope): PendingGiroPayment | null {
  let raw: string | null;
  try { raw = storage.getItem(giroPaymentStorageKey(scope)); }
  catch { throw new Error('Penyimpanan pembayaran tidak tersedia. Periksa pengaturan peramban.'); }
  if (raw === null && typeof window !== 'undefined') {
    try {
      const legacyKey = `giro-payment:${scope.payableId}`;
      const legacy = window.sessionStorage.getItem(legacyKey);
      if (legacy !== null) {
        storage.setItem(giroPaymentStorageKey(scope), legacy);
        window.sessionStorage.removeItem(legacyKey);
        raw = legacy;
      }
    } catch { throw new Error('Penyimpanan pembayaran tidak tersedia. Periksa pengaturan peramban.'); }
  }
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object') {
      const entry = value as Record<string, unknown>;
      if (typeof entry.key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.key)
        && typeof entry.amount === 'string' && parseAmount(entry.amount) && validDate(entry.paidAt)
        && (entry.expectedBalance === undefined || (typeof entry.expectedBalance === 'string' && parseAmount(entry.expectedBalance)))) {
        return { key: entry.key, amount: entry.amount, paidAt: entry.paidAt, ...(typeof entry.expectedBalance === 'string' ? { expectedBalance: entry.expectedBalance } : {}) };
      }
    }
  } catch { /* The record must not be replaced if it cannot be read. */ }
  throw new Error('Data pembayaran sebelumnya tidak dapat dibaca. Hubungi pengelola untuk memeriksa pembayaran.');
}

export async function postGiroPayment(
  storage: StorageLike,
  scope: GiroPaymentScope,
  draft: GiroPaymentDraft,
  fetcher: typeof fetch = fetch,
  createKey: () => string = () => crypto.randomUUID(),
  withLock: WithLock = withBrowserLock,
  signal?: AbortSignal,
): Promise<void> {
  await withLock(`giro-payment:${JSON.stringify([scope.storeId, scope.payableId])}`, async () => {
    if (signal?.aborted) throw new DOMException('Dialog ditutup.', 'AbortError');
    let pending = readPendingGiroPayment(storage, scope);
    if (pending && (pending.amount !== draft.amount || pending.paidAt !== draft.paidAt || pending.expectedBalance !== draft.expectedBalance)) {
      throw new Error('Pastikan pembayaran sebelumnya sebelum mengubah nominal atau tanggal.');
    }
    if (!pending) {
      if (!parseAmount(draft.amount) || !validDate(draft.paidAt) || !parseAmount(draft.expectedBalance)) throw new Error('Periksa nominal dan tanggal pembayaran.');
      try {
        pending = { key: createKey(), ...draft };
        storage.setItem(giroPaymentStorageKey(scope), JSON.stringify(pending));
      } catch { throw new Error('Penyimpanan pembayaran tidak tersedia. Periksa pengaturan peramban.'); }
    }
    let response: Response;
    try {
      response = await fetcher(`/api/finance/supplier-payables/${encodeURIComponent(scope.payableId)}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.key },
        body: JSON.stringify({ amount: pending.amount, paidAt: pending.paidAt, expectedBalance: pending.expectedBalance }),
      });
    } catch { throw new Error(uncertainMessage); }
    const body = await response.json().catch(() => null) as { success?: boolean; message?: string; code?: string } | null;
    if (response.ok && body?.success === true) {
      try { storage.removeItem(giroPaymentStorageKey(scope)); }
      catch { throw new Error(uncertainMessage); }
      return;
    }
    if (response.status === 422 || (response.status === 409 && body?.code === 'BalanceChanged')) {
      try { storage.removeItem(giroPaymentStorageKey(scope)); }
      catch { throw new Error(uncertainMessage); }
      throw new GiroPaymentError(body?.message || 'Periksa nominal dan tanggal pembayaran.');
    }
    if (response.status === 409) throw new GiroPaymentError(body?.message || 'Pembayaran perlu diperiksa kembali.');
    throw new Error(uncertainMessage);
  }, signal);
}

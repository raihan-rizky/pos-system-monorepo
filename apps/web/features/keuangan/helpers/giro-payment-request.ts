import { parseAmount, validDate } from './supplier-payable-input';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type GiroPaymentScope = { storeId: string; userId: string; payableId: string };
export type GiroPaymentDraft = { amount: string; paidAt: string; expectedBalance?: string; expectedLedgerVersion?: string; resource?: 'MANUAL' | 'GIRO' };
export type PendingGiroPayment = GiroPaymentDraft & { key: string };
export type LegacyGiroPayment = { payableId: string; raw: string; pending: PendingGiroPayment | null };
export type PostGiroPaymentOptions = { recoverLegacy?: boolean; expectedLegacyRaw?: string };

export const giroPaymentStorageKey = (scope: GiroPaymentScope) => `giro-payment:${JSON.stringify([scope.storeId, scope.userId, scope.payableId])}`;
const giroPaymentGenerationKey = (scope: Pick<GiroPaymentScope, 'storeId'>) => `giro-payment-generation:${JSON.stringify([scope.storeId])}`;
export const GIRO_PAYMENT_CHANGE_EVENT = 'giro-payment-change';
function notifyPaymentChange() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(GIRO_PAYMENT_CHANGE_EVENT)); }
const uncertainMessage = 'Hasil pembayaran belum dapat dipastikan. Gunakan “Pastikan pembayaran” untuk memeriksa kembali.';
export type WithLock = (name: string, operation: () => Promise<void>, signal?: AbortSignal) => Promise<void>;

export class GiroPaymentError extends Error {
  readonly refreshBalance = true;
}

function parsePendingGiroPayment(raw: string): PendingGiroPayment {
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object') {
      const entry = value as Record<string, unknown>;
      if (typeof entry.key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.key)
        && typeof entry.amount === 'string' && parseAmount(entry.amount) && validDate(entry.paidAt)
        && (entry.expectedBalance === undefined || (typeof entry.expectedBalance === 'string' && parseAmount(entry.expectedBalance)))
        && (entry.expectedLedgerVersion === undefined || (typeof entry.expectedLedgerVersion === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(entry.expectedLedgerVersion)))
        && (entry.resource === undefined || entry.resource === 'MANUAL' || entry.resource === 'GIRO')) {
        return {
          key: entry.key,
          amount: entry.amount,
          paidAt: entry.paidAt as string,
          ...(typeof entry.expectedBalance === 'string' ? { expectedBalance: entry.expectedBalance } : {}),
          ...(typeof entry.expectedLedgerVersion === 'string' ? { expectedLedgerVersion: entry.expectedLedgerVersion } : {}),
          ...(entry.resource === 'MANUAL' || entry.resource === 'GIRO' ? { resource: entry.resource } : {}),
        };
      }
    }
  } catch { /* Keep unreadable records available for explicit review. */ }
  throw new Error('Data pembayaran sebelumnya tidak dapat dibaca. Hubungi pengelola untuk memeriksa pembayaran.');
}

export function readGiroPaymentGeneration(storage: StorageLike, scope: Pick<GiroPaymentScope, 'storeId'>): string | null {
  try { return storage.getItem(giroPaymentGenerationKey(scope)); }
  catch { throw new Error('Penyimpanan pembayaran tidak tersedia. Periksa pengaturan peramban.'); }
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
  if (raw === null) return null;
  return parsePendingGiroPayment(raw);
}

export function listLegacyGiroPayments(storage: Storage): LegacyGiroPayment[] {
  const results: LegacyGiroPayment[] = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith('giro-payment:')) continue;
      const payableId = key.slice('giro-payment:'.length);
      if (!payableId || payableId.startsWith('[')) continue;
      const raw = storage.getItem(key);
      if (raw === null) continue;
      let pending: PendingGiroPayment | null;
      try { pending = parsePendingGiroPayment(raw); }
      catch { pending = null; }
      results.push({ payableId, raw, pending });
    }
    return results;
  } catch { throw new Error('Penyimpanan pembayaran tidak tersedia. Periksa pengaturan peramban.'); }
}

export function removeLegacyGiroPayment(storage: Storage, record: LegacyGiroPayment): boolean {
  const key = `giro-payment:${record.payableId}`;
  try {
    if (storage.getItem(key) !== record.raw) return false;
    storage.removeItem(key);
    return true;
  } catch { throw new Error('Penyimpanan pembayaran tidak tersedia. Periksa pengaturan peramban.'); }
}

export function listPendingGiroPayments(storage: Storage, scope: Pick<GiroPaymentScope, 'storeId' | 'userId'>): Record<string, PendingGiroPayment> {
  const result: Record<string, PendingGiroPayment> = {};
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith('giro-payment:[')) continue;
      let parts: unknown;
      try { parts = JSON.parse(key.slice('giro-payment:'.length)); } catch { continue; }
      if (!Array.isArray(parts) || parts.length !== 3 || parts[0] !== scope.storeId || parts[1] !== scope.userId || typeof parts[2] !== 'string') continue;
      const pending = readPendingGiroPayment(storage, { ...scope, payableId: parts[2] });
      if (pending) result[parts[2]] = pending;
    }
    return result;
  } catch { throw new Error('Penyimpanan pembayaran tidak tersedia. Periksa pengaturan peramban.'); }
}

export async function postGiroPayment(
  storage: StorageLike,
  scope: GiroPaymentScope,
  draft: GiroPaymentDraft,
  fetcher: typeof fetch = fetch,
  createKey: () => string = () => crypto.randomUUID(),
  withLock: WithLock = withBrowserLock,
  signal?: AbortSignal,
  expectedPendingKey?: string,
  expectedGeneration?: string | null,
  options: PostGiroPaymentOptions = {},
): Promise<void> {
  await withLock(`giro-payment:${JSON.stringify([scope.storeId, scope.payableId])}`, async () => {
    if (signal?.aborted) throw new DOMException('Dialog ditutup.', 'AbortError');
    let pending = readPendingGiroPayment(storage, scope);
    let legacyRaw: string | null = null;
    try {
      if (typeof window !== 'undefined') legacyRaw = window.sessionStorage.getItem(`giro-payment:${scope.payableId}`);
    } catch { throw new Error('Penyimpanan pembayaran tidak tersedia. Periksa pengaturan peramban.'); }
    if (legacyRaw !== null) {
      if (!options.recoverLegacy) throw new Error('Catatan pembayaran lama belum diperiksa. Periksa akun, toko, dan riwayat pembayaran sebelum melanjutkan.');
      if (options.expectedLegacyRaw !== undefined && options.expectedLegacyRaw !== legacyRaw) throw new GiroPaymentError('Catatan pembayaran lama berubah. Muat ulang sebelum memeriksa kembali.');
      if (pending) throw new Error('Ada lebih dari satu catatan pembayaran. Periksa riwayat sebelum melanjutkan.');
      pending = parsePendingGiroPayment(legacyRaw);
    } else if (options.recoverLegacy) {
      throw new GiroPaymentError('Catatan pembayaran lama sudah berubah atau tidak tersedia. Muat ulang sebelum melanjutkan.');
    }
    if (expectedPendingKey && pending?.key !== expectedPendingKey) {
      throw new GiroPaymentError('Status pembayaran sebelumnya berubah. Tutup formulir dan periksa riwayat pembayaran.');
    }
    if (!pending && expectedGeneration !== undefined && readGiroPaymentGeneration(storage, scope) !== expectedGeneration) {
      throw new GiroPaymentError('Pembayaran telah berubah. Tutup formulir dan periksa riwayat pembayaran.');
    }
    if (pending && (pending.amount !== draft.amount || pending.paidAt !== draft.paidAt || pending.expectedBalance !== draft.expectedBalance || pending.expectedLedgerVersion !== draft.expectedLedgerVersion || pending.resource !== draft.resource)) {
      throw new Error('Pastikan pembayaran sebelumnya sebelum mengubah nominal atau tanggal.');
    }
    if (!pending) {
      if (!parseAmount(draft.amount) || !validDate(draft.paidAt) || !parseAmount(draft.expectedBalance)) throw new Error('Periksa nominal dan tanggal pembayaran.');
      try {
        pending = { key: createKey(), ...draft };
        storage.setItem(giroPaymentGenerationKey(scope), crypto.randomUUID());
        storage.setItem(giroPaymentStorageKey(scope), JSON.stringify(pending));
        notifyPaymentChange();
      } catch { throw new Error('Penyimpanan pembayaran tidak tersedia. Periksa pengaturan peramban.'); }
    }
    const url = `/api/finance/supplier-payables/${encodeURIComponent(scope.payableId)}/payments`;
    const send = (suffix = '') => fetcher(`${url}${suffix}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending!.key, 'X-Payment-User': scope.userId, 'X-Payment-Store': scope.storeId },
      body: JSON.stringify({ amount: pending!.amount, paidAt: pending!.paidAt, expectedBalance: pending!.expectedBalance, expectedLedgerVersion: pending!.expectedLedgerVersion, resource: pending!.resource }),
    });
    const clearPending = () => {
      storage.setItem(giroPaymentGenerationKey(scope), crypto.randomUUID());
      if (legacyRaw !== null && typeof window !== 'undefined') {
        const legacyKey = `giro-payment:${scope.payableId}`;
        if (window.sessionStorage.getItem(legacyKey) === legacyRaw) window.sessionStorage.removeItem(legacyKey);
      } else storage.removeItem(giroPaymentStorageKey(scope));
      notifyPaymentChange();
    };
    let response: Response;
    let body: { success?: boolean; reserved?: boolean; message?: string; code?: string } | null;
    try {
      if (legacyRaw !== null) {
        response = await send('?replay=1');
        body = await response.json().catch(() => null);
        if (!response.ok || body?.success !== true) throw new Error(uncertainMessage);
        clearPending();
        return;
      }
      if (pending.resource) {
        response = await send('?reserve=1');
        body = await response.json().catch(() => null);
        if (response.ok && body?.success === true) {
          clearPending();
          return;
        }
        if (!response.ok || body?.reserved !== true) {
          const validationMessage = response.status === 422 && body?.code === 'ValidationError' ? body.message : undefined;
          if (response.status === 403 || response.status === 404 || response.status === 422 || (response.status === 409 && body?.code === 'Conflict')) {
            response = await send('?resolve=1');
            body = await response.json().catch(() => null);
          }
          if (response.ok && body?.success === true) {
            clearPending();
            return;
          }
          if (response.status === 409 && body?.code === 'BalanceChanged') {
            clearPending();
            throw new GiroPaymentError(validationMessage || body?.message || 'Saldo hutang telah berubah.');
          }
          throw new Error(uncertainMessage);
        }
      }
      response = await send();
      body = await response.json().catch(() => null);
      if ((response.status === 403 || response.status === 404 || (response.status === 409 && body?.code === 'Conflict')) && pending.resource) {
        response = await send('?resolve=1');
        body = await response.json().catch(() => null);
      }
    } catch (error) {
      if (error instanceof GiroPaymentError) throw error;
      throw new Error(uncertainMessage);
    }
    if (response.ok && body?.success === true) {
      try { clearPending(); }
      catch { throw new Error(uncertainMessage); }
      return;
    }
    if (response.status === 422 && pending.expectedLedgerVersion === undefined) throw new Error(uncertainMessage);
    if (response.status === 422 || (response.status === 409 && body?.code === 'BalanceChanged')) {
      try { clearPending(); }
      catch { throw new Error(uncertainMessage); }
      throw new GiroPaymentError(body?.message || 'Periksa nominal dan tanggal pembayaran.');
    }
    if (response.status === 409) throw new GiroPaymentError(body?.message || 'Pembayaran perlu diperiksa kembali.');
    throw new Error(uncertainMessage);
  }, signal);
}

export const MANUAL_INCOME_CATEGORIES = ['ATK', 'CETAK', 'SPANDUK', 'PRINT', 'STEMPEL'] as const;
export type ManualIncomeCategory = (typeof MANUAL_INCOME_CATEGORIES)[number];
export const MANUAL_INCOME_LABELS: Record<ManualIncomeCategory, string> = {
  ATK: 'ATK', CETAK: 'Cetak', SPANDUK: 'Spanduk', PRINT: 'Print', STEMPEL: 'Stempel',
};
export type ManualIncomePayload = { description: string; category: ManualIncomeCategory; amount: number; occurredAt: string };
export type ManualTransferPayload = { applicantName: string; description: string; amount: number; occurredAt: string; attachmentUrl?: string | null };
type Result<T> = { success: true; data: T } | { success: false; errors: Record<string, string[]> };

export function manualFinanceDateBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  const max = `${part('year')}-${part('month')}-${part('day')}`;
  const year = Number(part('year')) - 5;
  const month = Number(part('month'));
  const day = Math.min(Number(part('day')), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return { max, min: `${year}-${part('month')}-${String(day).padStart(2, '0')}` };
}

function validateCommon(input: unknown, now: Date) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const errors: Record<string, string[]> = {};
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!description || description.length > 500) errors.description = ['Isi keterangan antara 1 sampai 500 karakter.'];
  const amount = data.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99 || Number(amount.toFixed(2)) !== amount) {
    errors.amount = ['Isi nominal lebih dari nol, maksimal Rp9.999.999.999,99 dengan dua angka desimal.'];
  }
  const occurredAt = typeof data.occurredAt === 'string' ? data.occurredAt : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(occurredAt) ? new Date(`${occurredAt}T00:00:00Z`) : new Date(NaN);
  const bounds = manualFinanceDateBounds(now);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== occurredAt || occurredAt < bounds.min || occurredAt > bounds.max) {
    errors.occurredAt = ['Pilih tanggal yang valid dalam lima tahun terakhir sampai hari ini (WIB).'];
  }
  return { data, errors, description, amount: amount as number, occurredAt };
}

export function validateManualIncome(input: unknown, now = new Date()): Result<ManualIncomePayload> {
  const { data, errors, description, amount, occurredAt } = validateCommon(input, now);
  if (!MANUAL_INCOME_CATEGORIES.includes(data.category as ManualIncomeCategory)) errors.category = ['Pilih kategori RC yang tersedia.'];
  return Object.keys(errors).length ? { success: false, errors } : { success: true, data: { description, amount, occurredAt, category: data.category as ManualIncomeCategory } };
}

export function validateManualTransfer(input: unknown, now = new Date()): Result<ManualTransferPayload> {
  const { data, errors, description, amount, occurredAt } = validateCommon(input, now);
  const applicantName = typeof data.applicantName === 'string' ? data.applicantName.trim() : '';
  if (!applicantName || applicantName.length > 100) errors.applicantName = ['Isi nama penerima antara 1 sampai 100 karakter.'];
  if (data.attachmentUrl != null && (typeof data.attachmentUrl !== 'string' || data.attachmentUrl.length > 2048)) errors.attachmentUrl = ['Lampiran tidak valid.'];
  return Object.keys(errors).length ? { success: false, errors } : { success: true, data: { description, amount, occurredAt, applicantName, ...(data.attachmentUrl !== undefined ? { attachmentUrl: data.attachmentUrl as string | null } : {}) } };
}

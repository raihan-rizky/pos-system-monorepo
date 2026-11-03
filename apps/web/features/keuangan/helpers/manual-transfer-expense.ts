import { validateManualTransfer } from './manual-finance';
import type { ValidationResult } from './keuangan-core';

export function validateManualTransferExpense(input: Record<string, unknown>): ValidationResult {
  const result = validateManualTransfer(input);
  const errors = result.success ? [] : Object.entries(result.errors).flatMap(([path, messages]) => messages.map(message => ({ path, message })));
  if (input.manualPurchasePaymentMethod !== undefined && input.manualPurchasePaymentMethod !== 'TRANSFER') errors.push({ path: 'manualPurchasePaymentMethod', message: 'Metode belanja harus transfer.' });
  if (input.changeAmount !== undefined && input.changeAmount !== 0) errors.push({ path: 'changeAmount', message: 'Belanja transfer tidak memiliki kembalian.' });
  for (const path of ['transactionId', 'shoppingRequestId', 'goodsPurchaseId', 'backdatedPurchaseDueId', 'backdatedPurchasePaymentId', 'customCategoryId']) {
    if (input[path] != null) errors.push({ path, message: 'Belanja manual tidak dapat dihubungkan ke transaksi atau sumber lain.' });
  }
  if (input.category !== undefined && input.category !== 'SUPPLIES') errors.push({ path: 'category', message: 'Kategori belanja transfer tidak dapat diubah.' });
  if (errors.length || !result.success) return { success: false, errors };
  return { success: true, data: { ...result.data, attachmentUrl: result.data.attachmentUrl ?? undefined, category: 'SUPPLIES', changeAmount: 0 } };
}

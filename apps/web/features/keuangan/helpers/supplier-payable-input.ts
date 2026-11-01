const MAX_AMOUNT = 9_999_999_999.99;

export function jakartaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseAmount(value: unknown): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT ? amount : null;
}

export function parsePayable(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const body = input as Record<string, unknown>;
  const supplierName = typeof body.supplierName === 'string' ? body.supplierName.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const amount = parseAmount(body.amount);
  const debtDate = body.debtDate;
  const dueDate = body.dueDate || null;
  const initialPayment = body.initialPayment === '' || body.initialPayment == null ? null : parseAmount(body.initialPayment);
  const initialPaidAt = body.initialPaidAt;
  if (!supplierName || supplierName.length > 200 || note.length > 1000 || !amount || !validDate(debtDate) || debtDate > jakartaToday()) return null;
  if (dueDate !== null && (!validDate(dueDate) || dueDate < debtDate)) return null;
  if (body.initialPayment !== '' && body.initialPayment != null && initialPayment === null) return null;
  if (initialPayment !== null && (initialPayment > amount || !validDate(initialPaidAt) || initialPaidAt < debtDate || initialPaidAt > jakartaToday())) return null;
  return { supplierName, note: note || null, amount, debtDate, dueDate, initialPayment, initialPaidAt: initialPayment === null ? null : initialPaidAt as string };
}

export function parseGiroReview(input: unknown, today = jakartaToday()) {
  if (!input || typeof input !== 'object' || !validDate(today)) return null;
  const body = input as Record<string, unknown>;
  if (body.historyComplete !== true || !Array.isArray(body.payments) || body.payments.length > 100) return null;
  const payableId = body.payableId == null ? null : body.payableId;
  if (payableId !== null && (typeof payableId !== 'string' || !payableId.trim() || payableId.length > 200)) return null;

  const payments: { amount: number; paidAt: string }[] = [];
  for (const entry of body.payments) {
    if (!entry || typeof entry !== 'object') return null;
    const payment = entry as Record<string, unknown>;
    const amount = parseAmount(payment.amount);
    if (!amount || !validDate(payment.paidAt) || payment.paidAt > today) return null;
    payments.push({ amount, paidAt: payment.paidAt });
  }
  const expectedPayments: { amount: number; paidAt: string }[] = [];
  if (body.expectedPayments !== undefined) {
    if (!Array.isArray(body.expectedPayments)) return null;
    for (const entry of body.expectedPayments) {
      if (!entry || typeof entry !== 'object') return null;
      const payment = entry as Record<string, unknown>;
      const amount = parseAmount(payment.amount);
      if (!amount || !validDate(payment.paidAt) || payment.paidAt > today) return null;
      expectedPayments.push({ amount, paidAt: payment.paidAt });
    }
  }
  return {
    payableId: typeof payableId === 'string' ? payableId.trim() : null,
    payments,
    ...(body.expectedPayments !== undefined ? { expectedPayments } : {}),
  };
}

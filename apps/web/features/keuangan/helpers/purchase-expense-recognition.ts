export type PurchaseExpenseSchedule = {
  id: string;
  method: "GIRO" | "TRANSFER";
  amountCents: number;
  dueDate: string | null;
};

export type PurchaseExpensePayment = {
  id: string;
  method: "GIRO" | "TRANSFER";
  sourceMethod?: "GIRO" | "TRANSFER";
  nonCash?: boolean;
  amountCents: number;
  paidAt: string;
};

export type RecognizedPurchaseExpense = {
  kind: "transfer" | "giro_payment" | "giro_due" | "overpayment";
  date: string;
  paidAt?: string;
  paidMethod?: PurchaseExpensePayment["method"];
  amountCents: number;
  scheduleId?: string;
  paymentId?: string;
  allocationSource?: "stored" | "automatic";
};

export type PurchaseExpenseAllocation = {
  paymentId: string;
  scheduleId: string;
  amountCents: number;
};

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function recognizePurchaseExpenses(input: {
  asOf: string;
  schedule: PurchaseExpenseSchedule[];
  payments: PurchaseExpensePayment[];
  allocations?: PurchaseExpenseAllocation[];
  historyVerified?: boolean;
}): { incomplete: boolean; rows: RecognizedPurchaseExpense[] } {
  const invalid = () => ({ incomplete: true, rows: [] });
  const validAmount = (amount: number) => Number.isSafeInteger(amount) && amount > 0;
  if (!isCalendarDate(input.asOf) ||
    input.historyVerified === false ||
    input.schedule.some(row => !row.id || !Number.isSafeInteger(row.amountCents) || row.amountCents < 0 ||
      (row.method === "GIRO" ? !row.dueDate || !isCalendarDate(row.dueDate) : row.dueDate !== null)) ||
    input.payments.some(row => !row.id || !validAmount(row.amountCents) || !isCalendarDate(row.paidAt)) ||
    new Set(input.schedule.map(row => row.id)).size !== input.schedule.length ||
    new Set(input.payments.map(row => row.id)).size !== input.payments.length) return invalid();

  const states = input.schedule
    .map(schedule => ({ schedule, paid: 0, paidByDue: 0, reserved: 0 }))
    .sort((a, b) => (a.schedule.dueDate ?? "").localeCompare(b.schedule.dueDate ?? "") || a.schedule.id.localeCompare(b.schedule.id));
  const rows: RecognizedPurchaseExpense[] = [];
  const statesById = new Map(states.map(state => [state.schedule.id, state]));
  const paymentsById = new Map(input.payments.map(payment => [payment.id, payment]));
  const allocationsByPayment = new Map<string, PurchaseExpenseAllocation[]>();
  const allocationKeys = new Set<string>();
  for (const allocation of input.allocations ?? []) {
    const payment = paymentsById.get(allocation.paymentId);
    const state = statesById.get(allocation.scheduleId);
    const key = JSON.stringify([allocation.paymentId, allocation.scheduleId]);
    if (!payment || !state || payment.method !== state.schedule.method || !validAmount(allocation.amountCents) || allocationKeys.has(key)) return invalid();
    allocationKeys.add(key);
    const existing = allocationsByPayment.get(payment.id) ?? [];
    existing.push(allocation);
    allocationsByPayment.set(payment.id, existing);
    if (payment.paidAt <= input.asOf) state.reserved += allocation.amountCents;
  }
  for (const [paymentId, allocations] of allocationsByPayment) {
    if (allocations.reduce((sum, row) => sum + row.amountCents, 0) > paymentsById.get(paymentId)!.amountCents) return invalid();
  }
  for (const state of states) state.reserved = Math.min(state.reserved, state.schedule.amountCents);

  for (const payment of [...input.payments].sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.id.localeCompare(b.id))) {
    if (payment.paidAt > input.asOf) continue;
    let available = payment.amountCents;
    const record = (state: typeof states[number], amount: number, allocationSource: "stored" | "automatic") => {
      state.paid += amount;
      available -= amount;
      if (state.schedule.method === "GIRO") {
        const dueDate = state.schedule.dueDate;
        if (!dueDate || payment.paidAt > dueDate) return;
        state.paidByDue += amount;
        if (!payment.nonCash && dueDate <= input.asOf) {
          rows.push({ kind: "giro_payment", date: dueDate, paidAt: payment.paidAt, paidMethod: payment.sourceMethod ?? payment.method,
            amountCents: amount, scheduleId: state.schedule.id, paymentId: payment.id, allocationSource });
        }
      } else if (!payment.nonCash) {
        rows.push({ kind: "transfer", date: payment.paidAt, amountCents: amount, scheduleId: state.schedule.id, paymentId: payment.id, allocationSource });
      }
    };
    for (const allocation of allocationsByPayment.get(payment.id) ?? []) {
      const state = statesById.get(allocation.scheduleId)!;
      state.reserved = Math.max(0, state.reserved - allocation.amountCents);
      const amount = Math.min(available, allocation.amountCents, state.schedule.amountCents - state.paid);
      if (amount > 0) record(state, amount, "stored");
    }
    for (const sameMethod of [true, false]) {
      for (const state of states) {
        if ((state.schedule.method === payment.method) !== sameMethod || (payment.nonCash && !sameMethod)) continue;
        const amount = Math.min(available, Math.max(0, state.schedule.amountCents - state.paid - state.reserved));
        if (amount <= 0) continue;
        record(state, amount, "automatic");
        if (available === 0) break;
      }
      if (available === 0) break;
    }
    if (available > 0 && !payment.nonCash) {
      rows.push({ kind: "overpayment", date: payment.paidAt, amountCents: available, paymentId: payment.id });
    }
  }

  for (const state of states) {
    const due = state.schedule.amountCents - state.paidByDue;
    if (state.schedule.method === "GIRO" && due > 0 && state.schedule.dueDate && state.schedule.dueDate <= input.asOf) {
      rows.push({ kind: "giro_due", date: state.schedule.dueDate, amountCents: due, scheduleId: state.schedule.id });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date)
    || Number(a.kind === "overpayment") - Number(b.kind === "overpayment")
    || (a.scheduleId ?? "").localeCompare(b.scheduleId ?? ""));
  return { incomplete: false, rows };
}

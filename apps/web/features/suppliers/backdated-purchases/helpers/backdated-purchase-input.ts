export class BackdatedPurchaseInputError extends Error {
  constructor(message: string, public readonly field: string) {
    super(message);
    this.name = "BackdatedPurchaseInputError";
  }
}

export type BackdatedPaymentInput = {
  amountCents: number;
  paidAt: string;
  requestId: string;
};

export type BackdatedPurchaseInput = {
  purchaseDate: string;
  paymentMethod: "GIRO" | "TRANSFER";
  dueDate: string;
  reference: string;
  amountCents: number;
  requestId: string;
  payments: BackdatedPaymentInput[];
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BackdatedPurchaseInputError("Periksa data yang dimasukkan.", "form");
  }
  return value as Record<string, unknown>;
}

function validDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BackdatedPurchaseInputError("Isi tanggal yang valid.", field);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BackdatedPurchaseInputError("Isi tanggal yang valid.", field);
  }
  return value;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) {
    throw new BackdatedPurchaseInputError("Isi data ini dengan benar.", field);
  }
  return text;
}

function amountInCents(value: unknown): number {
  const amount = typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) {
    throw new BackdatedPurchaseInputError("Isi nominal dengan maksimal dua angka desimal.", "amount");
  }
  const [whole, fraction = ""] = amount.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 999_999_999_999) {
    throw new BackdatedPurchaseInputError("Nominal harus lebih dari nol dan tidak terlalu besar.", "amount");
  }
  return cents;
}

export function backdatedJakartaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function parseBackdatedPaymentInput(
  input: unknown,
  purchaseDate: string,
  now = new Date(),
): BackdatedPaymentInput {
  const body = record(input);
  const paidAt = validDate(body.paidAt, "paidAt");
  if (paidAt < purchaseDate || paidAt > backdatedJakartaToday(now)) {
    throw new BackdatedPurchaseInputError("Tanggal pembayaran harus sejak tanggal pembelian dan paling lambat hari ini.", "paidAt");
  }
  return {
    amountCents: amountInCents(body.amount),
    paidAt,
    requestId: requiredText(body.requestId, "requestId", 100),
  };
}

export function parseBackdatedPurchaseInput(input: unknown, now = new Date()): BackdatedPurchaseInput {
  const body = record(input);
  const purchaseDate = validDate(body.purchaseDate, "purchaseDate");
  const dueDate = validDate(body.dueDate, "dueDate");
  if (purchaseDate >= `${backdatedJakartaToday(now).slice(0, 7)}-01`) {
    throw new BackdatedPurchaseInputError("Pilih tanggal pembelian dari bulan sebelumnya atau lebih lama.", "purchaseDate");
  }
  if (dueDate < purchaseDate) {
    throw new BackdatedPurchaseInputError("Tanggal jatuh tempo tidak boleh sebelum tanggal pembelian.", "dueDate");
  }
  const paymentMethod = body.paymentMethod ?? "GIRO";
  if (paymentMethod !== "GIRO" && paymentMethod !== "TRANSFER") {
    throw new BackdatedPurchaseInputError("Pilih metode pembayaran yang tersedia.", "paymentMethod");
  }
  const amountCents = amountInCents(body.amount);
  const rawPayments = body.payments ?? [];
  if (!Array.isArray(rawPayments)) {
    throw new BackdatedPurchaseInputError("Periksa daftar pembayaran.", "payments");
  }
  const payments = rawPayments.map((payment) => parseBackdatedPaymentInput(payment, purchaseDate, now));
  if (new Set(payments.map((payment) => payment.requestId)).size !== payments.length) {
    throw new BackdatedPurchaseInputError("Permintaan pembayaran tidak boleh duplikat.", "payments");
  }
  if (payments.reduce((total, payment) => total + payment.amountCents, 0) > amountCents) {
    throw new BackdatedPurchaseInputError("Jumlah pembayaran tidak boleh melebihi nominal pembelian.", "payments");
  }
  return {
    purchaseDate,
    paymentMethod,
    dueDate,
    reference: requiredText(body.reference, "reference", 160),
    amountCents,
    requestId: requiredText(body.requestId, "requestId", 100),
    payments,
  };
}

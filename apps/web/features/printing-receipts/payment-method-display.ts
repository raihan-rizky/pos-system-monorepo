export const PRINTING_PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Tunai" },
  { value: "DEBIT", label: "Debit" },
  { value: "CREDIT", label: "Kartu kredit" },
  { value: "QRIS", label: "QRIS" },
  { value: "TRANSFER", label: "Transfer" },
] as const;

type PaymentMethodSource = {
  paymentMethod?: string | null;
  payments?: readonly { method: string }[] | null;
} | null | undefined;

export interface PrintingReceiptTextSegment {
  text: string;
  color: string;
}

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  CASH: "#15803d",
  DEBIT: "#a16207",
  CREDIT: "#7c3aed",
  QRIS: "#111827",
  TRANSFER: "#2563eb",
  TEMPO: "#6b7280",
};

export function getPrintingReceiptPaymentMethodLabel(method: string | null | undefined): string {
  const value = method?.trim();
  if (!value) return "";
  const code = value.toUpperCase();
  if (code === "TEMPO") return "Tempo";
  return PRINTING_PAYMENT_METHOD_OPTIONS.find(option => option.value === code)?.label ?? value;
}

function getUniquePaymentMethods(source: PaymentMethodSource) {
  const rows = source?.payments ?? [];
  const methods = rows.length > 0 ? rows.map(payment => payment.method) : [source?.paymentMethod ?? ""];
  const seen = new Set<string>();
  const unique: { code: string; label: string }[] = [];

  for (const method of methods) {
    const value = method.trim();
    if (!value) continue;
    const key = value.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ code: key, label: getPrintingReceiptPaymentMethodLabel(value) });
  }

  return unique;
}

export function getPrintingReceiptPaymentMethodSegments(source: PaymentMethodSource): PrintingReceiptTextSegment[] {
  const methods = getUniquePaymentMethods(source);
  if (methods.length === 0) return [];

  return [
    { text: "Metode pembayaran: ", color: "#373396" },
    ...methods.flatMap((method, index) => [
      ...(index > 0 ? [{ text: ", ", color: "#242239" }] : []),
      { text: method.label, color: PAYMENT_METHOD_COLORS[method.code] ?? "#475569" },
    ]),
  ];
}

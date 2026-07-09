const JAKARTA_TZ = "Asia/Jakarta";
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const INVOICE_PATTERN = /^INV-(\d{4})(\d{2})(\d{2})-(\d+)$/;
const DRAFT_PATTERN = /^PNW-TLD-(\d{4})(\d{2})(\d{2})-(\d+)$/;

type ResolveInvoiceDateTimeInput = {
  mode: "create" | "edit";
  date: string;
  time?: string | null;
  now: Date;
  previousInvoiceDate?: Date | null;
};

type RequiresInvoiceDateReasonInput = {
  invoiceDate: Date;
  now: Date;
};

type ChooseDocumentSequenceInput = {
  currentSequence: number;
  existingSequencesForDate: number[];
};

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: JAKARTA_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function assertValidDateInput(date: string) {
  if (!DATE_INPUT_PATTERN.test(date)) {
    throw new Error(`invoice date must use YYYY-MM-DD, got "${date}"`);
  }
}

function assertValidTimeInput(time: string) {
  if (!TIME_INPUT_PATTERN.test(time)) {
    throw new Error(`invoice time must use HH:mm, got "${time}"`);
  }
}

function jakartaTimeParts(date: Date) {
  const parts = Object.fromEntries(
    timeFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    hour: parts.hour ?? "00",
    minute: parts.minute ?? "00",
    second: parts.second ?? "00",
  };
}

export function jakartaDateKey(date: Date): string {
  return dateFormatter.format(date);
}

export function compactJakartaDateKey(date: Date): string {
  return jakartaDateKey(date).replace(/-/g, "");
}

export function resolveInvoiceDateTime({
  mode,
  date,
  time,
  now,
  previousInvoiceDate,
}: ResolveInvoiceDateTimeInput): Date {
  assertValidDateInput(date);

  if (time) {
    assertValidTimeInput(time);
    return new Date(`${date}T${time}:00+07:00`);
  }

  const source =
    mode === "edit" && previousInvoiceDate ? previousInvoiceDate : now;
  const { hour, minute, second } = jakartaTimeParts(source);
  return new Date(`${date}T${hour}:${minute}:${second}+07:00`);
}

export function requiresInvoiceDateReason({
  invoiceDate,
  now,
}: RequiresInvoiceDateReasonInput): boolean {
  return jakartaDateKey(invoiceDate) !== jakartaDateKey(now);
}

export function buildInvoiceDocumentNumber(
  invoiceDate: Date,
  sequence: number,
): string {
  return `INV-${compactJakartaDateKey(invoiceDate)}-${String(sequence).padStart(4, "0")}`;
}

export function buildDraftDocumentNumber(
  invoiceDate: Date,
  sequence: number,
): string {
  return `PNW-TLD-${compactJakartaDateKey(invoiceDate)}-${String(sequence).padStart(3, "0")}`;
}

export function chooseDocumentSequence({
  currentSequence,
  existingSequencesForDate,
}: ChooseDocumentSequenceInput): number {
  const used = new Set(existingSequencesForDate);
  if (!used.has(currentSequence)) return currentSequence;
  return Math.max(0, ...existingSequencesForDate) + 1;
}

export function parseDocumentDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = INVOICE_PATTERN.exec(value) ?? DRAFT_PATTERN.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

export function parseDocumentSequence(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const match = INVOICE_PATTERN.exec(value) ?? DRAFT_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[4]);
}

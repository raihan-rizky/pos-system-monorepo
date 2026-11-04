import type {
  PrintingReceiptDocument,
  PrintingReceiptLine,
} from "@/features/printing-receipts/types";
import type { ReceiptChangeItem, ReceiptChangeSnapshot } from "../types";

type ReceiptCategory =
  | "transaction"
  | "items"
  | "payments"
  | "totals"
  | "printing";
export type ReceiptField = {
  key: string;
  label: string;
  raw: unknown;
  value: string;
  technical?: boolean;
};
export type ReceiptSection = {
  key: string;
  title: string;
  category: ReceiptCategory;
  fields: ReceiptField[];
};
export type ReceiptDifferenceGroup = {
  key: string;
  title: string;
  category: ReceiptCategory;
  kind?: "added" | "removed";
  fields: Array<{ key: string; label: string; before: string; after: string }>;
};

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 20,
});
const dateOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Jakarta",
} as const;
const dateTime = new Intl.DateTimeFormat("id-ID", dateOptions);
const preciseDateTime = new Intl.DateTimeFormat("id-ID", {
  ...dateOptions,
  fractionalSecondDigits: 3,
});
const absent = "Tidak ada";

export function formatReceiptCurrency(value: number) {
  return currency.format(value);
}
export function formatReceiptDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || absent;
  return `${(date.getUTCMilliseconds() ? preciseDateTime : dateTime).format(date)} WIB`;
}
export function formatReceiptStatus(value: string) {
  return (
    (
      {
        COMPLETED: "Lunas",
        DP: "Uang muka / belum lunas",
        DRAFT: "Draf",
        PENDING: "Menunggu",
        CANCELLED: "Dibatalkan",
        VOID: "Dibatalkan",
      } as Record<string, string>
    )[value] || value
  );
}
export function formatReceiptPaymentMethod(value: string) {
  return (
    (
      {
        CASH: "Tunai",
        QRIS: "QRIS",
        TRANSFER: "Transfer",
        DEBIT: "Kartu debit",
        CREDIT: "Kartu kredit",
        CARD: "Kartu",
        TEMPO: "Tempo",
        GIRO: "Giro",
        MIXED: "Gabungan",
      } as Record<string, string>
    )[value] || value
  );
}
function shown(value: unknown) {
  return value === null || value === undefined || value === ""
    ? absent
    : String(value);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}
function field(
  key: string,
  label: string,
  raw: unknown,
  value = shown(raw),
  technical = false,
): ReceiptField {
  return {
    key,
    label,
    raw: raw === "" ? null : (raw ?? null),
    value,
    ...(technical ? { technical: true } : {}),
  };
}
function amount(key: string, label: string, value: number | null | undefined) {
  return field(
    key,
    label,
    value,
    value === null || value === undefined ? absent : currency.format(value),
  );
}
function payments(
  key: string,
  label: string,
  values: Array<{ method: string; amount: number }>,
) {
  return field(
    key,
    label,
    values.map(canonical).sort(),
    values.length
      ? values
          .map(
            (payment) =>
              `${formatReceiptPaymentMethod(payment.method)}: ${currency.format(payment.amount)}`,
          )
          .join("\n")
      : absent,
  );
}
function itemSection(item: ReceiptChangeItem, key: string): ReceiptSection {
  return {
    key,
    title: item.productName || "Barang tanpa nama",
    category: "items",
    fields: [
      field("productName", "Nama barang", item.productName),
      field(
        "productId",
        "ID produk",
        item.productId,
        shown(item.productId),
        true,
      ),
      field("documentName", "Nama dokumen", item.documentName),
      field("material", "Bahan", item.material),
      field("size", "Ukuran", item.size),
      field(
        "quantity",
        "Jumlah",
        item.quantity,
        `${item.quantity} ${item.unit}`.trim(),
      ),
      field("unit", "Satuan", item.unit),
      amount("unitPrice", "Harga satuan", item.unitPrice),
      amount("appliedUnitPrice", "Harga berlaku", item.appliedUnitPrice),
      amount("originalUnitPrice", "Harga awal", item.originalUnitPrice),
      amount("discount", "Diskon barang", item.discount),
      amount("subtotal", "Subtotal barang", item.subtotal),
      field("serviceNote", "Catatan barang", item.serviceNote),
      field(
        "rawMaterialProductId",
        "ID bahan stok",
        item.rawMaterialProductId,
        shown(item.rawMaterialProductId),
        true,
      ),
      field(
        "rawMaterialQuantity",
        "Jumlah bahan stok",
        item.rawMaterialQuantity,
      ),
      field("rawMaterialUnit", "Satuan bahan stok", item.rawMaterialUnit),
    ],
  };
}
function printingDocument(snapshot: ReceiptChangeSnapshot) {
  const document = snapshot.printingReceipt?.document;
  return document && typeof document === "object" && !Array.isArray(document)
    ? (document as unknown as Partial<PrintingReceiptDocument>)
    : null;
}
function printingLines(snapshot: ReceiptChangeSnapshot): PrintingReceiptLine[] {
  const lines = printingDocument(snapshot)?.lines;
  return Array.isArray(lines) ? lines : [];
}
function printingLineSection(
  line: PrintingReceiptLine,
  key: string,
): ReceiptSection {
  return {
    key,
    title: line.name || "Baris Percetakan tanpa nama",
    category: "printing",
    fields: [
      field("name", "Nama baris", line.name),
      field("id", "ID baris", line.id, shown(line.id), true),
      field("material", "Bahan", line.material),
      field("quantity", "Jumlah", line.quantity),
      amount("price", "Harga", line.price),
      field(
        "stockProductId",
        "ID bahan stok",
        line.stockLink?.productId,
        shown(line.stockLink?.productId),
        true,
      ),
      field("stockQuantity", "Jumlah bahan stok", line.stockLink?.quantity),
      field("stockUnit", "Satuan bahan stok", line.stockLink?.unit),
    ],
  };
}
function scalarSections(snapshot: ReceiptChangeSnapshot): ReceiptSection[] {
  const invoiceDate = new Date(snapshot.invoiceDate);
  const sections: ReceiptSection[] = [
    {
      key: "transaction",
      title: "Informasi nota",
      category: "transaction",
      fields: [
        field("invoiceNumber", "Nomor nota", snapshot.invoiceNumber),
        field(
          "invoiceDate",
          "Tanggal nota",
          Number.isNaN(invoiceDate.getTime())
            ? snapshot.invoiceDate
            : invoiceDate.toISOString(),
          formatReceiptDate(snapshot.invoiceDate),
        ),
        field("customerName", "Pelanggan", snapshot.customerName),
        field(
          "customerId",
          "ID pelanggan terdaftar",
          snapshot.customerId,
          shown(snapshot.customerId),
          true,
        ),
        field("salesName", "Sales", snapshot.salesName),
        field(
          "salespersonId",
          "ID Sales",
          snapshot.salespersonId,
          shown(snapshot.salespersonId),
          true,
        ),
        field(
          "status",
          "Status",
          snapshot.status,
          formatReceiptStatus(snapshot.status),
        ),
        field("note", "Catatan transaksi", snapshot.note),
      ],
    },
    {
      key: "payments",
      title: "Pembayaran",
      category: "payments",
      fields: [
        field(
          "paymentMethod",
          "Metode pembayaran",
          snapshot.paymentMethod,
          formatReceiptPaymentMethod(snapshot.paymentMethod),
        ),
        payments("payments", "Rincian pembayaran", snapshot.payments),
        payments("debtPayments", "Pembayaran piutang", snapshot.debtPayments),
        amount("amountPaid", "Dibayar", snapshot.amountPaid),
        amount("change", "Kembalian", snapshot.change),
      ],
    },
    {
      key: "totals",
      title: "Nilai transaksi",
      category: "totals",
      fields: [
        amount("subtotal", "Subtotal", snapshot.subtotal),
        amount("discount", "Diskon", snapshot.discount),
        amount("tax", "Pajak", snapshot.tax),
        field(
          "taxRate",
          "Tarif pajak",
          snapshot.taxRate,
          snapshot.taxRate === null ? absent : `${snapshot.taxRate}%`,
        ),
        field(
          "taxMethod",
          "Perhitungan pajak",
          snapshot.taxMethod,
          (
            {
              INCLUSIVE: "Termasuk harga",
              EXCLUSIVE: "Di luar harga",
            } as Record<string, string>
          )[snapshot.taxMethod] || snapshot.taxMethod,
        ),
        amount("total", "Total nota", snapshot.total),
      ],
    },
  ];
  const printing = snapshot.printingReceipt;
  if (printing) {
    const document = printingDocument(snapshot);
    sections.push({
      key: "printing",
      title: "Nota Percetakan",
      category: "printing",
      fields: [
        field("printingPresent", "Nota Percetakan", true, "Ada"),
        field("printingNumber", "Nomor nota Percetakan", printing.number),
        field(
          "printingSubcategory",
          "Jenis nota Percetakan",
          printing.subcategory,
        ),
        field("printingTitle", "Judul nota Percetakan", document?.title),
        field(
          "printingCustomerName",
          "Pelanggan di nota Percetakan",
          document?.customerName,
        ),
        field(
          "printingCustomerId",
          "ID pelanggan di nota Percetakan",
          document?.customerId,
          shown(document?.customerId),
          true,
        ),
        field(
          "printingCustomerPhone",
          "Telepon pelanggan",
          document?.customerPhone,
        ),
        field("printingDate", "Tanggal di nota Percetakan", document?.date),
        field("printingNote", "Catatan nota Percetakan", document?.note),
        field("completionDate", "Tanggal selesai", document?.completionDate),
        field("completionTime", "Jam selesai", document?.completionTime),
        field("receiver", "Penerima", document?.receiver),
        field("setter", "Setter", document?.setter),
        field("signatory", "Penanda tangan", document?.signatory),
        field(
          "columnWidths",
          "Lebar kolom",
          document?.columnWidths,
          document?.columnWidths
            ? `${document.columnWidths.join(" · ")} mm`
            : absent,
        ),
      ],
    });
  }
  return sections;
}

export function getReceiptSections(
  snapshot: ReceiptChangeSnapshot,
): ReceiptSection[] {
  return [
    ...scalarSections(snapshot),
    ...snapshot.items.map((item, index) => itemSection(item, `item:${index}`)),
    ...printingLines(snapshot).map((line, index) =>
      printingLineSection(line, `printing-line:${index}`),
    ),
  ];
}

function compareSections(
  before: ReceiptSection | undefined,
  after: ReceiptSection | undefined,
  key: string,
  kind?: "added" | "removed",
): ReceiptDifferenceGroup | null {
  const section = after || before;
  if (!section) return null;
  const previous = new Map(before?.fields.map((row) => [row.key, row]) || []);
  const current = new Map(after?.fields.map((row) => [row.key, row]) || []);
  const fields = [...new Set([...previous.keys(), ...current.keys()])].flatMap(
    (key) => {
      const left = previous.get(key),
        right = current.get(key);
      if (canonical(left?.raw) === canonical(right?.raw)) return [];
      return [
        {
          key,
          label: (right || left)!.label,
          before: left?.value ?? absent,
          after: right?.value ?? absent,
        },
      ];
    },
  );
  if (!fields.length && !kind) return null;
  return {
    key,
    title: section.title,
    category: section.category,
    ...(kind ? { kind } : {}),
    fields: fields.length
      ? fields
      : [
          {
            key: "presence",
            label: "Keberadaan",
            before: before ? "Ada" : absent,
            after: after ? "Ada" : absent,
          },
        ],
  };
}

function compareCollections<T>(
  before: T[],
  after: T[],
  identity: (item: T) => string,
  section: (item: T, key: string) => ReceiptSection,
  prefix: string,
): ReceiptDifferenceGroup[] {
  const remainingAfter = new Set(after.map((_, index) => index));
  const remainingBefore: number[] = [];
  // Resolve unchanged duplicates first; only pair the leftovers when the identity is unambiguous.
  before.forEach((item, index) => {
    const exact = [...remainingAfter].find(
      (candidate) => canonical(item) === canonical(after[candidate]),
    );
    if (exact !== undefined) remainingAfter.delete(exact);
    else remainingBefore.push(index);
  });
  const result: ReceiptDifferenceGroup[] = [];
  const beforeCount = new Map<string, number>(),
    afterCount = new Map<string, number>();
  remainingBefore.forEach((index) => {
    const key = identity(before[index]);
    beforeCount.set(key, (beforeCount.get(key) || 0) + 1);
  });
  remainingAfter.forEach((index) => {
    const key = identity(after[index]);
    afterCount.set(key, (afterCount.get(key) || 0) + 1);
  });
  remainingBefore.forEach((index) => {
    const item = before[index],
      id = identity(item),
      key = `${prefix}:before:${index}`;
    const match =
      id && beforeCount.get(id) === 1 && afterCount.get(id) === 1
        ? [...remainingAfter].find(
            (candidate) => identity(after[candidate]) === id,
          )
        : undefined;
    const group =
      match === undefined
        ? compareSections(section(item, key), undefined, key, "removed")
        : compareSections(section(item, key), section(after[match], key), key);
    if (match !== undefined) remainingAfter.delete(match);
    if (group) result.push(group);
  });
  remainingAfter.forEach((index) => {
    const key = `${prefix}:after:${index}`;
    const group = compareSections(
      undefined,
      section(after[index], key),
      key,
      "added",
    );
    if (group) result.push(group);
  });
  return result;
}

export function compareReceiptSnapshots(
  before: ReceiptChangeSnapshot,
  after: ReceiptChangeSnapshot,
): ReceiptDifferenceGroup[] {
  const left = scalarSections(before),
    right = scalarSections(after);
  const scalar = [
    ...new Set([
      ...left.map((section) => section.key),
      ...right.map((section) => section.key),
    ]),
  ].flatMap((key) => {
    const group = compareSections(
      left.find((section) => section.key === key),
      right.find((section) => section.key === key),
      key,
    );
    return group ? [group] : [];
  });
  const items = compareCollections(
    before.items,
    after.items,
    (item) =>
      item.productId
        ? `product:${item.productId}`
        : item.productName
          ? `name:${item.productName}`
          : "",
    itemSection,
    "item",
  );
  const lines = compareCollections(
    printingLines(before),
    printingLines(after),
    (line) =>
      line.id ? `line:${line.id}` : line.name ? `name:${line.name}` : "",
    printingLineSection,
    "printing-line",
  );
  return [...items, ...scalar, ...lines];
}

export function getReceiptRevisionSummary(groups: ReceiptDifferenceGroup[]) {
  const labels: Record<ReceiptCategory, string> = {
    items: "Barang",
    transaction: "Rincian nota",
    payments: "Pembayaran",
    totals: "Nilai transaksi",
    printing: "Nota Percetakan",
  };
  const categories = [...new Set(groups.map((group) => group.category))];
  if (!categories.length) return "Rincian nota tersimpan";
  return `${categories
    .slice(0, 2)
    .map((category, index) =>
      index ? labels[category].toLocaleLowerCase("id-ID") : labels[category],
    )
    .join(
      " dan ",
    )}${categories.length > 2 ? ` serta ${categories.length - 2} bagian lain` : ""} diperbarui`;
}

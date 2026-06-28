import { readFileSync } from "fs";
import path from "path";
import { db } from "@pos/db";

type DecimalLike = { toNumber?: () => number } | number | string | null | undefined;

function toNumber(value: DecimalLike): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value.toNumber === "function") return value.toNumber();
  return Number(value);
}

function startAndEndOfDate(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  return { start, end };
}

export async function getLowStockItems({
  storeId,
  limit = 50,
}: {
  storeId: string;
  limit?: number;
}) {
  const products = await db.product.findMany({
    where: {
      storeId,
      isActive: true,
    },
    select: { id: true, name: true, sku: true, stock: true, minStock: true, unit: true },
    orderBy: [{ stock: "asc" }, { name: "asc" }],
    take: 200,
  });

  const items = products
    .filter((product) => product.stock <= product.minStock)
    .slice(0, limit)
    .map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      stock: product.stock,
      minStock: product.minStock,
      unit: product.unit,
    }));

  return {
    items,
    total: items.length,
    generatedAt: new Date().toISOString(),
  };
}

export async function getDailySalesSummary({
  storeId,
  date,
}: {
  storeId: string;
  date: string;
}) {
  const { start, end } = startAndEndOfDate(date);
  const transactions = await db.transaction.findMany({
    where: {
      storeId,
      status: "COMPLETED",
      createdAt: { gte: start, lte: end },
    },
    select: {
      total: true,
      items: {
        select: {
          subtotal: true,
          unitCost: true,
          quantity: true,
        },
      },
    },
  });

  let revenue = 0;
  let grossProfit = 0;

  for (const transaction of transactions) {
    revenue += toNumber(transaction.total as DecimalLike);
    for (const item of transaction.items) {
      const subtotal = toNumber(item.subtotal as DecimalLike);
      const unitCost = item.unitCost == null ? null : toNumber(item.unitCost as DecimalLike);
      if (unitCost !== null) {
        grossProfit += subtotal - unitCost * item.quantity;
      }
    }
  }

  return {
    date,
    revenue,
    grossProfit,
    transactionCount: transactions.length,
    generatedAt: new Date().toISOString(),
  };
}

const HELP_DOCS = [
  { file: "products.md", keywords: ["produk", "product", "tambah produk", "sku", "harga", "kategori", "barcode", "variasi", "item", "barang"] },
  { file: "inventory.md", keywords: ["stok", "stock", "inventory", "inventori", "gudang", "opname", "stock opname", "barang masuk", "barang keluar", "stock out", "mutasi", "kartu stok"] },
  { file: "pos.md", keywords: ["transaksi", "pos", "kasir", "pembayaran", "checkout", "keranjang", "diskon", "tunai", "qris", "transfer", "kredit", "debit", "struk belanja"] },
  { file: "customers.md", keywords: ["customer", "pelanggan", "piutang", "utang", "pembeli", "member", "membership", "tagihan", "cicilan"] },
  { file: "suppliers.md", keywords: ["supplier", "pemasok", "vendor", "distributor", "pabrik", "agen"] },
  { file: "reports.md", keywords: ["laporan", "report", "keuangan", "omzet", "revenue", "profit", "laba rugi", "penjualan", "grafik", "analisa", "statistik", "ringkasan"] },
  { file: "keuangan.md", keywords: ["keuangan", "cash flow", "arus kas", "pengeluaran", "expense", "biaya"] },
  { file: "financial-report.md", keywords: ["laporan keuangan", "financial report", "omzet", "laba kotor", "hpp", "gross profit", "loss stok"] },
  { file: "settings-rbac.md", keywords: ["settings", "rbac", "role", "permission", "akses", "pengaturan", "hak akses", "admin", "pengguna", "user", "karyawan", "akun"] },
  { file: "production.md", keywords: ["produksi", "production", "kanban", "job order", "printing", "siap diambil", "sedang diproses", "proses", "selesai", "operator", "papan produksi"] },
  { file: "salespersons.md", keywords: ["sales", "salesperson", "tim sales", "tenaga penjual", "komisi", "target", "kinerja sales", "spg", "pramuniaga"] },
  { file: "shift.md", keywords: ["shift", "laci", "modal laci", "tutup laci", "selisih", "kasir", "sesi", "uang laci", "cash drawer", "setor", "buka shift"] },
  { file: "history.md", keywords: ["riwayat", "history", "transaksi lama", "struk", "void", "batal", "refund", "kembali", "surat jalan", "nota", "pengiriman", "detail transaksi", "pending"] },
  { file: "faq.md", keywords: ["faq", "pertanyaan", "masalah", "cara", "bagaimana", "solusi", "error", "salah", "kenapa", "mengapa", "langkah", "panduan", "proses", "tahap", "tutorial", "tambah produk", "ubah harga", "harga khusus", "harga dinas", "import", "grup stok", "pos", "kasir", "pending", "surat jalan", "bukti transaksi", "upload", "lampiran", "buka shift", "tutup shift", "tambah pelanggan", "bayar piutang", "pelunasan", "cicilan", "barang rusak", "tugas mingguan", "penerimaan barang", "inbound", "daftar belanja", "shopping request", "pengeluaran", "ekspor laporan", "info toko", "rbac", "hak akses", "kanban", "sales"] },
];

function readHelpDoc(file: string) {
  const filePath = path.join(process.cwd(), "features", "ai-assistant", "docs", "help", file);
  return readFileSync(filePath, "utf8");
}

function productWhere(storeId: string, query: string) {
  return {
    storeId,
    isActive: true,
    OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { sku: { contains: query, mode: "insensitive" as const } },
      { barcode: { contains: query, mode: "insensitive" as const } },
    ],
  };
}

const productSelect = {
  id: true,
  name: true,
  sku: true,
  stock: true,
  minStock: true,
  unit: true,
  price: true,
  category: { select: { name: true } },
};

function mapProduct(product: any) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    stock: product.stock,
    minStock: product.minStock,
    unit: product.unit,
    price: toNumber(product.price),
    category: product.category?.name ?? null,
  };
}

async function findProductMatches(storeId: string, query: string, limit = 10) {
  const products = await db.product.findMany({
    where: productWhere(storeId, query),
    select: productSelect,
    orderBy: [{ name: "asc" }],
    take: limit,
  });
  return products.map(mapProduct);
}

export async function getProductSearch({ storeId, query, limit = 10 }: { storeId: string; query: string; limit?: number }) {
  const items = await findProductMatches(storeId, query, limit);
  return { items, total: items.length, generatedAt: new Date().toISOString() };
}

export async function getProductStock({ storeId, query }: { storeId: string; query: string }) {
  const items = await findProductMatches(storeId, query, 10);
  return { match: items.length === 1 ? items[0] : null, candidates: items.length === 1 ? [] : items, generatedAt: new Date().toISOString() };
}

export async function getProductPrice({ storeId, query }: { storeId: string; query: string }) {
  const items = await findProductMatches(storeId, query, 10);
  return { match: items.length === 1 ? items[0] : null, candidates: items.length === 1 ? [] : items, generatedAt: new Date().toISOString() };
}

function customerWhere(storeId: string, query: string) {
  return {
    storeId,
    OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { phone: { contains: query, mode: "insensitive" as const } },
      { company: { contains: query, mode: "insensitive" as const } },
      { email: { contains: query, mode: "insensitive" as const } },
    ],
  };
}

const customerSelect = {
  id: true,
  name: true,
  phone: true,
  company: true,
  type: true,
  totalDebt: true,
  totalSpent: true,
  totalOrders: true,
  lastVisitAt: true,
};

function mapCustomer(customer: any) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    company: customer.company,
    type: customer.type,
    totalDebt: toNumber(customer.totalDebt),
    totalSpent: toNumber(customer.totalSpent),
    totalOrders: customer.totalOrders,
    lastVisitAt: customer.lastVisitAt,
  };
}

async function findCustomerMatches(storeId: string, query: string, limit = 10) {
  const customers = await db.customer.findMany({
    where: customerWhere(storeId, query),
    select: customerSelect,
    orderBy: { lastVisitAt: { sort: "desc", nulls: "last" } },
    take: limit,
  });
  return customers.map(mapCustomer);
}

export async function getCustomerSearch({ storeId, query, limit = 10 }: { storeId: string; query: string; limit?: number }) {
  const items = await findCustomerMatches(storeId, query, limit);
  return { items, total: items.length, generatedAt: new Date().toISOString() };
}

export async function getCustomerDebtSummary({ storeId, query }: { storeId: string; query: string }) {
  const items = await findCustomerMatches(storeId, query, 10);
  return { match: items.length === 1 ? items[0] : null, candidates: items.length === 1 ? [] : items, generatedAt: new Date().toISOString() };
}

export async function getCustomerRecapSummary({ storeId, query, now = new Date() }: { storeId: string; query: string; now?: Date }) {
  const items = await findCustomerMatches(storeId, query, 10);
  if (items.length !== 1) return { match: null, candidates: items, generatedAt: new Date().toISOString() };
  const customer = items[0];
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  const from = fromDate.toISOString().slice(0, 10);
  const bounds = { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) };
  const [transactions, payments] = await Promise.all([
    db.transaction.findMany({ where: { storeId, customerId: customer.id, status: { in: ["COMPLETED", "DP"] }, createdAt: bounds }, select: { id: true, total: true, createdAt: true, status: true } }),
    db.debtPaymentLog.findMany({ where: { storeId, customerId: customer.id, createdAt: bounds }, select: { amount: true, createdAt: true } }),
  ]);
  return {
    match: {
      ...customer,
      dateFrom: from,
      dateTo: to,
      transactionCount: transactions.length,
      revenue: transactions.reduce((sum, transaction) => sum + toNumber(transaction.total as DecimalLike), 0),
      debtPaid: payments.reduce((sum, payment) => sum + toNumber(payment.amount as DecimalLike), 0),
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function getSupplierSearch({ query, limit = 10 }: { query: string; limit?: number }) {
  const suppliers = await db.supplier.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
        { contactPerson: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, type: true, phone: true, contactPerson: true, address: true },
    orderBy: { name: "asc" },
    take: limit,
  });
  return { items: suppliers, total: suppliers.length, generatedAt: new Date().toISOString() };
}

export async function getTopProducts({ storeId, date }: { storeId: string; date: string }) {
  const { start, end } = startAndEndOfDate(date);
  const items = await db.transactionItem.groupBy({
    by: ["productId", "productName"],
    where: {
      transaction: { storeId, status: "COMPLETED", createdAt: { gte: start, lte: end } },
      productId: { not: null },
    },
    _sum: { quantity: true, subtotal: true },
    orderBy: { _sum: { subtotal: "desc" } },
    take: 10,
  });
  return {
    date,
    items: items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantitySold: item._sum.quantity ?? 0,
      revenue: toNumber(item._sum.subtotal as DecimalLike),
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function getPendingTransactions({ storeId, limit = 20 }: { storeId: string; limit?: number }) {
  const transactions = await db.transaction.findMany({
    where: { storeId, status: { in: ["PENDING_APPROVAL", "DP", "DRAFT"] } },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      total: true,
      customerName: true,
      createdAt: true,
      isJobOrder: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return {
    items: transactions.map((t) => ({
      id: t.id,
      invoiceNumber: t.invoiceNumber,
      status: t.status,
      total: toNumber(t.total as DecimalLike),
      customerName: t.customerName,
      createdAt: t.createdAt.toISOString(),
      isJobOrder: t.isJobOrder,
    })),
    total: transactions.length,
    generatedAt: new Date().toISOString(),
  };
}

export async function getSystemHelp({ query }: { query: string }) {
  const normalized = query.toLowerCase();
  const matches = HELP_DOCS.filter((doc) =>
    doc.keywords.some((keyword) => normalized.includes(keyword))
  );
  const selectedDocs = matches.length ? matches : HELP_DOCS;
  const markdown = matches.length
    ? selectedDocs.map((doc) => readHelpDoc(doc.file)).join("\n\n")
    : `# Topik bantuan\n\n${selectedDocs.map((doc) => `- ${doc.file.replace(".md", "")}`).join("\n")}`;

  return {
    markdown,
    source: "markdown-help-docs",
    sourceRefs: selectedDocs.map((doc) => doc.file),
    generatedAt: new Date().toISOString(),
  };
}

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
  { file: "products.md", keywords: ["produk", "product", "tambah produk", "sku"] },
  { file: "inventory.md", keywords: ["stok", "stock", "inventory", "inventori"] },
  { file: "pos.md", keywords: ["transaksi", "pos", "kasir", "pembayaran"] },
  { file: "customers.md", keywords: ["customer", "pelanggan", "piutang", "utang"] },
  { file: "suppliers.md", keywords: ["supplier", "pemasok"] },
  { file: "reports.md", keywords: ["laporan", "report", "keuangan", "omzet", "revenue", "profit"] },
  { file: "settings-rbac.md", keywords: ["settings", "rbac", "role", "permission", "akses"] },
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

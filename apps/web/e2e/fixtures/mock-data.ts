export const categories = [
  { id: "cat-print", name: "Print", icon: "P", color: "#0c98e9", _count: { products: 2 } },
  { id: "cat-atk", name: "ATK", icon: "A", color: "#f97d12", _count: { products: 1 } },
];

export const products = [
  {
    id: "prod-a4",
    name: "Kertas HVS A4",
    sku: "HVS-A4",
    price: 55000,
    costPrice: 42000,
    stock: 24,
    minStock: 5,
    unit: "rim",
    size: "A4",
    material: "70gsm",
    imageUrl: null,
    isActive: true,
    category: { id: "cat-atk", name: "ATK", icon: "A", color: "#f97d12" },
  },
  {
    id: "prod-banner",
    name: "Banner Indoor",
    sku: "BNR-IN",
    price: 25000,
    costPrice: 15000,
    stock: 3,
    minStock: 5,
    unit: "meter",
    size: "1x1m",
    material: "Flexi",
    imageUrl: null,
    isActive: true,
    category: { id: "cat-print", name: "Print", icon: "P", color: "#0c98e9" },
  },
];

export const activeShift = {
  id: "shift-open",
  cashierId: "e2e-user",
  storeId: "store-main",
  openingBalance: 100000,
  closingBalance: null,
  expectedBalance: null,
  discrepancy: null,
  status: "OPEN",
  note: "E2E shift",
  openedAt: "2026-05-09T00:00:00.000Z",
  closedAt: null,
  cashier: { name: "E2E Owner" },
};

export const closedShift = {
  ...activeShift,
  id: "shift-closed",
  closingBalance: 155000,
  expectedBalance: 155000,
  discrepancy: 0,
  status: "CLOSED",
  closedAt: "2026-05-09T08:00:00.000Z",
};

export const transaction = {
  id: "tx-1",
  invoiceNumber: "INV-20260509-0001",
  subtotal: 55000,
  discount: 0,
  tax: 0,
  total: 55000,
  paymentMethod: "CASH",
  amountPaid: 60000,
  change: 5000,
  customerName: "Budi",
  salesName: "Rina Sales",
  salespersonId: "sp-1",
  salesperson: { name: "Rina Sales" },
  note: "E2E transaction",
  status: "COMPLETED",
  createdAt: "2026-05-09T01:00:00.000Z",
  items: [
    {
      id: "item-1",
      productName: "Kertas HVS A4",
      size: "A4",
      material: "70gsm",
      quantity: 1,
      unitPrice: 55000,
      subtotal: 55000,
    },
  ],
};

export const jobOrder = {
  ...transaction,
  id: "job-1",
  invoiceNumber: "JOB-20260509-0001",
  status: "DP",
  productionStatus: "PENDING",
  total: 120000,
  amountPaid: 50000,
  estimatedDoneAt: "2026-05-12T08:00:00.000Z",
  items: [
    {
      id: "job-item-1",
      productName: "Banner Indoor",
      size: "1x1m",
      material: "Flexi",
      quantity: 2,
      unitPrice: 60000,
      subtotal: 120000,
      product: { id: "prod-banner", name: "Banner Indoor", imageUrl: null },
    },
  ],
};

export const customers = [
  {
    id: "cust-1",
    name: "Budi",
    phone: "08123456789",
    email: "budi@example.test",
    company: "CV Budi",
    address: "Jl. E2E",
    type: "VIP",
    notes: "Test customer",
    totalSpent: 55000,
    totalOrders: 1,
    totalDebt: 70000,
    loyaltyPoint: 10,
    lastVisitAt: "2026-05-09T01:00:00.000Z",
    createdAt: "2026-05-01T01:00:00.000Z",
  },
];

export const salespersons = [
  { id: "sp-1", name: "Rina Sales", isActive: true, storeId: "store-main", createdAt: "2026-05-01T00:00:00.000Z", _count: { transactions: 3 } },
  { id: "sp-2", name: "Dedi Sales", isActive: false, storeId: "store-main", createdAt: "2026-05-02T00:00:00.000Z", _count: { transactions: 0 } },
];

export const dashboard = {
  todayRevenue: 55000,
  todayProfit: 13000,
  todayTransactionCount: 1,
  monthlyRevenue: 55000,
  monthlyProfit: 13000,
  monthlyTransactionCount: 1,
  topProducts: [{ name: "Kertas HVS A4", quantity: 1, revenue: 55000 }],
  lowStockProducts: [products[1]],
  totalProducts: products.length,
  revenueChart: [
    { name: "Sen", date: "2026-05-04", revenue: 0, profit: 0, cost: 0 },
    { name: "Sab", date: "2026-05-09", revenue: 55000, profit: 13000, cost: 42000 },
  ],
  topSalespersons: [{ id: "sp-1", name: "Rina Sales", revenue: 55000, txCount: 1 }],
  topCustomers: [{ id: "cust-1", name: "Budi", phone: "08123456789", totalSpent: 55000 }],
  productionStatusCounts: [{ status: "PENDING", count: 1 }],
  dpTransactions: [jobOrder],
  totalOutstandingDP: 70000,
};

export const storeSettings = {
  id: "store-main",
  name: "Toko E2E",
  address: "Jl. Testing No. 1",
  phone: "08123456789",
  logoUrl: null,
  updatedAt: "2026-05-09T00:00:00.000Z",
};

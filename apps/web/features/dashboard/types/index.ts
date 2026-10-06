import type { Transaction } from "@/hooks/useTransactions";
import type { SalesGroup } from "../helpers/sales-groups";

export type TopSalesperson = {
  id?: string | null;
  name?: string | null;
  txCount?: number | null;
  revenue?: number | string | null;
};

export type TopCustomer = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  totalSpent?: number | string | null;
};

export type ProductionStatusCount = {
  status?: string | null;
  count?: number | null;
};

export type ActiveDpTransaction = {
  id?: string | null;
  invoiceNumber?: string | null;
  customerName?: string | null;
  total?: number | string | null;
  paidAmount?: number | string | null;
};

export type RevenueChartPoint = {
  name: string;
  date: string;
  revenue: number;
  profit: number;
  cost: number;
};

export type TopProduct = {
  name: string;
  quantity: number;
  revenue: number;
};

export type TopProductGroup = {
  key: SalesGroup;
  label: string;
  products: TopProduct[];
};

export type LowStockProduct = {
  id: string;
  name: string;
  stock: number;
  minStock: number;
  unit: string;
};

export type PaymentMixRow = {
  method: string;
  revenue: number;
  transactionCount: number;
};

export interface DashboardData {
  todayRevenue: number;
  todayProfit: number;
  todayTransactionCount: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  monthlyTransactionCount: number;
  topProducts: TopProduct[];
  topProductGroups?: TopProductGroup[];
  lowStockProducts: LowStockProduct[];
  totalProducts: number;
  revenueChart: RevenueChartPoint[];
  topSalespersons: TopSalesperson[];
  topCustomers: TopCustomer[];
  productionStatusCounts: ProductionStatusCount[];
  dpTransactions: Transaction[];
  totalOutstandingDP: number;
  paymentMixToday: PaymentMixRow[];
}

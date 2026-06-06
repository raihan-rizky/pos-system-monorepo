import type { CustomerRecapCustomerType } from "../helpers/recap-core";

export interface CustomerRecapQuery {
  dateFrom: string;
  dateTo: string;
}

export interface ApiEnvelope<T> {
  data: T;
  message?: string;
  code?: string;
}

export interface CustomerRecapData {
  dateFrom: string;
  dateTo: string;
  summary: {
    newCustomers: number;
    returningCustomers: number;
    churnedCustomers: number;
    totalDebtOutstanding: number;
    debtCollectedInPeriod: number;
    avgOrderValue: number;
    orderFrequency: number;
    repeatPurchaseRate: number;
  };
  byType: Array<{
    type: CustomerRecapCustomerType;
    customerCount: number;
    revenue: number;
    debtAmount: number;
  }>;
  topSpenders: Array<{
    id: string;
    name: string;
    type: CustomerRecapCustomerType;
    spentInPeriod: number;
    orderCount: number;
    lastVisitAt: string | null;
  }>;
  trend: {
    granularity: "daily" | "weekly" | "monthly";
    points: Array<{
      bucketKey: string;
      label: string;
      revenue: number;
      orderCount: number;
      newCustomers: number;
      returningCustomers: number;
    }>;
  };
}

export interface CustomerDetailRecapData {
  id: string;
  dateFrom: string;
  dateTo: string;
  summary: {
    totalSpent: number;
    totalOrders: number;
    avgOrderValue: number;
    debtRemaining: number;
    debtPaidInPeriod: number;
  };
  trend: {
    granularity: "daily" | "weekly" | "monthly";
    points: Array<{
      bucketKey: string;
      label: string;
      spent: number;
      orderCount: number;
    }>;
  };
  topProducts: Array<{
    productId: string | null;
    productName: string;
    quantity: number;
    subtotal: number;
  }>;
}

import { buildCustomerRecap } from "./recap-core";
import type {
  BuildCustomerRecapInput,
  CustomerRecapCustomerType,
  CustomerRecapTransaction,
} from "./recap-core";
import type { CustomerRecapData } from "../types/customer-recap";

export const CUSTOMER_RECAP_EXPORT_TYPES: CustomerRecapCustomerType[] = [
  "AGEN",
  "UMUM",
  "PEMERINTAH",
  "INDUSTRI",
];

export interface CustomerRecapExportCustomer {
  id: string;
  name: string;
  orderCount: number;
  totalSpent: number;
  averageOrderValue: number;
  totalDebt: number;
  lastVisitAt: string | null;
  favoriteProducts: string;
}

export interface CustomerRecapExportProduct {
  productId: string | null;
  productName: string;
  quantity: number;
  subtotal: number;
}

export interface CustomerRecapExportTypeSummary {
  type: CustomerRecapCustomerType;
  customerCount: number;
  transactionCount: number;
  totalSpent: number;
  averageOrderValue: number;
  debtOutstanding: number;
}

export interface CustomerRecapExportGroup {
  type: CustomerRecapCustomerType;
  customers: CustomerRecapExportCustomer[];
  topProducts: CustomerRecapExportProduct[];
  summary: CustomerRecapExportTypeSummary;
}

export interface CustomerRecapExportData {
  dateFrom: string;
  dateTo: string;
  summary: CustomerRecapData["summary"];
  typeSummaries: CustomerRecapExportTypeSummary[];
  groups: CustomerRecapExportGroup[];
}

type ProductAccumulator = CustomerRecapExportProduct;

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "object" ? Number(String(value)) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isConfirmed(transaction: CustomerRecapTransaction): boolean {
  return transaction.status === "COMPLETED" || transaction.status === "DP";
}

function productKey(productId: string | null | undefined, productName: string): string {
  return productId ? `id:${productId}` : `name:${productName}`;
}

function compareProducts(a: ProductAccumulator, b: ProductAccumulator): number {
  return (
    b.quantity - a.quantity ||
    b.subtotal - a.subtotal ||
    a.productName.localeCompare(b.productName, "id")
  );
}

export function buildCustomerRecapExport(
  input: BuildCustomerRecapInput,
): CustomerRecapExportData {
  const summary = buildCustomerRecap(input).summary;
  const customerById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const customerStats = new Map<
    string,
    { orderCount: number; totalSpent: number; products: Map<string, ProductAccumulator> }
  >();
  const productsByType = new Map<
    CustomerRecapCustomerType,
    Map<string, ProductAccumulator>
  >();

  for (const type of CUSTOMER_RECAP_EXPORT_TYPES) {
    productsByType.set(type, new Map());
  }

  for (const transaction of input.transactions) {
    if (!isConfirmed(transaction) || !transaction.customerId) continue;
    const customer = customerById.get(transaction.customerId);
    if (!customer) continue;

    const stats = customerStats.get(customer.id) ?? {
      orderCount: 0,
      totalSpent: 0,
      products: new Map<string, ProductAccumulator>(),
    };
    stats.orderCount += 1;
    stats.totalSpent += toNumber(transaction.total);

    const typeProducts = productsByType.get(customer.type)!;
    for (const item of transaction.items) {
      const key = productKey(item.productId, item.productName);
      const current = stats.products.get(key) ?? {
        productId: item.productId ?? null,
        productName: item.productName,
        quantity: 0,
        subtotal: 0,
      };
      current.quantity += toNumber(item.quantity);
      current.subtotal += toNumber(item.subtotal);
      stats.products.set(key, current);

      const typeProduct = typeProducts.get(key) ?? {
        productId: item.productId ?? null,
        productName: item.productName,
        quantity: 0,
        subtotal: 0,
      };
      typeProduct.quantity += toNumber(item.quantity);
      typeProduct.subtotal += toNumber(item.subtotal);
      typeProducts.set(key, typeProduct);
    }

    customerStats.set(customer.id, stats);
  }

  const groups = CUSTOMER_RECAP_EXPORT_TYPES.map((type) => {
    const customers = input.customers
      .filter((customer) => customer.type === type && customerStats.has(customer.id))
      .map((customer) => {
        const stats = customerStats.get(customer.id)!;
        const favoriteProducts = [...stats.products.values()]
          .sort(compareProducts)
          .slice(0, 3)
          .map((product) => product.productName)
          .join(", ");

        return {
          id: customer.id,
          name: customer.name,
          orderCount: stats.orderCount,
          totalSpent: stats.totalSpent,
          averageOrderValue: stats.orderCount > 0 ? stats.totalSpent / stats.orderCount : 0,
          totalDebt: Math.max(0, toNumber(customer.totalDebt)),
          lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
          favoriteProducts,
        } satisfies CustomerRecapExportCustomer;
      })
      .sort((a, b) => b.totalSpent - a.totalSpent || a.name.localeCompare(b.name, "id"));

    const typeSummary = {
      type,
      customerCount: customers.length,
      transactionCount: customers.reduce((sum, customer) => sum + customer.orderCount, 0),
      totalSpent: customers.reduce((sum, customer) => sum + customer.totalSpent, 0),
      averageOrderValue: 0,
      debtOutstanding: customers.reduce((sum, customer) => sum + customer.totalDebt, 0),
    } satisfies CustomerRecapExportTypeSummary;
    typeSummary.averageOrderValue =
      typeSummary.transactionCount > 0
        ? typeSummary.totalSpent / typeSummary.transactionCount
        : 0;

    const topProducts = [...productsByType.get(type)!.values()]
      .sort(compareProducts)
      .slice(0, 10);

    return {
      type,
      customers,
      topProducts,
      summary: typeSummary,
    } satisfies CustomerRecapExportGroup;
  });

  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    summary,
    typeSummaries: groups.map((group) => group.summary),
    groups,
  };
}

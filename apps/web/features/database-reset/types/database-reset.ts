import type { Prisma, PrismaClient } from "@pos/db";

export type DatabaseResetDomain =
  | "productCatalog"
  | "customers"
  | "salesFinance"
  | "supplierProcurement"
  | "inventoryOperations"
  | "importBatchJobs"
  | "storeNotifications";

export const DATABASE_RESET_CONFIRMATION = "RESET DATABASE" as const;

export type DatabaseResetModel =
  | "Product"
  | "Brand"
  | "ProductStockGroup"
  | "PrintingService"
  | "ProductSupplier"
  | "ProductPriceLog"
  | "ProductStockGroupActivity"
  | "Customer"
  | "Transaction"
  | "TransactionItem"
  | "TransactionPayment"
  | "DebtPaymentLog"
  | "CashierShift"
  | "Expense"
  | "InvoiceDateChangeLog"
  | "ProductionActivityLog"
  | "Supplier"
  | "ShoppingRequest"
  | "ShoppingRequestItem"
  | "GoodsPurchase"
  | "GoodsPurchaseItem"
  | "InventoryInboundReceipt"
  | "InventoryInboundReceiptLine"
  | "InventoryLog"
  | "InventoryLogVerification"
  | "InventoryLogCorrectionRequest"
  | "InventoryLogCorrectionMovement"
  | "InventoryTask"
  | "InventoryDaySession"
  | "InventoryProductionMaterial"
  | "InventoryTaskChecklistItem"
  | "SuratJalan"
  | "SuratJalanItem"
  | "InternalStockOutRequest"
  | "BatchOperation"
  | "BatchOperationItem"
  | "ProductImportJob"
  | "ProductImportJobRow"
  | "ProductImportPlannedRow"
  | "BulkStockImportJob"
  | "Notification"
  | "PushSubscription";

export type DatabaseResetWhere = Record<string, unknown>;

export interface DatabaseResetOperation {
  model: DatabaseResetModel;
  domain: DatabaseResetDomain;
  mode: "selected" | "cascade";
  reason: string;
  count: number;
  where: DatabaseResetWhere;
}

export interface DatabaseResetCascade {
  model: DatabaseResetModel;
  count: number;
  reason: string;
  sourceDomain: DatabaseResetDomain;
}

export interface DatabaseResetDependency {
  domain: DatabaseResetDomain;
  reason: string;
  blocking: boolean;
}

export interface DatabaseResetPreserved {
  model: string;
  reason: string;
}

export interface DatabaseResetPlan {
  storeId: string;
  domains: DatabaseResetDomain[];
  operations: DatabaseResetOperation[];
  cascades: DatabaseResetCascade[];
  requiredDependencies: DatabaseResetDependency[];
  preserved: DatabaseResetPreserved[];
  canExecute: boolean;
}

export type DatabaseResetPreview = DatabaseResetPlan;

export interface DatabaseResetSummary {
  deleted: Array<{ model: DatabaseResetModel; count: number }>;
  executedAt: string;
}

export type DatabaseResetReadClient = PrismaClient;
export type DatabaseResetTransactionClient = Prisma.TransactionClient;

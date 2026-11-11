import type { DatabaseResetModel, DatabaseResetWhere } from "../types/database-reset";

export const DATABASE_RESET_CHILDREN: Partial<Record<DatabaseResetModel, DatabaseResetModel[]>> = {
  Product: ["ProductSupplier", "ProductPriceLog", "ProductStockGroupActivity", "InventoryProductionMaterial", "InternalStockOutRequest"],
  ProductStockGroup: ["ProductStockGroupActivity"],
  Customer: ["DebtPaymentLog"],
  Transaction: ["TransactionItem", "TransactionPayment", "DebtPaymentLog", "InvoiceDateChangeLog", "TransactionLifecycleAudit", "SuratJalan"],
  ManualIncome: ["ManualIncomePayment"],
  Supplier: ["ProductSupplier"],
  ShoppingRequest: ["ShoppingRequestItem", "ShoppingRequestDeletion"],
  GoodsPurchase: ["GoodsPurchaseItem"],
  InventoryInboundReceipt: ["InventoryInboundReceiptLine"],
  InventoryLog: ["InventoryLogVerification", "InventoryLogCorrectionRequest", "InventoryLogCorrectionMovement"],
  InventoryLogCorrectionRequest: ["InventoryLogCorrectionMovement"],
  SuratJalan: ["SuratJalanItem"],
  BatchOperation: ["BatchOperationItem", "ProductImportPlannedRow", "ProductImportJob"],
  ProductImportJob: ["ProductImportJobRow"],
};

export const DATABASE_RESET_CASCADE_WHERE: Partial<Record<DatabaseResetModel, Partial<Record<DatabaseResetModel, (storeId: string) => DatabaseResetWhere>>>> = {
  Customer: { DebtPaymentLog: storeId => ({ storeId, customer: { storeId } }) },
  Product: { ProductStockGroupActivity: storeId => ({ product: { storeId } }) },
  Supplier: { ProductSupplier: storeId => ({ supplier: { storeId } }) },
};

type SubdataDependency = {
  source: DatabaseResetModel;
  target: DatabaseResetModel;
  reference: DatabaseResetModel;
  where?: (storeId: string) => DatabaseResetWhere;
};

export const DATABASE_RESET_SUBDATA_DEPENDENCIES: SubdataDependency[] = [
  { source: "Product", target: "Transaction", reference: "TransactionItem", where: storeId => ({ transaction: { storeId }, OR: [{ productId: { not: null } }, { rawMaterialProductId: { not: null } }] }) },
  { source: "Product", target: "GoodsPurchase", reference: "GoodsPurchaseItem" },
  { source: "Product", target: "ShoppingRequest", reference: "ShoppingRequestItem" },
  { source: "Product", target: "InventoryInboundReceipt", reference: "InventoryInboundReceiptLine" },
  { source: "Product", target: "InventoryLog", reference: "InventoryLog" },
  { source: "Product", target: "SuratJalan", reference: "SuratJalanItem" },
  { source: "Product", target: "BatchOperation", reference: "BatchOperationItem", where: storeId => ({ batchOperation: { storeId }, productId: { not: null } }) },
  { source: "PrintingService", target: "Transaction", reference: "TransactionItem", where: storeId => ({ transaction: { storeId }, printingServiceId: { not: null } }) },
  { source: "Customer", target: "Transaction", reference: "Transaction", where: storeId => ({ storeId, customerId: { not: null } }) },
  { source: "Transaction", target: "InventoryLog", reference: "InventoryLog", where: storeId => ({ product: { storeId }, transactionId: { not: null } }) },
  { source: "Transaction", target: "PrintingReceipt", reference: "PrintingReceipt", where: storeId => ({ storeId, transactionId: { not: null } }) },
  { source: "Transaction", target: "SuratJalan", reference: "SuratJalanItem" },
  { source: "ShoppingRequest", target: "GoodsPurchase", reference: "GoodsPurchase" },
  { source: "ShoppingRequest", target: "Expense", reference: "Expense", where: storeId => ({ storeId, shoppingRequestId: { not: null } }) },
  { source: "GoodsPurchase", target: "Expense", reference: "Expense", where: storeId => ({ storeId, goodsPurchaseId: { not: null } }) },
  { source: "Supplier", target: "InventoryLog", reference: "InventoryLog", where: storeId => ({ product: { storeId }, supplierId: { not: null } }) },
];

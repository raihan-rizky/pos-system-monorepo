import { z } from "zod";
import {
  canRolePerformAction,
  type ResourceAction,
  type RolePermissions,
} from "@/features/rbac/helpers/rbac-core";
import {
  buildFinancialReportRange,
  type FinancialReportPreset,
} from "@/features/financial-report/helpers/report-core";
import type {
  AssistantClientAction,
  AssistantExportFormat,
  AssistantModalId,
  AssistantReportPeriod,
  UserRole,
} from "../types/assistant";
import {
  getCustomerDebtSummary,
  getCustomerRecapSummary,
  getCustomerSearch,
  getDailySalesSummary,
  getFinancialReportAnalysis,
  getLowStockItems,
  getPendingTransactions,
  getProductPrice,
  getProductSearch,
  getProductStock,
  getSupplierSearch,
  getSystemHelp,
  getTopProducts,
} from "../repositories/assistant-tools-repository";

export type AssistantToolName =
  | "get_system_help"
  | "get_low_stock_items"
  | "get_daily_sales_summary"
  | "get_product_search"
  | "get_product_stock"
  | "get_product_price"
  | "get_customer_search"
  | "get_customer_debt_summary"
  | "get_customer_recap_summary"
  | "get_supplier_search"
  | "get_top_products"
  | "get_pending_transactions"
  | "exportFinancialReport"
  | "exportCustomerRecap"
  | "analyzeFinancialReport"
  | "openProductModal"
  | "openCustomerModal"
  | "openSupplierModal"
  | "openSalespersonModal"
  | "openExpenseModal"
  | "openShiftModal"
  | "openStockUpdateModal"
  | "openInboundReceiptModal";

export type JsonObjectSchema = {
  type: "object";
  additionalProperties: false;
  properties: Record<string, unknown>;
  required?: string[];
};

export interface AssistantToolsRepository {
  getLowStockItems(input: { storeId: string; limit: number }): Promise<unknown>;
  getDailySalesSummary(input: { storeId: string; date: string }): Promise<unknown>;
  getSystemHelp(input: { query: string }): Promise<unknown>;
  getProductSearch(input: { storeId: string; query: string; limit: number }): Promise<unknown>;
  getProductStock(input: { storeId: string; query: string }): Promise<unknown>;
  getProductPrice(input: { storeId: string; query: string }): Promise<unknown>;
  getCustomerSearch(input: { storeId: string; query: string; limit: number }): Promise<unknown>;
  getCustomerDebtSummary(input: { storeId: string; query: string }): Promise<unknown>;
  getCustomerRecapSummary(input: { storeId: string; query: string }): Promise<unknown>;
  getSupplierSearch(input: { query: string; limit: number }): Promise<unknown>;
  getTopProducts(input: { storeId: string; date: string }): Promise<unknown>;
  getPendingTransactions(input: { storeId: string; limit: number }): Promise<unknown>;
  getFinancialReportAnalysis(input: {
    storeId: string;
    dateFrom: string;
    dateTo: string;
  }): Promise<unknown>;
}

type ToolContext = {
  storeId: string | null;
  repository: AssistantToolsRepository;
  now: Date;
};

export interface AssistantToolDefinition {
  name: AssistantToolName;
  description: string;
  allowedRoles: UserRole[];
  requiredCapabilities: Array<{ resource: string; action: ResourceAction }>;
  requiredAnyCapabilities?: Array<{ resource: string; action: ResourceAction; roles?: UserRole[] }>;
  requiresStore: boolean;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  parametersJsonSchema: JsonObjectSchema;
  retry: {
    maxAttempts: number;
  };
  errorCodes: string[];
  sourceLabel: string;
  execute(input: unknown, context: ToolContext): Promise<unknown>;
  shapeOutput(raw: unknown): unknown;
  clientAction?(output: unknown): AssistantClientAction | undefined;
}

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable().optional(),
  stock: z.number().optional(),
  minStock: z.number().optional(),
  unit: z.string().optional(),
  price: z.number().optional(),
  category: z.string().nullable().optional(),
});

const customerSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  type: z.string().optional(),
  totalDebt: z.number().optional(),
  totalSpent: z.number().optional(),
  totalOrders: z.number().optional(),
  lastVisitAt: z.unknown().optional(),
});

const generatedAtSchema = z.string().min(1);

const assistantReportPeriodSchema = z.enum(["daily", "weekly", "monthly", "30d"]);
const assistantExportFormatSchema = z.enum(["pdf", "xlsx"]);

const assistantClientActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("open_modal"),
    modal: z.enum([
      "product-create",
      "customer-create",
      "supplier-create",
      "salesperson-create",
      "expense-create",
      "shift-open",
      "inventory-stock-single",
      "inventory-inbound",
    ]),
    route: z.string().startsWith("/"),
  }).strict(),
  z.object({
    kind: z.literal("export_financial_report"),
    period: assistantReportPeriodSchema,
    format: assistantExportFormatSchema,
  }).strict(),
  z.object({
    kind: z.literal("export_customer_recap"),
    period: assistantReportPeriodSchema,
    format: assistantExportFormatSchema,
  }).strict(),
]);

const clientActionOutputSchema = z.object({
  kind: z.literal("client_action"),
  action: assistantClientActionSchema,
}).strict();

const financialReportSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  summary: z.object({
    transactionCount: z.number(),
    revenue: z.number(),
    collected: z.number(),
    grossProfit: z.number(),
    grossMargin: z.number(),
    discount: z.number(),
    outstandingDp: z.number(),
    shiftDiscrepancy: z.number(),
    missingCostLineCount: z.number(),
    lossStokNet: z.number(),
    lossStokUnclassifiedCount: z.number(),
    expenseTotal: z.number(),
    expenseEntryCount: z.number(),
    incompleteExpenseCount: z.number(),
    estimatedNetProfit: z.number(),
  }).strict(),
  paymentMethods: z.array(z.object({
    method: z.string(),
    transactionCount: z.number(),
    revenue: z.number(),
    collected: z.number(),
  }).strict()),
  topProducts: z.array(z.object({
    productId: z.string().nullable(),
    productName: z.string(),
    quantity: z.number(),
    revenue: z.number(),
    grossProfit: z.number(),
  }).strict()),
  categories: z.array(z.object({
    categoryName: z.string(),
    quantity: z.number(),
    revenue: z.number(),
    grossProfit: z.number(),
    transactionCount: z.number(),
  }).strict()),
  salespersons: z.array(z.object({
    name: z.string(),
    transactionCount: z.number(),
    revenue: z.number(),
    collected: z.number(),
    grossProfit: z.number(),
  }).strict()),
  shifts: z.array(z.object({
    id: z.string(),
    cashierName: z.string(),
    openedAt: z.string(),
    closedAt: z.string().nullable(),
    openingBalance: z.number(),
    expectedBalance: z.number(),
    closingBalance: z.number(),
    discrepancy: z.number(),
    status: z.string(),
  }).strict()),
  lossStok: z.array(z.object({
    reason: z.enum(["WASTE", "USAGE", "OPNAME", "MANUAL_ADJUSTMENT", "UNCLASSIFIED"]),
    netValue: z.number(),
    netQuantity: z.number(),
    entryCount: z.number(),
  }).strict()),
  trend: z.object({
    granularity: z.enum(["daily", "weekly", "monthly"]),
    points: z.array(z.object({
      bucketKey: z.string(),
      label: z.string(),
      omzet: z.number(),
      cost: z.number(),
      labaKotor: z.number(),
    }).strict()),
  }).strict(),
}).strict();

const financialCoverage = [
  "summary",
  "trend",
  "paymentMethods",
  "topProducts",
  "categories",
  "salespersons",
  "lossStok",
  "shifts",
] as const;

const defaultToolsRepository: AssistantToolsRepository = {
  getLowStockItems,
  getDailySalesSummary,
  getSystemHelp,
  getProductSearch,
  getProductStock,
  getProductPrice,
  getCustomerSearch,
  getCustomerDebtSummary,
  getCustomerRecapSummary,
  getSupplierSearch,
  getTopProducts,
  getPendingTransactions,
  getFinancialReportAnalysis,
};

const emptyJsonSchema: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const queryJsonSchema = (description: string): JsonObjectSchema => ({
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: { type: "string", minLength: 1, description },
  },
});

const searchJsonSchema = (description: string): JsonObjectSchema => ({
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: { type: "string", minLength: 1, description },
    limit: { type: "integer", minimum: 1, maximum: 10, default: 10 },
  },
});

function withKind<T extends Record<string, unknown>>(kind: string, raw: T): T & { kind: string } {
  return { kind, ...raw };
}

function createTool(definition: AssistantToolDefinition): AssistantToolDefinition {
  return definition;
}

function actionFromOutput(output: unknown): AssistantClientAction | undefined {
  const parsed = clientActionOutputSchema.safeParse(output);
  return parsed.success ? parsed.data.action : undefined;
}

const exportParametersJsonSchema: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    period: {
      type: "string",
      enum: ["daily", "weekly", "monthly", "30d"],
      default: "30d",
      description: "Periode laporan. Gunakan 30d jika pengguna tidak menyebut periode.",
    },
    format: {
      type: "string",
      enum: ["pdf", "xlsx"],
      default: "pdf",
      description: "Format berkas. Gunakan pdf jika pengguna tidak menyebut format.",
    },
  },
};

function createExportActionTool({
  name,
  actionKind,
  description,
  allowedRoles,
  requiredCapabilities,
  sourceLabel,
}: {
  name: "exportFinancialReport" | "exportCustomerRecap";
  actionKind: "export_financial_report" | "export_customer_recap";
  description: string;
  allowedRoles: UserRole[];
  requiredCapabilities: Array<{ resource: string; action: ResourceAction }>;
  sourceLabel: string;
}): AssistantToolDefinition {
  return createTool({
    name,
    description,
    allowedRoles,
    requiredCapabilities,
    requiresStore: true,
    inputSchema: z.object({
      period: assistantReportPeriodSchema.default("30d"),
      format: assistantExportFormatSchema.default("pdf"),
    }).strict(),
    outputSchema: clientActionOutputSchema,
    parametersJsonSchema: exportParametersJsonSchema,
    retry: { maxAttempts: 1 },
    errorCodes: ["CLIENT_ACTION_FAILED"],
    sourceLabel,
    execute: async (input) => input,
    shapeOutput: (raw) => {
      const value = raw as { period?: AssistantReportPeriod; format?: AssistantExportFormat };
      return {
        kind: "client_action",
        action: {
          kind: actionKind,
          period: value.period ?? "30d",
          format: value.format ?? "pdf",
        },
      };
    },
    clientAction: actionFromOutput,
  });
}

function createModalActionTool({
  name,
  modal,
  route,
  description,
  allowedRoles,
  requiredCapabilities,
  sourceLabel,
}: {
  name: Extract<AssistantToolName, `open${string}Modal`>;
  modal: AssistantModalId;
  route: string;
  description: string;
  allowedRoles: UserRole[];
  requiredCapabilities: Array<{ resource: string; action: ResourceAction }>;
  sourceLabel: string;
}): AssistantToolDefinition {
  return createTool({
    name,
    description,
    allowedRoles,
    requiredCapabilities,
    requiresStore: false,
    inputSchema: z.object({}).strict(),
    outputSchema: clientActionOutputSchema,
    parametersJsonSchema: emptyJsonSchema,
    retry: { maxAttempts: 1 },
    errorCodes: ["CLIENT_ACTION_FAILED"],
    sourceLabel,
    execute: async () => ({}),
    shapeOutput: () => ({
      kind: "client_action",
      action: { kind: "open_modal", modal, route },
    }),
    clientAction: actionFromOutput,
  });
}

function reportPreset(period: AssistantReportPeriod): FinancialReportPreset {
  if (period === "daily") return "today";
  if (period === "weekly") return "7d";
  if (period === "monthly") return "month";
  return "30d";
}

export function createAssistantToolRegistry(
  repository: AssistantToolsRepository = defaultToolsRepository,
): AssistantToolDefinition[] {
  const allStoreRoles: UserRole[] = ["OWNER", "ADMIN", "INVENTORY", "CASHIER", "SALES"];
  const productRoles: UserRole[] = ["OWNER", "ADMIN", "INVENTORY", "CASHIER"];
  const customerRoles: UserRole[] = ["OWNER", "ADMIN", "SALES"];
  const customerCreateRoles: UserRole[] = ["OWNER", "ADMIN", "CASHIER", "SALES"];

  return [
    createExportActionTool({
      name: "exportFinancialReport",
      actionKind: "export_financial_report",
      description: "Export the existing financial report as PDF or Excel. USE for: unduh, ekspor, buat file, atau rekap laporan keuangan. Defaults to the latest 30 days and PDF when omitted. DO NOT USE for: explaining or analyzing financial performance (use analyzeFinancialReport).",
      allowedRoles: ["OWNER", "ADMIN"],
      requiredCapabilities: [{ resource: "financial-report", action: "read" }],
      sourceLabel: "Ekspor Laporan Keuangan",
    }),
    createExportActionTool({
      name: "exportCustomerRecap",
      actionKind: "export_customer_recap",
      description: "Export the existing all-customer recap with AI insights as PDF or Excel. USE for: unduh, ekspor, buat file, atau rekap pelanggan per tipe. Defaults to the latest 30 days and PDF when omitted. DO NOT USE for: one named customer's transaction summary (use get_customer_recap_summary).",
      allowedRoles: customerCreateRoles,
      requiredCapabilities: [{ resource: "customer", action: "read" }],
      sourceLabel: "Ekspor Rekap Pelanggan",
    }),
    createTool({
      name: "analyzeFinancialReport",
      description: "Return EVERY metric shown on the Financial Report page for one period: KPI summary including expenses and estimated net profit, trend, payment methods, top products, categories, salespersons, stock loss, and shift reconciliation. USE for: analisis menyeluruh laporan keuangan, evaluasi performa, risiko, dan saran bisnis. Defaults to the latest 30 days. DO NOT USE for: downloading a file (use exportFinancialReport) or a single daily omzet figure (use get_daily_sales_summary).",
      allowedRoles: ["OWNER", "ADMIN"],
      requiredCapabilities: [{ resource: "financial-report", action: "read" }],
      requiresStore: true,
      inputSchema: z.object({
        period: assistantReportPeriodSchema.default("30d"),
      }).strict(),
      outputSchema: z.object({
        kind: z.literal("financial_report_analysis"),
        generatedAt: generatedAtSchema,
        period: assistantReportPeriodSchema,
        coverage: z.array(z.enum(financialCoverage)),
        report: financialReportSchema,
      }).strict(),
      parametersJsonSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          period: {
            type: "string",
            enum: ["daily", "weekly", "monthly", "30d"],
            default: "30d",
            description: "Periode analisis. Gunakan 30d jika pengguna tidak menyebut periode.",
          },
        },
      },
      retry: { maxAttempts: 2 },
      errorCodes: ["STORE_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Seluruh metrik Laporan Keuangan",
      execute: async (input, context) => {
        const { period } = input as { period: AssistantReportPeriod };
        const range = buildFinancialReportRange(reportPreset(period), context.now);
        const report = await repository.getFinancialReportAnalysis({
          storeId: context.storeId!,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
        });
        return {
          period,
          report,
          generatedAt: context.now.toISOString(),
        };
      },
      shapeOutput: (raw) => {
        const value = raw as {
          period?: AssistantReportPeriod;
          report?: unknown;
          generatedAt?: string;
        };
        return {
          kind: "financial_report_analysis",
          generatedAt: value.generatedAt ?? new Date().toISOString(),
          period: value.period ?? "30d",
          coverage: [...financialCoverage],
          report: value.report,
        };
      },
    }),
    createModalActionTool({
      name: "openProductModal",
      modal: "product-create",
      route: "/products",
      description: "Open the Tambah Produk modal. USE for: tambah, buat, atau input satu produk baru. DO NOT USE for: bulk product import, editing an existing product, or merely explaining the steps.",
      allowedRoles: ["OWNER", "ADMIN"],
      requiredCapabilities: [{ resource: "product", action: "create" }],
      sourceLabel: "Aksi Tambah Produk",
    }),
    createModalActionTool({
      name: "openCustomerModal",
      modal: "customer-create",
      route: "/customers",
      description: "Open the Tambah Pelanggan modal. USE for: tambah, buat, atau daftarkan satu pelanggan baru. DO NOT USE for: customer search, recap, debt checks, or bulk import.",
      allowedRoles: customerCreateRoles,
      requiredCapabilities: [{ resource: "customer", action: "create" }],
      sourceLabel: "Aksi Tambah Pelanggan",
    }),
    createModalActionTool({
      name: "openSupplierModal",
      modal: "supplier-create",
      route: "/suppliers",
      description: "Open the Tambah Supplier modal. USE for: tambah, buat, atau daftarkan supplier baru. DO NOT USE for: supplier search, shopping requests, or editing a supplier.",
      allowedRoles: ["OWNER", "ADMIN"],
      requiredCapabilities: [{ resource: "supplier", action: "create" }],
      sourceLabel: "Aksi Tambah Supplier",
    }),
    createModalActionTool({
      name: "openSalespersonModal",
      modal: "salesperson-create",
      route: "/salespersons",
      description: "Open the Tambah Sales modal. USE for: tambah atau daftarkan salesperson baru. DO NOT USE for: salesperson performance analysis, history, or editing an existing salesperson.",
      allowedRoles: ["OWNER", "ADMIN"],
      requiredCapabilities: [{ resource: "salesperson", action: "create" }],
      sourceLabel: "Aksi Tambah Sales",
    }),
    createModalActionTool({
      name: "openExpenseModal",
      modal: "expense-create",
      route: "/keuangan",
      description: "Open the Tambah Pengeluaran modal. USE for: catat atau tambah pengeluaran operasional baru. DO NOT USE for: financial-report analysis, income entry, or editing an existing expense.",
      allowedRoles: ["OWNER", "ADMIN", "CASHIER"],
      requiredCapabilities: [{ resource: "expense", action: "create" }],
      sourceLabel: "Aksi Tambah Pengeluaran",
    }),
    createModalActionTool({
      name: "openShiftModal",
      modal: "shift-open",
      route: "/shift",
      description: "Open the Mulai Shift Kasir modal. USE for: buka atau mulai shift kasir. DO NOT USE for: closing an active shift, editing shift history, or checking shift metrics.",
      allowedRoles: ["OWNER", "ADMIN", "CASHIER"],
      requiredCapabilities: [{ resource: "shift", action: "create" }],
      sourceLabel: "Aksi Mulai Shift",
    }),
    createModalActionTool({
      name: "openStockUpdateModal",
      modal: "inventory-stock-single",
      route: "/inventory",
      description: "Open the single-product Update Stok modal. USE for: tambah, kurangi, atau set stok satu produk. DO NOT USE for: reading stock, mass stock updates, or stock approval.",
      allowedRoles: ["OWNER", "ADMIN", "INVENTORY"],
      requiredCapabilities: [{ resource: "inventory", action: "update" }],
      sourceLabel: "Aksi Update Stok",
    }),
    createModalActionTool({
      name: "openInboundReceiptModal",
      modal: "inventory-inbound",
      route: "/inventory",
      description: "Open the Penerimaan Barang modal. USE for: input atau ajukan barang datang dari supplier. DO NOT USE for: approving an inbound receipt, shopping requests, or stock lookup.",
      allowedRoles: ["OWNER", "ADMIN", "INVENTORY"],
      requiredCapabilities: [{ resource: "inventory", action: "create" }],
      sourceLabel: "Aksi Penerimaan Barang",
    }),
    createTool({
      name: "get_system_help",
      description: "Search official in-app help docs for POS workflows, menus, role permissions, and feature usage. USE for: cara pakai fitur, langkah-langkah, menu apa, hak akses. DO NOT USE for: live store data queries.",
      allowedRoles: allStoreRoles,
      requiredCapabilities: [],
      requiresStore: false,
      inputSchema: z.object({ query: z.string().min(1) }).strict(),
      outputSchema: z.object({
        kind: z.literal("system_help"),
        generatedAt: generatedAtSchema,
        markdown: z.string(),
        sourceRefs: z.array(z.string()),
      }).strict(),
      parametersJsonSchema: queryJsonSchema("User's exact question about POS features, workflow, menus, or app usage."),
      retry: { maxAttempts: 2 },
      errorCodes: ["DOC_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Dokumentasi bantuan",
      execute: (input) => repository.getSystemHelp(input as { query: string }),
      shapeOutput: (raw) => {
        const value = raw as { markdown?: string; sourceRefs?: string[]; generatedAt?: string };
        return withKind("system_help", {
          markdown: value.markdown ?? "",
          sourceRefs: Array.isArray(value.sourceRefs) ? value.sourceRefs : [],
          generatedAt: value.generatedAt ?? new Date().toISOString(),
        });
      },
    }),
    createTool({
      name: "get_low_stock_items",
      description: "Return ALL products where stock ≤ minimum stock for the store. USE for: stok rendah, stok menipis, barang habis, daftar minimum stok. DO NOT USE for: checking one specific product's stock (use get_product_stock instead).",
      allowedRoles: ["OWNER", "ADMIN", "INVENTORY"],
      requiredCapabilities: [{ resource: "inventory", action: "read" }],
      requiresStore: true,
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({
        kind: z.literal("low_stock_items"),
        generatedAt: generatedAtSchema,
        items: z.array(productSchema.extend({
          stock: z.number(),
          minStock: z.number(),
          unit: z.string(),
        })),
        total: z.number(),
      }).strict(),
      parametersJsonSchema: emptyJsonSchema,
      retry: { maxAttempts: 2 },
      errorCodes: ["STORE_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Alat stok rendah",
      execute: (_input, context) => repository.getLowStockItems({ storeId: context.storeId!, limit: 50 }),
      shapeOutput: (raw) => {
        const value = raw as { items?: unknown[]; total?: number; generatedAt?: string };
        const items = Array.isArray(value.items) ? value.items : [];
        return withKind("low_stock_items", {
          items,
          total: typeof value.total === "number" ? value.total : items.length,
          generatedAt: value.generatedAt ?? new Date().toISOString(),
        });
      },
    }),
    createTool({
      name: "get_daily_sales_summary",
      description: "Return completed sales metrics (revenue, gross profit, transaction count) for one exact business date. USE for: omzet hari ini, penjualan tanggal X, ringkasan sales. Requires date in YYYY-MM-DD. DO NOT USE for: top products or multi-date ranges.",
      allowedRoles: ["OWNER", "ADMIN"],
      requiredCapabilities: [{ resource: "financial-report", action: "read" }],
      requiresStore: true,
      inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD format") }).strict(),
      outputSchema: z.object({
        kind: z.literal("daily_sales_summary"),
        generatedAt: generatedAtSchema,
        date: z.string(),
        revenue: z.number(),
        grossProfit: z.number(),
        transactionCount: z.number(),
      }).strict(),
      parametersJsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["date"],
        properties: {
          date: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description: "Business date in YYYY-MM-DD format.",
          },
        },
      },
      retry: { maxAttempts: 2 },
      errorCodes: ["INVALID_DATE", "STORE_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Alat ringkasan penjualan",
      execute: (input, context) => {
        const { date } = input as { date: string };
        return repository.getDailySalesSummary({ storeId: context.storeId!, date });
      },
      shapeOutput: (raw) => {
        const v = raw as Record<string, unknown>;
        return withKind("daily_sales_summary", {
          date: typeof v.date === "string" ? v.date : "",
          revenue: typeof v.revenue === "number" ? v.revenue : 0,
          grossProfit: typeof v.grossProfit === "number" ? v.grossProfit : 0,
          transactionCount: typeof v.transactionCount === "number" ? v.transactionCount : 0,
          generatedAt: typeof v.generatedAt === "string" ? v.generatedAt : new Date().toISOString(),
        });
      },
    }),
    createTool({
      name: "get_product_search",
      description: "Search active products by keyword, SKU, or barcode. USE for: cari produk X, find item, nama produk tidak jelas. DO NOT USE if user asks about stock level of a known product (use get_product_stock) or price (use get_product_price).",
      allowedRoles: productRoles,
      requiredCapabilities: [],
      requiredAnyCapabilities: [
        { resource: "product", action: "read" },
        { resource: "inventory", action: "read", roles: ["INVENTORY"] },
      ],
      requiresStore: true,
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(10).default(10),
      }).strict(),
      outputSchema: z.object({
        kind: z.literal("product_search"),
        generatedAt: generatedAtSchema,
        items: z.array(productSchema),
        total: z.number(),
      }).strict(),
      parametersJsonSchema: searchJsonSchema("General product keyword, SKU, or barcode. Use for discovery when the exact item is unknown."),
      retry: { maxAttempts: 2 },
      errorCodes: ["STORE_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Alat produk",
      execute: (input, context) => {
        const { query, limit } = input as { query: string; limit: number };
        return repository.getProductSearch({ storeId: context.storeId!, query, limit });
      },
      shapeOutput: (raw) => {
        const v = raw as { items?: unknown[]; total?: number; generatedAt?: string };
        return withKind("product_search", {
          items: Array.isArray(v.items) ? v.items : [],
          total: typeof v.total === "number" ? v.total : 0,
          generatedAt: v.generatedAt ?? new Date().toISOString(),
        });
      },
    }),
    createTool({
      name: "get_product_stock",
      description: "Return stock level for one specific named product. USE for: stok [produk X] berapa, cek stok [nama]. DO NOT USE for broad low-stock lists (use get_low_stock_items) or when product name is unknown (use get_product_search first) or when user asks about price (use get_product_price).",
      allowedRoles: productRoles,
      requiredCapabilities: [],
      requiredAnyCapabilities: [
        { resource: "product", action: "read" },
        { resource: "inventory", action: "read", roles: ["INVENTORY"] },
      ],
      requiresStore: true,
      inputSchema: z.object({ query: z.string().min(1) }).strict(),
      outputSchema: z.object({
        kind: z.literal("product_stock"),
        generatedAt: generatedAtSchema,
        match: productSchema.nullable(),
        candidates: z.array(productSchema).optional(),
      }).strict(),
      parametersJsonSchema: queryJsonSchema("One specific product name, SKU, or barcode. Use get_low_stock_items for broad low-stock questions."),
      retry: { maxAttempts: 2 },
      errorCodes: ["NOT_FOUND", "STORE_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Alat produk",
      execute: (input, context) => {
        const { query } = input as { query: string };
        return repository.getProductStock({ storeId: context.storeId!, query });
      },
      shapeOutput: (raw) => {
        const v = raw as { match?: unknown; candidates?: unknown[]; generatedAt?: string };
        return withKind("product_stock", {
          match: v.match ?? null,
          candidates: Array.isArray(v.candidates) ? v.candidates : undefined,
          generatedAt: v.generatedAt ?? new Date().toISOString(),
        });
      },
    }),
    createTool({
      name: "get_product_price",
      description: "Return selling price for one specific named product. USE for: harga [produk X] berapa, harga jual. DO NOT USE when product name is unknown (use get_product_search first) or when user asks about stock (use get_product_stock).",
      allowedRoles: productRoles,
      requiredCapabilities: [],
      requiredAnyCapabilities: [
        { resource: "product", action: "read" },
        { resource: "inventory", action: "read", roles: ["INVENTORY"] },
      ],
      requiresStore: true,
      inputSchema: z.object({ query: z.string().min(1) }).strict(),
      outputSchema: z.object({
        kind: z.literal("product_price"),
        generatedAt: generatedAtSchema,
        match: productSchema.nullable(),
        candidates: z.array(productSchema).optional(),
      }).strict(),
      parametersJsonSchema: queryJsonSchema("One specific product name, SKU, or barcode."),
      retry: { maxAttempts: 2 },
      errorCodes: ["NOT_FOUND", "STORE_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Alat produk",
      execute: (input, context) => {
        const { query } = input as { query: string };
        return repository.getProductPrice({ storeId: context.storeId!, query });
      },
      shapeOutput: (raw) => {
        const v = raw as { match?: unknown; candidates?: unknown[]; generatedAt?: string };
        return withKind("product_price", {
          match: v.match ?? null,
          candidates: Array.isArray(v.candidates) ? v.candidates : undefined,
          generatedAt: v.generatedAt ?? new Date().toISOString(),
        });
      },
    }),
    createTool({
      name: "get_customer_search",
      description: "Search customers by name, phone, company, or email. USE for: cari pelanggan X, find customer, nama tidak jelas. DO NOT USE when customer is known and user wants debt/recap data (use get_customer_debt_summary or get_customer_recap_summary directly).",
      allowedRoles: customerRoles,
      requiredCapabilities: [{ resource: "customer", action: "read" }],
      requiresStore: true,
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(10).default(10),
      }).strict(),
      outputSchema: z.object({
        kind: z.literal("customer_search"),
        generatedAt: generatedAtSchema,
        items: z.array(customerSchema),
        total: z.number(),
      }).strict(),
      parametersJsonSchema: searchJsonSchema("Customer name, phone, company, or email. Use for discovery before a customer-specific summary."),
      retry: { maxAttempts: 2 },
      errorCodes: ["STORE_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Alat customer",
      execute: (input, context) => {
        const { query, limit } = input as { query: string; limit: number };
        return repository.getCustomerSearch({ storeId: context.storeId!, query, limit });
      },
      shapeOutput: (raw) => {
        const v = raw as { items?: unknown[]; total?: number; generatedAt?: string };
        return withKind("customer_search", {
          items: Array.isArray(v.items) ? v.items : [],
          total: typeof v.total === "number" ? v.total : 0,
          generatedAt: v.generatedAt ?? new Date().toISOString(),
        });
      },
    }),
    createTool({
      name: "get_customer_debt_summary",
      description: "Return outstanding debt for one specific customer. USE for: piutang [pelanggan X], utang [nama], tagihan belum lunas. DO NOT USE for all-customer debt rankings or totals (not supported).",
      allowedRoles: customerRoles,
      requiredCapabilities: [{ resource: "customer", action: "read" }],
      requiresStore: true,
      inputSchema: z.object({ query: z.string().min(1) }).strict(),
      outputSchema: z.object({
        kind: z.literal("customer_debt_summary"),
        generatedAt: generatedAtSchema,
        match: customerSchema.nullable(),
        candidates: z.array(customerSchema).optional(),
      }).strict(),
      parametersJsonSchema: queryJsonSchema("One specific customer name, phone, company, or email. Not for all-customer debt lists."),
      retry: { maxAttempts: 2 },
      errorCodes: ["NOT_FOUND", "STORE_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Alat customer",
      execute: (input, context) => {
        const { query } = input as { query: string };
        return repository.getCustomerDebtSummary({ storeId: context.storeId!, query });
      },
      shapeOutput: (raw) => {
        const v = raw as { match?: unknown; candidates?: unknown[]; generatedAt?: string };
        return withKind("customer_debt_summary", {
          match: v.match ?? null,
          candidates: Array.isArray(v.candidates) ? v.candidates : undefined,
          generatedAt: v.generatedAt ?? new Date().toISOString(),
        });
      },
    }),
    createTool({
      name: "get_customer_recap_summary",
      description: "Return 30-day transaction recap (total orders, revenue, debt paid) for one specific customer. USE for: rekap [pelanggan X], ringkasan transaksi pelanggan, riwayat belanja. DO NOT USE for global customer lists.",
      allowedRoles: customerRoles,
      requiredCapabilities: [{ resource: "customer", action: "read" }],
      requiresStore: true,
      inputSchema: z.object({
        query: z.string().min(1),
        preset: z.literal("30d").optional(),
      }).strict(),
      outputSchema: z.object({
        kind: z.literal("customer_recap_summary"),
        generatedAt: generatedAtSchema,
        match: customerSchema.extend({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          transactionCount: z.number().optional(),
          revenue: z.number().optional(),
          debtPaid: z.number().optional(),
        }).nullable(),
        candidates: z.array(customerSchema).optional(),
      }).strict(),
      parametersJsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: {
            type: "string",
            minLength: 1,
            description: "One specific customer name, phone, company, or email.",
          },
          preset: {
            type: "string",
            enum: ["30d"],
            default: "30d",
            description: "Currently only the latest 30-day recap is supported.",
          },
        },
      },
      retry: { maxAttempts: 2 },
      errorCodes: ["NOT_FOUND", "STORE_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Alat customer",
      execute: (input, context) => {
        const { query } = input as { query: string };
        return repository.getCustomerRecapSummary({ storeId: context.storeId!, query });
      },
      shapeOutput: (raw) => {
        const v = raw as { match?: unknown; candidates?: unknown[]; generatedAt?: string };
        return withKind("customer_recap_summary", {
          match: v.match ?? null,
          candidates: Array.isArray(v.candidates) ? v.candidates : undefined,
          generatedAt: v.generatedAt ?? new Date().toISOString(),
        });
      },
    }),
    createTool({
      name: "get_supplier_search",
      description: "Search active suppliers by name, phone, or contact person. USE for: cari supplier X, info pemasok, kontak distributor. DO NOT USE for supplier performance rankings (not supported).",
      allowedRoles: ["OWNER", "ADMIN"],
      requiredCapabilities: [{ resource: "supplier", action: "read" }],
      requiresStore: false,
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(10).default(10),
      }).strict(),
      outputSchema: z.object({
        kind: z.literal("supplier_search"),
        generatedAt: generatedAtSchema,
        items: z.array(z.object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
          phone: z.string().nullable().optional(),
          contactPerson: z.string().nullable().optional(),
          address: z.string().nullable().optional(),
        })),
        total: z.number(),
      }).strict(),
      parametersJsonSchema: searchJsonSchema("Supplier name, phone, or contact person."),
      retry: { maxAttempts: 2 },
      errorCodes: ["NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Alat supplier",
      execute: (input) => {
        const { query, limit } = input as { query: string; limit: number };
        return repository.getSupplierSearch({ query, limit });
      },
      shapeOutput: (raw) => {
        const v = raw as { items?: unknown[]; total?: number; generatedAt?: string };
        return withKind("supplier_search", {
          items: Array.isArray(v.items) ? v.items : [],
          total: typeof v.total === "number" ? v.total : 0,
          generatedAt: v.generatedAt ?? new Date().toISOString(),
        });
      },
    }),
    createTool({
      name: "get_top_products",
      description: "Return top 10 best-selling products by revenue for one business date. USE for: produk terlaris, best seller hari ini, penjualan produk tertinggi tanggal X. DO NOT USE for general sales summary (use get_daily_sales_summary).",
      allowedRoles: ["OWNER", "ADMIN"],
      requiredCapabilities: [{ resource: "transaction", action: "read" }],
      requiresStore: true,
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD format"),
      }).strict(),
      outputSchema: z.object({
        kind: z.literal("top_products"),
        generatedAt: generatedAtSchema,
        date: z.string(),
        items: z.array(z.object({
          productId: z.string().nullable(),
          productName: z.string(),
          quantitySold: z.number(),
          revenue: z.number(),
        })),
      }).strict(),
      parametersJsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["date"],
        properties: {
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Business date in YYYY-MM-DD format." },
        },
      },
      retry: { maxAttempts: 2 },
      errorCodes: ["INVALID_DATE", "STORE_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Alat produk terlaris",
      execute: (input, context) => {
        const { date } = input as { date: string };
        return repository.getTopProducts({ storeId: context.storeId!, date });
      },
      shapeOutput: (raw) => {
        const v = raw as { date?: string; items?: unknown[]; generatedAt?: string };
        return withKind("top_products", {
          date: typeof v.date === "string" ? v.date : "",
          items: Array.isArray(v.items) ? v.items : [],
          generatedAt: v.generatedAt ?? new Date().toISOString(),
        });
      },
    }),
    createTool({
      name: "get_pending_transactions",
      description: "Return transactions with status PENDING_APPROVAL, DP (partial payment), or DRAFT. USE for: transaksi pending, belum lunas, DP, draft transaksi. DO NOT USE for completed transaction history (not supported here).",
      allowedRoles: ["OWNER", "ADMIN", "CASHIER"],
      requiredCapabilities: [{ resource: "transaction", action: "read" }],
      requiresStore: true,
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({
        kind: z.literal("pending_transactions"),
        generatedAt: generatedAtSchema,
        items: z.array(z.object({
          id: z.string(),
          invoiceNumber: z.string().nullable().optional(),
          status: z.string(),
          total: z.number(),
          customerName: z.string().nullable().optional(),
          createdAt: z.string(),
          isJobOrder: z.boolean(),
        })),
        total: z.number(),
      }).strict(),
      parametersJsonSchema: emptyJsonSchema,
      retry: { maxAttempts: 2 },
      errorCodes: ["STORE_NOT_FOUND", "TIMEOUT"],
      sourceLabel: "Alat transaksi pending",
      execute: (_input, context) => repository.getPendingTransactions({ storeId: context.storeId!, limit: 20 }),
      shapeOutput: (raw) => {
        const v = raw as { items?: unknown[]; total?: number; generatedAt?: string };
        return withKind("pending_transactions", {
          items: Array.isArray(v.items) ? v.items : [],
          total: typeof v.total === "number" ? v.total : 0,
          generatedAt: v.generatedAt ?? new Date().toISOString(),
        });
      },
    }),
  ];
}

export function isToolPermittedForRole(
  tool: AssistantToolDefinition,
  role: UserRole,
  permissions?: RolePermissions,
) {
  return tool.allowedRoles.includes(role)
    && tool.requiredCapabilities.every((capability) =>
      canRolePerformAction(role, capability.resource, capability.action, permissions)
    )
    && (
      !tool.requiredAnyCapabilities?.length
      || tool.requiredAnyCapabilities.some((capability) =>
        (!capability.roles || capability.roles.includes(role)) &&
        canRolePerformAction(role, capability.resource, capability.action, permissions)
      )
    );
}

export function getToolsForRole(role: UserRole, repository?: AssistantToolsRepository, permissions?: RolePermissions) {
  return createAssistantToolRegistry(repository).filter((tool) => isToolPermittedForRole(tool, role, permissions));
}

export function getOpenAiToolsForRole(role: UserRole, repository?: AssistantToolsRepository, permissions?: RolePermissions) {
  return getToolsForRole(role, repository, permissions).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parametersJsonSchema,
    },
  }));
}

export function findToolForRole(role: UserRole, name: string, repository?: AssistantToolsRepository, permissions?: RolePermissions) {
  return getToolsForRole(role, repository, permissions).find((tool) => tool.name === name);
}

export function isRetriableToolError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /timeout|timed out|econnreset|deadlock|connection|temporar|rate limit|too many requests|503|502|504/.test(message);
}

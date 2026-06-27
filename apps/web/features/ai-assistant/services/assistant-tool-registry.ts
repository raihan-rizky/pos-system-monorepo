import { z } from "zod";
import type { UserRole } from "../types/assistant";
import {
  getCustomerDebtSummary,
  getCustomerRecapSummary,
  getCustomerSearch,
  getDailySalesSummary,
  getLowStockItems,
  getProductPrice,
  getProductSearch,
  getProductStock,
  getSystemHelp,
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
  | "get_customer_recap_summary";

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
}

type ToolContext = {
  storeId: string | null;
  repository: AssistantToolsRepository;
};

export interface AssistantToolDefinition {
  name: AssistantToolName;
  description: string;
  allowedRoles: UserRole[];
  requiresStore: boolean;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  parametersJsonSchema: JsonObjectSchema;
  retry: {
    maxAttempts: number;
  };
  sourceLabel: string;
  execute(input: unknown, context: ToolContext): Promise<unknown>;
  shapeOutput(raw: unknown): unknown;
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

export function createAssistantToolRegistry(
  repository: AssistantToolsRepository = defaultToolsRepository,
): AssistantToolDefinition[] {
  const allStoreRoles: UserRole[] = ["OWNER", "ADMIN", "INVENTORY", "CASHIER", "SALES"];
  const productRoles: UserRole[] = ["OWNER", "ADMIN", "INVENTORY", "CASHIER"];
  const customerRoles: UserRole[] = ["OWNER", "ADMIN", "SALES"];

  return [
    createTool({
      name: "get_system_help",
      description: "Search official in-app help docs for POS workflows, menus, role permissions, and feature usage. Use before giving manual step-by-step guidance.",
      allowedRoles: allStoreRoles,
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
      description: "Return store-scoped products where stock is less than or equal to minimum stock. Use for broad questions like stok rendah, stok menipis, barang habis, or minimum stock lists.",
      allowedRoles: ["OWNER", "ADMIN", "INVENTORY"],
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
      description: "Return store-scoped completed sales metrics for one exact business date: revenue, gross profit, and transaction count. Requires YYYY-MM-DD date.",
      allowedRoles: ["OWNER"],
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
      sourceLabel: "Alat ringkasan penjualan",
      execute: (input, context) => {
        const { date } = input as { date: string };
        return repository.getDailySalesSummary({ storeId: context.storeId!, date });
      },
      shapeOutput: (raw) => withKind("daily_sales_summary", raw as Record<string, unknown>),
    }),
    createTool({
      name: "get_product_search",
      description: "Search active products by keyword, SKU, or barcode. Use when the user is discovering products or the item name is ambiguous.",
      allowedRoles: productRoles,
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
      sourceLabel: "Alat produk",
      execute: (input, context) => {
        const { query, limit } = input as { query: string; limit: number };
        return repository.getProductSearch({ storeId: context.storeId!, query, limit });
      },
      shapeOutput: (raw) => withKind("product_search", raw as Record<string, unknown>),
    }),
    createTool({
      name: "get_product_stock",
      description: "Return stock details for one specific product query. Do not use for broad low-stock questions; use get_low_stock_items instead.",
      allowedRoles: productRoles,
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
      sourceLabel: "Alat produk",
      execute: (input, context) => {
        const { query } = input as { query: string };
        return repository.getProductStock({ storeId: context.storeId!, query });
      },
      shapeOutput: (raw) => withKind("product_stock", raw as Record<string, unknown>),
    }),
    createTool({
      name: "get_product_price",
      description: "Return selling price and product context for one specific product query.",
      allowedRoles: productRoles,
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
      sourceLabel: "Alat produk",
      execute: (input, context) => {
        const { query } = input as { query: string };
        return repository.getProductPrice({ storeId: context.storeId!, query });
      },
      shapeOutput: (raw) => withKind("product_price", raw as Record<string, unknown>),
    }),
    createTool({
      name: "get_customer_search",
      description: "Search customers by name, phone, company, or email. Use when the customer is ambiguous or the user asks to find a customer.",
      allowedRoles: customerRoles,
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
      sourceLabel: "Alat customer",
      execute: (input, context) => {
        const { query, limit } = input as { query: string; limit: number };
        return repository.getCustomerSearch({ storeId: context.storeId!, query, limit });
      },
      shapeOutput: (raw) => withKind("customer_search", raw as Record<string, unknown>),
    }),
    createTool({
      name: "get_customer_debt_summary",
      description: "Return debt context for one specific customer. Never use for global all-customer debt ranking or totals.",
      allowedRoles: customerRoles,
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
      sourceLabel: "Alat customer",
      execute: (input, context) => {
        const { query } = input as { query: string };
        return repository.getCustomerDebtSummary({ storeId: context.storeId!, query });
      },
      shapeOutput: (raw) => withKind("customer_debt_summary", raw as Record<string, unknown>),
    }),
    createTool({
      name: "get_customer_recap_summary",
      description: "Return the latest 30-day transaction recap for one specific customer.",
      allowedRoles: customerRoles,
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
      sourceLabel: "Alat customer",
      execute: (input, context) => {
        const { query } = input as { query: string };
        return repository.getCustomerRecapSummary({ storeId: context.storeId!, query });
      },
      shapeOutput: (raw) => withKind("customer_recap_summary", raw as Record<string, unknown>),
    }),
  ];
}

export function getToolsForRole(role: UserRole, repository?: AssistantToolsRepository) {
  return createAssistantToolRegistry(repository).filter((tool) => tool.allowedRoles.includes(role));
}

export function getOpenAiToolsForRole(role: UserRole, repository?: AssistantToolsRepository) {
  return getToolsForRole(role, repository).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parametersJsonSchema,
    },
  }));
}

export function findToolForRole(role: UserRole, name: string, repository?: AssistantToolsRepository) {
  return getToolsForRole(role, repository).find((tool) => tool.name === name);
}

export function isRetriableToolError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /timeout|timed out|econnreset|deadlock|connection|temporar|rate limit|too many requests|503|502|504/.test(message);
}

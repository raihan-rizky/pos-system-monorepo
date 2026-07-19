import { describe, expect, it } from "vitest";
import { createAssistantToolRegistry, getToolsForRole } from "../assistant-tool-registry";

describe("tool-design compliance", () => {
  const tools = createAssistantToolRegistry();

  it("all tools have USE triggers in description", () => {
    const missing = tools.filter((t) => !t.description.includes("USE"));
    expect(missing.map((t) => t.name)).toEqual([]);
  });

  it("all tools have scope boundaries (DO NOT USE) in description", () => {
    const missing = tools.filter(
      (t) => !t.description.includes("DO NOT USE") && !t.description.includes("Not for"),
    );
    expect(missing.map((t) => t.name)).toEqual([]);
  });

  it("get_product_stock and get_product_price cross-reference each other", () => {
    const stock = tools.find((t) => t.name === "get_product_stock")!;
    const price = tools.find((t) => t.name === "get_product_price")!;
    expect(stock.description).toContain("get_product_price");
    expect(price.description).toContain("get_product_stock");
  });

  it("all tools expose errorCodes array for agent recovery", () => {
    const missing = tools.filter((t) => !(t as any).errorCodes?.length);
    expect(missing.map((t) => t.name)).toEqual([]);
  });

  it("shapeOutput does not leak extra raw fields", () => {
    const leaking = tools.filter((t) => {
      const raw = { extra: "LEAK", generatedAt: new Date().toISOString() };
      const out = t.shapeOutput(raw) as Record<string, unknown>;
      return "extra" in out;
    });
    expect(leaking.map((t) => t.name)).toEqual([]);
  });

  it.each([
    ["exportFinancialReport", "export_financial_report"],
    ["exportCustomerRecap", "export_customer_recap"],
  ])("defaults %s to a 30-day PDF client action", async (toolName, actionKind) => {
    const tool = tools.find((candidate) => candidate.name === toolName)!;
    const input = tool.inputSchema.parse({});
    const raw = await tool.execute(input, {
      storeId: "store-1",
      repository: {} as never,
      now: new Date("2026-06-30T10:00:00.000Z"),
    });
    const output = tool.outputSchema.parse(tool.shapeOutput(raw));

    expect(input).toEqual({ period: "30d", format: "pdf" });
    expect(output).toMatchObject({
      kind: "client_action",
      action: { kind: actionKind, period: "30d", format: "pdf" },
    });
  });

  it("exposes role-filtered modal actions for core create workflows", () => {
    const ownerToolNames = getToolsForRole("OWNER").map((tool) => tool.name);
    const expected = [
      "openProductModal",
      "openCustomerModal",
      "openSupplierModal",
      "openSalespersonModal",
      "openExpenseModal",
      "openShiftModal",
      "openStockUpdateModal",
      "openInboundReceiptModal",
    ];

    expect(ownerToolNames).toEqual(expect.arrayContaining(expected));
    expect(getToolsForRole("CASHIER").map((tool) => tool.name)).not.toContain("openProductModal");
    expect(getToolsForRole("SALES").map((tool) => tool.name)).toContain("openCustomerModal");
  });

  it("returns every financial-report page section for holistic analysis", async () => {
    const report = {
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      summary: {
        transactionCount: 4,
        revenue: 1_000_000,
        collected: 800_000,
        grossProfit: 300_000,
        grossMargin: 0.3,
        discount: 50_000,
        outstandingDp: 200_000,
        shiftDiscrepancy: -10_000,
        missingCostLineCount: 1,
        lossStokNet: 25_000,
        lossStokUnclassifiedCount: 2,
        expenseTotal: 120_000,
        expenseEntryCount: 3,
        incompleteExpenseCount: 1,
        estimatedNetProfit: 180_000,
      },
      paymentMethods: [{ method: "CASH", transactionCount: 4, revenue: 1_000_000, collected: 800_000 }],
      topProducts: [{ productId: "p1", productName: "Kertas", quantity: 10, revenue: 500_000, grossProfit: 150_000 }],
      categories: [{ categoryName: "ATK", quantity: 10, revenue: 500_000, grossProfit: 150_000, transactionCount: 3 }],
      salespersons: [{ name: "Ari", transactionCount: 4, revenue: 1_000_000, collected: 800_000, grossProfit: 300_000 }],
      shifts: [{ id: "s1", cashierName: "Rina", openedAt: "2026-06-01T01:00:00.000Z", closedAt: null, openingBalance: 100_000, expectedBalance: 900_000, closingBalance: 890_000, discrepancy: -10_000, status: "CLOSED" }],
      lossStok: [{ reason: "WASTE", netValue: 25_000, netQuantity: 1, entryCount: 1 }],
      trend: { granularity: "daily", points: [{ bucketKey: "2026-06-01", label: "01 Jun", omzet: 1_000_000, cost: 700_000, labaKotor: 300_000 }] },
    };
    const getFinancialReportAnalysis = async () => report;
    const repository = { getFinancialReportAnalysis } as never;
    const tool = createAssistantToolRegistry(repository).find(
      (candidate) => candidate.name === "analyzeFinancialReport",
    )!;
    const raw = await tool.execute(
      tool.inputSchema.parse({}),
      { storeId: "store-1", repository, now: new Date("2026-06-30T10:00:00.000Z") },
    );
    const output = tool.outputSchema.parse(tool.shapeOutput(raw)) as Record<string, unknown>;

    expect(output).toMatchObject({
      kind: "financial_report_analysis",
      period: "30d",
      coverage: [
        "summary",
        "trend",
        "paymentMethods",
        "topProducts",
        "categories",
        "salespersons",
        "lossStok",
        "shifts",
      ],
      report,
    });
  });
});

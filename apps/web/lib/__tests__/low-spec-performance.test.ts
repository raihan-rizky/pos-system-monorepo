import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as utils from "@/lib/utils";

const readWebFile = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("low-spec client performance profile", () => {
  it("selects lite mode from hardware, memory, data saver, or reduced motion", () => {
    const resolveClientPerformanceMode = (
      utils as typeof utils & {
        resolveClientPerformanceMode?: (input: {
          hardwareConcurrency?: number;
          deviceMemory?: number;
          saveData?: boolean;
          prefersReducedMotion?: boolean;
        }) => "standard" | "lite";
      }
    ).resolveClientPerformanceMode;

    expect(resolveClientPerformanceMode).toBeTypeOf("function");
    expect(resolveClientPerformanceMode?.({ hardwareConcurrency: 4 })).toBe(
      "lite",
    );
    expect(resolveClientPerformanceMode?.({ deviceMemory: 4 })).toBe("lite");
    expect(resolveClientPerformanceMode?.({ saveData: true })).toBe("lite");
    expect(
      resolveClientPerformanceMode?.({ prefersReducedMotion: true }),
    ).toBe("lite");
    expect(
      resolveClientPerformanceMode?.({
        hardwareConcurrency: 8,
        deviceMemory: 8,
      }),
    ).toBe("standard");
  });

  it("disables ambient effects and blur in lite mode", () => {
    const css = readWebFile("app/globals.css");

    expect(css).toContain('html[data-performance-mode="lite"]');
    expect(css).toContain('[class*="animate-ping"]');
    expect(css).toContain('[class*="animate-pulse"]');
    expect(css).toContain('[class*="backdrop-blur"]');
    expect(css).toMatch(/data-performance-mode="lite"[\s\S]*animation:\s*none/);
  });

  it("skips POS prefetch and slows notification polling in lite mode", () => {
    const providers = readWebFile("app/providers.tsx");
    const notifications = readWebFile(
      "features/notifications/components/NotificationProvider.tsx",
    );

    expect(providers).toContain("useClientPerformanceMode");
    expect(providers).toContain('performanceMode !== "lite"');
    expect(providers).toContain("notificationRefetchInterval");
    expect(notifications).toContain("refetchInterval = 30_000");
    expect(notifications).toContain("refetchInterval,");
  });

  it("keeps product pages bounded and avoids synchronous text measurement", () => {
    const productsPage = readWebFile(
      "app/(main)/products/ProductsClientPage.tsx",
    );
    const productTable = readWebFile("components/inventory/ProductTable.tsx");
    const beamsBackground = readWebFile(
      "components/ui/beams-background.tsx",
    );

    expect(productsPage).toContain("const PRODUCTS_PER_PAGE = 40");
    expect(productsPage).toContain("const PRODUCT_TABS:");
    expect(productsPage).not.toContain("const productTabs =");
    expect(productsPage).not.toContain("scrollWidth");
    expect(productsPage).not.toContain("clientWidth");
    expect(productsPage).toContain('loading="lazy"');
    expect(productsPage).toContain('decoding="async"');
    expect(productTable.match(/loading="lazy"/g)).toHaveLength(2);
    expect(productTable.match(/decoding="async"/g)).toHaveLength(2);
    expect(productTable).toContain("contentVisibility");
    expect(beamsBackground).toContain("const OPACITY_BY_INTENSITY =");
    expect(beamsBackground).not.toContain("const opacityMap =");
  });

  it("defers inventory charts and removes recurring minute rerenders", () => {
    const workspace = readWebFile(
      "features/inventory-management/components/InventoryWorkspace.tsx",
    );
    const deferredChartsPath = join(
      process.cwd(),
      "features/inventory-management/components/DeferredInventoryOverviewCharts.tsx",
    );

    expect(workspace).not.toContain('from "recharts"');
    expect(workspace).toContain("DeferredInventoryOverviewCharts");
    expect(workspace).not.toContain("setInterval");
    expect(workspace).toContain("getDailyMatchingWindowRefreshDelay");
    expect(readFileSync(deferredChartsPath, "utf8")).toContain(
      "IntersectionObserver",
    );
  });

  it("disables costly series animations across operational charts", () => {
    const chartPaths = [
      "features/dashboard/components/RevenueTrendChart.tsx",
      "features/customer-recap/components/RecapByTypeChart.tsx",
      "features/customer-recap/components/RecapTrendChart.tsx",
      "features/financial-report/components/TrendChart.tsx",
      "features/keuangan/components/CashFlowChart.tsx",
      "features/inventory-management/components/InventoryOverviewCharts.tsx",
    ];

    for (const path of chartPaths) {
      const source = readWebFile(path);
      const series = source.match(/<(?:Area|Bar|Line|Pie)\b[\s\S]*?\/?>/g) ?? [];

      expect(series.length, path).toBeGreaterThan(0);
      for (const element of series) {
        expect(element, `${path}: ${element.slice(0, 80)}`).toContain(
          "isAnimationActive={false}",
        );
      }
    }
  });

  it("keeps light-touch report and dashboard extras out of initial bundles", () => {
    const financialReport = readWebFile(
      "app/(main)/financial-report/page.tsx",
    );
    const dashboard = readWebFile("app/(main)/dashboard/page.tsx");

    expect(financialReport).toContain('import dynamic from "next/dynamic"');
    expect(financialReport).not.toContain(
      'import { TrendChart } from "@/features/financial-report/components/TrendChart"',
    );
    expect(financialReport).not.toContain(
      'import { ReportExportMenu } from "@/features/financial-report/components/ReportExportMenu"',
    );
    expect(dashboard).not.toContain(
      'import { ReceiptModal } from "@/components/ReceiptModal"',
    );
    expect(dashboard).toContain("limit: 10");
  });

  it("deeply isolates inactive supplier and finance work", () => {
    const supplierShell = readWebFile(
      "features/suppliers/components/SupplierPageShell.tsx",
    );
    const supplierHooks = readWebFile(
      "features/suppliers/hooks/useSuppliers.ts",
    );
    const keuangan = readWebFile("app/(main)/keuangan/page.tsx");
    const deferredCashFlow = readWebFile(
      "features/keuangan/components/DeferredCashFlowChart.tsx",
    );
    const cashFlowChart = readWebFile(
      "features/keuangan/components/CashFlowChart.tsx",
    );

    expect(supplierShell).toContain('import dynamic from "next/dynamic"');
    expect(supplierShell).not.toMatch(
      /from\s+["']@\/features\/suppliers\/shopping-requests["']/,
    );
    expect(supplierShell).not.toMatch(
      /from\s+["']@\/features\/suppliers\/goods-purchases["']/,
    );
    expect(supplierShell).not.toMatch(
      /from\s+["']@\/features\/inventory-management["']/,
    );
    expect(supplierShell).toContain('enabled: tab === "suppliers"');
    expect(supplierShell).toContain('enabled: tab === "recap"');
    expect(supplierHooks).toContain("options: { enabled?: boolean } = {}");
    expect(supplierHooks).toContain("enabled: options.enabled ?? true");

    expect(keuangan).not.toContain('from "recharts"');
    expect(keuangan).not.toMatch(
      /import\s*\{\s*ExpenseFormModal[\s,}]/,
    );
    expect(keuangan).toContain("DeferredCashFlowChart");
    expect(deferredCashFlow).toContain("IntersectionObserver");
    expect(cashFlowChart).toContain('from "recharts"');
    expect(cashFlowChart).toContain("isAnimationActive={false}");
  });

  it("medium-isolates optional work across remaining operational routes", () => {
    const products = readWebFile(
      "app/(main)/products/ProductsClientPage.tsx",
    );
    const history = readWebFile(
      "app/(main)/history/HistoryClientPage.tsx",
    );
    const production = readWebFile("app/(main)/production/page.tsx");
    const jobOrderHooks = readWebFile("hooks/useJobOrders.ts");
    const pos = readWebFile("app/(main)/pos/POSClientPage.tsx");
    const brandHooks = readWebFile("hooks/useBrands.ts");
    const customers = readWebFile(
      "app/(main)/customers/CustomersClientPage.tsx",
    );
    const inventoryPage = readWebFile("app/(main)/inventory/page.tsx");
    const inventoryWorkspace = readWebFile(
      "features/inventory-management/components/InventoryWorkspace.tsx",
    );

    expect(products).not.toContain(
      'import ProductFormModal from "@/components/inventory/ProductFormModal"',
    );
    expect(products).not.toContain(
      'import { StockGroupWorkspaceModal } from "@/features/product-stock-groups/components/StockGroupWorkspace"',
    );
    expect(history).toContain('import dynamic from "next/dynamic"');
    expect(history).not.toContain(
      'import { ReceiptModal } from "@/components/ReceiptModal"',
    );
    expect(production).toContain(
      'useProductionActivity(20, { enabled: activeTab === "activity" })',
    );
    expect(jobOrderHooks).toContain(
      "options: { enabled?: boolean } = {}",
    );
    expect(pos).toContain("enabled: Boolean(productEditItem)");
    expect(brandHooks).toContain("options: { enabled?: boolean } = {}");
    expect(customers).toContain('import dynamic from "next/dynamic"');
    expect(customers).toContain("ssr: false");
    expect(customers).not.toContain(
      'import { DebtTransactionsList } from "@/features/customer-debt/components/DebtTransactionsList"',
    );
    expect(inventoryPage).not.toContain(
      'from "@/features/inventory-management";',
    );
    expect(inventoryWorkspace).toContain(
      'activeModal === "matching" &&',
    );
    expect(inventoryWorkspace).toContain(
      'activeModal === "inbound" &&',
    );
  });
});

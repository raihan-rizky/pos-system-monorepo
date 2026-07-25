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
    const productsPage = readWebFile("app/(main)/products/page.tsx");
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
      "app/(main)/keuangan/page.tsx",
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
});

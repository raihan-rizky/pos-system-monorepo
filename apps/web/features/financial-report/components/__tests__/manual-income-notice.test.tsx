import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { buildFinancialReport } from "../../helpers/report-core";

const fixture = vi.hoisted(() => ({ report: undefined as unknown }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ role: "ADMIN", canAccess: () => true, canPerform: () => true }) }));
vi.mock("@/features/financial-report/hooks/useFinancialReport", () => ({ useFinancialReport: () => ({ data: fixture.report, isLoading: false, isFetching: false }) }));

import FinancialReportPage from "@/app/(main)/financial-report/page";

it("explains why manual income is included in revenue but excluded from gross profit", () => {
  fixture.report = buildFinancialReport({ dateFrom: "2026-09-02", dateTo: "2026-09-02", transactions: [], shifts: [], manualIncome: [
    { id: "m1", occurredAt: new Date("2026-09-02T03:00:00Z"), category: "ATK", amount: 100 },
  ] });
  const html = renderToStaticMarkup(<FinancialReportPage />);
  expect(html).toContain("Pemasukan manual masuk omzet dan terkumpul");
  expect(html).toContain("tidak dihitung dalam laba kotor");
  expect(html).toContain("Pemasukan manual");
  expect(html).toContain("1 pemasukan manual");
});

it("does not show the manual-income explanation when there is no manual income", () => {
  fixture.report = buildFinancialReport({ dateFrom: "2026-09-02", dateTo: "2026-09-02", transactions: [], shifts: [] });
  expect(renderToStaticMarkup(<FinancialReportPage />)).not.toContain("Pemasukan manual masuk omzet dan terkumpul");
});

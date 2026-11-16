import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: vi.fn(), daily: vi.fn() }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: mocks.role }));
vi.mock("@/features/financial-report/hooks/useDailyIncome", () => ({ useDailyIncome: mocks.daily }));
import { DailyIncomeReport } from "../DailyIncomeReport";

describe("metrik piutang pada pemasukan harian", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T03:00:00Z"));
    mocks.role.mockReturnValue({ role: "SALES", canAccess: () => true, canPerform: () => true });
    mocks.daily.mockReturnValue({ data: {
      date: "2026-11-11", receivableBalance: 350_000, receivableNotaBalance: 200_000, receivableManualBalance: 150_000,
      paymentMethods: [{ method: "TRANSFER", amount: 85_000 }],
    }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
  });
  afterEach(() => vi.useRealTimers());

  it("menampilkan total, saldo nota, saldo manual, dan tautan rincian metode", () => {
    const html = renderToStaticMarkup(createElement(DailyIncomeReport));
    expect(html).toContain("Piutang Nota");
    expect(html).toContain("Piutang Manual");
    expect(html).toMatch(/Rp\s*350\.000/);
    expect(html).toMatch(/Rp\s*200\.000/);
    expect(html).toMatch(/Rp\s*150\.000/);
    expect(html).toContain("method=TRANSFER");
  });

  it("tidak menampilkan rincian saldo ketika izin piutang manual dicabut", () => {
    mocks.role.mockReturnValue({ canAccess: () => true, canPerform: (target: string) => target !== "customer.receivable" });
    const html = renderToStaticMarkup(createElement(DailyIncomeReport));
    expect(html).not.toContain("Piutang Nota");
    expect(html).not.toMatch(/Rp\s*150\.000/);
  });
});

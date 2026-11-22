import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }), useQuery: () => ({ data: { data: [{ id: "customer-2", name: "Pelanggan Kedua" }] }, isFetching: false }) }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ userId: "user-1", storeId: "store-1", authorizationFingerprint: "v1", canPerform: () => true }) }));
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: (value: string) => value }));
import { ReceivableCorrectionForm } from "../ReceivableCorrectionForm";

it("menyediakan pilihan pelanggan lain saat rincian piutang dikoreksi", () => {
  const entry = { id: "r1", customerId: "customer-1", customer: { id: "customer-1", name: "Pelanggan Pertama" }, amount: 100,
    amountPaid: 0, debtDate: "2026-10-01", dueDate: "2026-11-01", reportCategory: "ATK" as const, note: null, createdAt: "2026-10-01", payments: [] };
  const html = renderToStaticMarkup(createElement(ReceivableCorrectionForm, { entry, onClose() {}, onSaved() {} }));
  expect(html).toContain("Pelanggan Kedua");
  expect(html).toContain("Pelanggan Pertama");
  expect(html).not.toContain("Nominal piutang edit");
});

it("tidak menyalin catatan piutang ke pembayaran yang tidak memiliki catatan", () => {
  const payment = { id: "p1", amount: 50, method: "CASH" as const, note: null, createdAt: "2026-10-05T00:00:00Z", paidAt: null };
  const entry = { id: "r1", customerId: "customer-1", customer: { id: "customer-1", name: "Pelanggan" }, amount: 100,
    amountPaid: 50, debtDate: "2026-10-01", dueDate: "2026-11-01", reportCategory: "ATK" as const, note: "Catatan piutang", createdAt: "2026-10-01", payments: [payment] };
  const html = renderToStaticMarkup(createElement(ReceivableCorrectionForm, { entry, payment, onClose() {}, onSaved() {} }));
  expect(html).not.toContain('value="Catatan piutang"');
});

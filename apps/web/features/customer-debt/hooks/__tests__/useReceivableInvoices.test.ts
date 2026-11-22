import { beforeEach, expect, it, vi } from "vitest";
import { useReceivableInvoices } from "../useReceivableInvoices";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.useQuery.mockImplementation((options) => options);
});

it("loads filtered invoices from the receivable-only endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [], pagination: { page: 2, total: 0, totalPages: 0 } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  useReceivableInvoices({ search: "Budi", status: "open", dateFrom: "2026-10-01", dateTo: "2026-10-31", customerType: "UMUM", page: 2 });
  const options = mocks.useQuery.mock.calls[0][0] as { queryFn: () => Promise<unknown> };
  await options.queryFn();
  const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
  expect(url.pathname).toBe("/api/customer-receivables/invoices");
  expect(Object.fromEntries(url.searchParams)).toEqual({ search: "Budi", status: "open", dateFrom: "2026-10-01", dateTo: "2026-10-31", customerType: "UMUM", page: "2" });
});

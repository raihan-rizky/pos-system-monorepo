import { QueryClient, type FetchQueryOptions } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as hooks from "@/hooks/useCustomerCategoryPricingRules";

let client: QueryClient;
const fetchMock = vi.fn();
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: (options: unknown) => options,
  useQueryClient: () => client,
  useMutation: (options: unknown) => options,
}));

describe("pricing scope loading", () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => Response.json({ data: { units: ["pcs", "rim"], products: [] } }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    client.clear();
    vi.unstubAllGlobals();
  });
  const unitOptions = () => hooks.usePricingUnitOptions("paper") as unknown as FetchQueryOptions<string[]>;

  it("reuses category units while the selected unit and brand change", async () => {
    await expect(client.fetchQuery(unitOptions())).resolves.toEqual(["pcs", "rim"]);
    await client.fetchQuery(hooks.usePricingScopeOptions("paper", "rim") as unknown as FetchQueryOptions);
    await client.fetchQuery(hooks.usePricingScopeOptions("paper", "pcs", "brand") as unknown as FetchQueryOptions);
    await client.fetchQuery(unitOptions());
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("view=units"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("view=preview"))).toHaveLength(2);
  });
  it.each([
    hooks.useCreateCustomerCategoryPricingRule,
    hooks.useUpdateCustomerCategoryPricingRule,
    hooks.useDeleteCustomerCategoryPricingRule,
  ])("refreshes cached units after a rule changes", async (hook) => {
    await client.fetchQuery(unitOptions());
    const mutation = hook() as unknown as { onSuccess(): void };
    mutation.onSuccess();
    await client.fetchQuery(unitOptions());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

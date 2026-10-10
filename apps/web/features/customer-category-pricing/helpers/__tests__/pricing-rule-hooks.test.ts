import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateCustomerCategoryPricingRule, useUpdateCustomerCategoryPricingRule, useDeleteCustomerCategoryPricingRule } from "@/hooks/useCustomerCategoryPricingRules";
const mocks = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn(), useQueryClient: () => mocks, useMutation: (options: unknown) => options }));
describe("pricing rule cache refresh", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([useCreateCustomerCategoryPricingRule, useUpdateCustomerCategoryPricingRule, useDeleteCustomerCategoryPricingRule])("refreshes displayed products after a rule mutation", (hook) => {
    const mutation = hook() as unknown as { onSuccess(): void };
    mutation.onSuccess();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["products"] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["customer-category-pricing-rules"] });
  });
});

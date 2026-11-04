import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  policy: vi.fn(),
  update: vi.fn(),
  categories: vi.fn(),
}));

vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canPerform: () => true }) }));
vi.mock("../hooks/usePriceRoundingSettings", () => ({
  usePriceRoundingSettings: mocks.policy,
  useUpdatePriceRoundingSettings: mocks.update,
}));
vi.mock("../hooks/usePriceRoundingCategories", () => ({ usePriceRoundingCategories: mocks.categories }));

import PriceRoundingSettingsTab from "../components/PriceRoundingSettingsTab";

describe("price rounding settings cache", () => {
  it("does not allow edits before the server policy has loaded after mounting", () => {
    mocks.policy.mockReturnValue({
      data: { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: [] },
      isFetching: true, isFetchedAfterMount: false, isPlaceholderData: false, isError: false,
    });
    mocks.categories.mockReturnValue({ data: [{ id: "paper", name: "Kertas" }], isPending: false, isError: false });
    mocks.update.mockReturnValue({ isPending: false, isSuccess: false, mutate: vi.fn(), reset: vi.fn() });
    const html = renderToStaticMarkup(<PriceRoundingSettingsTab />);
    expect(html).toMatch(/<button type="submit" disabled=""/);
    expect(html).toContain("Memuat pengaturan pembulatan");
  });

  it("enables editing with the fetched server selections", () => {
    mocks.policy.mockReturnValue({
      data: { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: ["paper"] },
      isFetching: false, isFetchedAfterMount: true, isPlaceholderData: false, isError: false,
    });
    mocks.categories.mockReturnValue({ data: [{ id: "paper", name: "Kertas" }], isPending: false, isError: false });
    mocks.update.mockReturnValue({ isPending: false, isSuccess: false, mutate: vi.fn(), reset: vi.fn() });
    const html = renderToStaticMarkup(<PriceRoundingSettingsTab />);
    expect(html).not.toMatch(/<button type="submit" disabled=""/);
    expect(html).toContain("1 kategori dipilih");
  });
});

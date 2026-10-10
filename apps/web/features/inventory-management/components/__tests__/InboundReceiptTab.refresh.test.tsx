import { describe, expect, it, vi } from "vitest";

const effectDependencies = vi.hoisted(() => [] as unknown[][]);

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const hooks = {
    useState: (initial: unknown) => [initial, vi.fn()],
    useCallback: (callback: (...args: any[]) => unknown) => callback,
    useEffect: (_effect: () => void, dependencies: unknown[]) => {
      effectDependencies.push(dependencies);
    },
  };
  return {
    ...actual,
    ...hooks,
    default: {
      ...(actual as unknown as { default: Record<string, unknown> }).default,
      ...hooks,
    },
  };
});

vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ canPerform: () => true }),
}));

vi.mock("../../api/inventory-management-api", () => ({
  fetchInboundReceipts: vi.fn(),
}));

import { InboundReceiptTab } from "../InboundReceiptTab";

describe("InboundReceiptTab refresh", () => {
  it("tracks receipt creation as a reason to reload the list", () => {
    effectDependencies.length = 0;

    InboundReceiptTab({ refreshTrigger: 7 });

    expect(effectDependencies).toHaveLength(1);
    expect(effectDependencies[0]).toContain(7);
  });
});

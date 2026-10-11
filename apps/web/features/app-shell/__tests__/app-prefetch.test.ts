import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { effects, prefetchQuery, pathname } = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  prefetchQuery: vi.fn(),
  pathname: { value: "/products" },
}));

vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => effects.push(effect),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ prefetchQuery }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("@/hooks/useProducts", () => ({
  fetchProducts: vi.fn(),
  productQueryKey: () => ["products"],
}));

import { useAppPrefetch } from "@/hooks/usePrefetch";

function PrefetchHarness(enabled = true) {
  useAppPrefetch(enabled);
  return effects.at(-1)?.();
}

describe("App cache prefetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    effects.length = 0;
    pathname.value = "/products";
    prefetchQuery.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("does not warm unused POS APIs in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    PrefetchHarness();
    vi.runAllTimers();
    expect(prefetchQuery).not.toHaveBeenCalled();
  });

  it("warms products, categories and active shift in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    PrefetchHarness();
    expect(prefetchQuery).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(prefetchQuery.mock.calls.map(([options]) => options.queryKey)).toEqual([
      ["products"], ["categories"], ["active-shift"],
    ]);
  });

  it.each(["/pos", "/pos/checkout"])("avoids duplicate warmup on %s", (path) => {
    vi.stubEnv("NODE_ENV", "production");
    pathname.value = path;
    PrefetchHarness();
    vi.runAllTimers();
    expect(prefetchQuery).not.toHaveBeenCalled();
  });

  it("respects disabled bootstrap and cancels warmup on unmount", () => {
    vi.stubEnv("NODE_ENV", "production");
    PrefetchHarness(false);
    vi.runAllTimers();
    expect(prefetchQuery).not.toHaveBeenCalled();
    const cleanup = PrefetchHarness();
    cleanup?.();
    vi.runAllTimers();
    expect(prefetchQuery).not.toHaveBeenCalled();
  });
});

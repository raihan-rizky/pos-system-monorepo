import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePriceRoundingSettings, useUpdatePriceRoundingSettings } from "../hooks/usePriceRoundingSettings";

const cache = vi.hoisted(() => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => options, useMutation: (options: unknown) => options, useQueryClient: () => cache }));

describe("price rounding query policy", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("provides defaults while the authenticated runtime policy is loading", () => {
    const query = usePriceRoundingSettings() as unknown as { placeholderData: unknown };
    expect(query.placeholderData).toEqual({ enabled: true, increment: 500, threshold: 50 });
  });

  it("updates active policy data and invalidates pricing when a save succeeds", () => {
    const mutation = useUpdatePriceRoundingSettings() as unknown as { onSuccess(data: unknown): void };
    const settings = { enabled: false, increment: 1000, threshold: 0 };
    mutation.onSuccess(settings);
    expect(cache.setQueryData).toHaveBeenCalledWith(["settings", "price-rounding"], settings);
    expect(cache.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["products"] });
    expect(cache.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["settings", "price-rounding"] });
  });

  it("restores only a validated last known policy for offline reloads", () => {
    const saved = { enabled: false, increment: 1000, threshold: 100 };
    vi.stubGlobal("window", { localStorage: { getItem: () => JSON.stringify(saved) } });
    const query = usePriceRoundingSettings() as unknown as { initialData?: () => unknown };
    expect(query.initialData?.()).toEqual(saved);
  });

  it("ignores invalid browser cache data", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => '{"enabled":true,"increment":0,"threshold":0}' } });
    const query = usePriceRoundingSettings() as unknown as { initialData?: () => unknown };
    expect(query.initialData?.()).toBeUndefined();
  });

  it("persists the successful runtime read for the next offline session", async () => {
    const saved = { enabled: false, increment: 1000, threshold: 100 };
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(saved)));
    const query = usePriceRoundingSettings() as unknown as { queryFn?: () => Promise<unknown> };
    await expect(query.queryFn?.()).resolves.toEqual(saved);
    expect(setItem).toHaveBeenCalledWith("pos-price-rounding-settings", JSON.stringify(saved));
  });
});

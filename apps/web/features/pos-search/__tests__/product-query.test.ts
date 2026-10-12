import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver, type QueryObserverOptions } from "@tanstack/react-query";
import { fetchProducts, useProducts, useProductsPage, useProductUnits, type Product, type ProductsResponse } from "@/hooks/useProducts";
import { useAppPrefetch } from "@/hooks/usePrefetch";

const mocks = vi.hoisted(() => ({
  client: null as QueryClient | null,
  effects: [] as Array<() => void | (() => void)>,
  cacheCatalogProducts: vi.fn(),
  cacheCatalogCategories: vi.fn(),
  getCachedCatalogProducts: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { mocks.effects.push(effect); },
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: (options: unknown) => options,
  useQueryClient: () => mocks.client,
}));
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: (value: unknown) => value }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/lib/offline/offline-db", () => ({
  cacheCatalogProducts: mocks.cacheCatalogProducts,
  cacheCatalogCategories: mocks.cacheCatalogCategories,
  getCachedCatalogProducts: mocks.getCachedCatalogProducts,
}));

type Options = QueryObserverOptions<ProductsResponse>;
const initialData: ProductsResponse = {
  data: [{ id: "paper", name: "Kertas", price: 1000, stock: 10 } as Product],
  pagination: { page: 1, limit: 24, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
};
const pageOptions = (search = "", category = "", options: Parameters<typeof useProductsPage>[2] = {}) =>
  // eslint-disable-next-line react-hooks/rules-of-hooks -- React and useQuery are mocked to inspect query options.
  useProductsPage(search, category, { limit: 24, ...options }) as unknown as Options;

describe("product query cache and request lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.effects.length = 0;
    mocks.client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
    mocks.cacheCatalogProducts.mockResolvedValue(undefined);
    mocks.cacheCatalogCategories.mockResolvedValue(undefined);
    mocks.getCachedCatalogProducts.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
      url.startsWith("/api/products?") ? initialData : { data: [] },
    ))));
  });
  afterEach(() => {
    mocks.client?.clear();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses a matching server page without issuing another initial request", async () => {
    const observer = new QueryObserver(mocks.client!, pageOptions("", "", { initialData }));
    const unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.getCurrentResult().data).toBe(initialData);
    expect(fetch).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("preserves the server freshness timestamp", () => {
    const updatedAt = Date.now() - 60_000;
    const options = pageOptions("", "", { initialData, initialDataUpdatedAt: updatedAt } as Parameters<typeof useProductsPage>[2]);
    const observer = new QueryObserver(mocks.client!, options);
    expect(observer.getCurrentResult().dataUpdatedAt).toBe(updatedAt);
    observer.destroy();
  });

  it("keeps a newer cache entry instead of replacing it with server seed data", () => {
    const options = pageOptions("", "", { initialData });
    const newer = { ...initialData, data: [{ ...initialData.data[0], price: 2000 }] };
    mocks.client!.setQueryData(options.queryKey!, newer);
    const observer = new QueryObserver(mocks.client!, options);
    expect(observer.getCurrentResult().data).toBe(newer);
    observer.destroy();
  });

  it("persists a reused initial catalog page for offline access without fetching it again", async () => {
    const observer = new QueryObserver(mocks.client!, pageOptions("", "", { initialData }));
    const cleanups = mocks.effects.map(effect => effect());
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.cacheCatalogProducts).toHaveBeenCalledWith(initialData.data);
    expect(fetch).not.toHaveBeenCalled();
    cleanups.forEach(cleanup => cleanup?.());
    observer.destroy();
  });

  it("does not overwrite a newer offline catalog with an older server seed", async () => {
    const observer = new QueryObserver(mocks.client!, pageOptions("", "", { initialData }));
    mocks.client!.setQueryData(pageOptions().queryKey!, { ...initialData, data: [{ ...initialData.data[0], price: 2500 }] });
    const cleanups = mocks.effects.map(effect => effect());
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.cacheCatalogProducts).not.toHaveBeenCalled();
    cleanups.forEach(cleanup => cleanup?.());
    observer.destroy();
  });

  it.each([
    ["kertas", "", {}], ["", "paper", {}], ["", "", { page: 2 }],
    ["", "", { limit: 40 }], ["", "", { inStockOnly: true }],
    ["", "", { stockStatus: "out" }], ["", "", { stockGroupMinVariants: 2 }],
  ])("does not seed an incompatible filtered or paginated query (%s, %s, %j)", (search, category, options) => {
    const query = pageOptions(search as string, category as string, { initialData, ...options } as Parameters<typeof useProductsPage>[2]);
    const observer = new QueryObserver(mocks.client!, query);
    expect(observer.getCurrentResult().data).toBeUndefined();
    observer.destroy();
  });

  it("normalizes empty filters consistently for both product hook consumers", () => {
    const list = useProducts(undefined, undefined, { limit: 24 }) as unknown as Options;
    expect(list.queryKey).toEqual(pageOptions().queryKey);
  });

  it("separates unit-filtered catalog pages from the unfiltered cache", () => {
    const options = { unit: "dus" } as Parameters<typeof useProductsPage>[2];
    expect(pageOptions("", "", options).queryKey).not.toEqual(pageOptions().queryKey);
  });

  it("loads unit choices independently of paginated product requests", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: ["dus", "pcs"] })));
    const options = useProductUnits() as unknown as QueryObserverOptions<string[]>;
    const units = await mocks.client!.fetchQuery(options);
    expect(fetch).toHaveBeenCalledWith("/api/products/units", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(units).toEqual(["dus", "pcs"]);
    expect(options.queryKey?.slice(0, 2)).toEqual(["products", "units"]);
  });

  it.each([["list", useProducts], ["page", useProductsPage]] as const)("sends the unit filter to the API (%s)", async (_name, hook) => {
    const options = hook("paper", "cat-paper", { unit: "dus" } as Parameters<typeof useProductsPage>[2]) as unknown as Options;
    await mocks.client!.fetchQuery(options);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]), "http://localhost");
    expect(url.searchParams.get("unit")).toBe("dus");
    expect(url.searchParams.get("categoryId")).toBe("cat-paper");
  });

  it("does not seed a unit-filtered page with unfiltered server data", () => {
    const options = pageOptions("", "", { initialData, unit: "dus" } as Parameters<typeof useProductsPage>[2]);
    expect(options.initialData).toBeUndefined();
  });

  it("applies the unit filter to cached offline products and their variants", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("unavailable", { status: 503 }));
    mocks.getCachedCatalogProducts.mockResolvedValue([
      { id: "paper", unit: "pcs", variants: [{ id: "paper-pcs", unit: "pcs" }, { id: "paper-dus", unit: "dus" }] },
      { id: "pen", unit: "pcs" },
      { id: "box", unit: "dus" },
    ]);
    const result = await mocks.client!.fetchQuery(pageOptions("", "", { unit: "dus" } as Parameters<typeof useProductsPage>[2]));
    expect(result.data.map(product => product.id)).toEqual(["paper-dus", "box"]);
    expect(result.data[0].unit).toBe("dus");
    expect(result.data[0].variants?.map(variant => variant.unit)).toEqual(["dus"]);
    expect(result.pagination.total).toBe(2);
  });

  it("preserves cached sibling units after viewing a single-unit online result", async () => {
    const pcs = { id: "paper-pcs", unit: "pcs", price: 1000, stock: 10, sku: "PAPER-PCS" };
    const dus = { id: "paper-dus", unit: "dus", price: 10000, stock: 1, sku: "PAPER-DUS" };
    const fullProduct = { ...initialData.data[0], ...pcs, variants: [pcs, dus] } as Product;
    const cache = new Map<string, Product>();
    mocks.cacheCatalogProducts.mockImplementation(async (products: Product[]) => {
      products.forEach(product => cache.set(product.id, product));
    });
    mocks.getCachedCatalogProducts.mockImplementation(async () => [...cache.values()]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...initialData, data: [fullProduct] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...initialData, data: [{ ...fullProduct, variants: [pcs] }] })))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    await fetchProducts("", "", 1, 24);
    await fetchProducts("", "", 1, 24, false, undefined, undefined, undefined, "pcs");
    const result = await fetchProducts("", "", 1, 24, false, undefined, undefined, undefined, "dus");
    expect(result.data.map(product => product.id)).toEqual(["paper-dus"]);
  });

  it("reuses the prefetched POS page through the consuming product hook", async () => {
    useAppPrefetch();
    const cleanups = mocks.effects.map(effect => effect());
    await vi.advanceTimersByTimeAsync(250);
    const observer = new QueryObserver(mocks.client!, pageOptions());
    const unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.getCurrentResult().data).toEqual(initialData);
    const productRequests = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith("/api/products?"));
    expect(productRequests).toHaveLength(1);
    unsubscribe();
    cleanups.forEach(cleanup => cleanup?.());
  });

  it("passes the query signal to offline persistence", async () => {
    const controller = new AbortController();
    await fetchProducts("paper", "", 1, 24, false, undefined, undefined, controller.signal);
    expect(mocks.cacheCatalogProducts).toHaveBeenCalledWith(initialData.data, controller.signal);
  });

  it("rejects cancellation while offline persistence is pending", async () => {
    const controller = new AbortController();
    const reason = new Error("Obsolete catalog query");
    let persistSignal: AbortSignal | undefined;
    let release!: () => void;
    mocks.cacheCatalogProducts.mockImplementation((_products, signal?: AbortSignal) => {
      persistSignal = signal;
      return new Promise<void>(resolve => { release = resolve; });
    });
    const request = fetchProducts("paper", "", 1, 24, false, undefined, undefined, controller.signal);
    const rejection = expect(request).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(reason);
    release();
    await rejection;
    expect(persistSignal).toBe(controller.signal);
    expect(mocks.getCachedCatalogProducts).not.toHaveBeenCalled();
  });

  it.each([["useProducts", useProducts], ["useProductsPage", useProductsPage]] as const)("aborts an obsolete product request without offline writes (%s)", async (_name, hook) => {
    let requestSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_url, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => reject(requestSignal!.reason), { once: true });
      });
    });
    const options = hook("paper", "", { limit: 24 }) as unknown as Options;
    const request = mocks.client!.fetchQuery(options);
    const settled = request.catch(() => undefined);
    await mocks.client!.cancelQueries({ queryKey: options.queryKey });
    await settled;
    expect(requestSignal?.aborted).toBe(true);
    expect(mocks.cacheCatalogProducts).not.toHaveBeenCalled();
    expect(mocks.getCachedCatalogProducts).not.toHaveBeenCalled();
  });
});

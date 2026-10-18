import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCategories } from "@/hooks/useProducts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const offline = vi.hoisted(() => ({ cache: vi.fn(), read: vi.fn().mockResolvedValue([]) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => options, keepPreviousData: (data: unknown) => data }));
vi.mock("@/lib/offline/offline-db", () => ({ cacheCatalogCategories: offline.cache, getCachedCatalogCategories: offline.read }));
beforeEach(() => { vi.restoreAllMocks(); offline.cache.mockReset(); });
let capturedQuery: unknown;
function CategoryQueryProbe() { capturedQuery = useCategories(); return null; }
function query() {
  renderToStaticMarkup(createElement(CategoryQueryProbe));
  return capturedQuery as { queryFn: (context: { signal: AbortSignal }) => Promise<unknown> };
}
describe("category catalog cancellation", () => {
  it("wires query cancellation and bypasses browser category caches", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "a", name: "ATK" }] })));
    await query().queryFn({ signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledWith("/api/categories", { cache: "no-store", signal: controller.signal });
    expect(offline.cache).toHaveBeenCalledWith([{ id: "a", name: "ATK" }]);
  });
  it("does not write an old response to offline cache after query cancellation", async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => { controller.abort(); return { data: [{ id: "deleted" }] }; } } as Response);
    await expect(query().queryFn({ signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(offline.cache).not.toHaveBeenCalled();
  });
});

import { afterEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ client: null as unknown, createShift: vi.fn(), closeShift: vi.fn(), getActiveShift: vi.fn(), getShift: vi.fn(), shiftCreateAllowed: true, shiftUpdateAllowed: true, isOfflineSession: false }));

vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ userId: "cashier-1", userName: "Kasir", storeId: "store-1", isOfflineSession: harness.isOfflineSession, canPerform: (resource: string, action: string) => resource === "shift" && (action === "create" ? harness.shiftCreateAllowed : harness.shiftUpdateAllowed) }),
}));
vi.mock("@/lib/offline/offline-db", () => ({
  createOfflineShift: harness.createShift,
  closeOfflineShift: harness.closeShift,
  getOfflineActiveShift: harness.getActiveShift,
  rememberActiveShift: vi.fn(),
  offlineDb: { offlineShifts: { get: harness.getShift } },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => harness.client,
    useQuery: (options: unknown) => options,
    useMutation: (options: ConstructorParameters<typeof actual.MutationObserver>[1]) =>
      new actual.MutationObserver(harness.client as InstanceType<typeof actual.QueryClient>, options),
  };
});

import { MutationObserver, QueryClient, onlineManager } from "@tanstack/react-query";
import { useCreateTransaction } from "@/hooks/useTransactions";
import { useActiveShift, useCloseShift, useOpenShift, type CashierShift } from "@/hooks/useShift";

afterEach(() => {
  onlineManager.setOnline(true);
  harness.shiftCreateAllowed = true;
  harness.shiftUpdateAllowed = true;
  harness.isOfflineSession = false;
  vi.unstubAllGlobals();
});

it("does not create a local shift without shift creation permission", async () => {
  const client = new QueryClient();
  client.mount();
  harness.client = client;
  harness.createShift.mockReset();
  harness.shiftCreateAllowed = false;
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { onLine: false });
  const mutation = useOpenShift() as unknown as MutationObserver<unknown, Error, { openingBalance: number }>;
  await expect(mutation.mutate({ openingBalance: 1000 })).rejects.toThrow(/izin/i);
  expect(harness.createShift).not.toHaveBeenCalled();
  client.unmount();
});

it("does not close a local shift without shift update permission", async () => {
  const client = new QueryClient();
  client.mount();
  harness.client = client;
  harness.getShift.mockReset().mockResolvedValue({ id: "shift-1", cashierId: "cashier-1", storeId: "store-1" });
  harness.closeShift.mockReset();
  harness.shiftUpdateAllowed = false;
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("navigator", { onLine: false });
  const mutation = useCloseShift() as unknown as MutationObserver<unknown, Error, { shiftId: string; closingBalance: number }>;
  await expect(mutation.mutate({ shiftId: "shift-1", closingBalance: 0 })).rejects.toThrow(/izin/i);
  expect(harness.closeShift).not.toHaveBeenCalled();
  client.unmount();
});

it("opens an attributed local shift without waiting for React Query to reconnect", async () => {
  const client = new QueryClient();
  client.mount();
  harness.client = client;
  harness.createShift.mockReset().mockResolvedValue({ id: "local-shift" });
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { onLine: false });
  onlineManager.setOnline(false);

  const mutation = useOpenShift() as unknown as MutationObserver<unknown, Error, { openingBalance: number; note?: string }>;
  const operation = mutation.mutate({ openingBalance: 1000 });
  const outcome = await Promise.race([
    operation.then(() => "saved", () => "error"),
    new Promise<string>(resolve => setTimeout(() => resolve("paused"), 200)),
  ]);
  onlineManager.setOnline(true);
  await client.resumePausedMutations();
  await operation.catch(() => undefined);
  client.unmount();

  expect(outcome).toBe("saved");
  expect(harness.createShift).toHaveBeenCalledWith(expect.objectContaining({
    cashierId: "cashier-1", cashierName: "Kasir", storeId: "store-1", openingBalance: 1000,
  }));
});

it("uses the verified offline session to open a local shift when the browser still reports online", async () => {
  const client = new QueryClient();
  client.mount();
  harness.client = client;
  harness.isOfflineSession = true;
  harness.createShift.mockReset().mockResolvedValue({ id: "local-shift", isLocalOnly: true });
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { onLine: true });
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: "unavailable" }) });
  vi.stubGlobal("fetch", fetchMock);
  const mutation = useOpenShift() as unknown as MutationObserver<{ id: string }, Error, { openingBalance: number }>;
  await expect(mutation.mutate({ openingBalance: 1000 })).resolves.toMatchObject({ id: "local-shift" });
  expect(fetchMock).not.toHaveBeenCalled();
  client.unmount();
});

it("uses the local active shift in a verified offline session even when the browser reports online", async () => {
  const client = new QueryClient();
  client.mount();
  harness.client = client;
  harness.isOfflineSession = true;
  harness.getActiveShift.mockReset().mockResolvedValue({ id: "local-shift" });
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { onLine: true });
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 });
  vi.stubGlobal("fetch", fetchMock);
  const options = useActiveShift() as unknown as Parameters<typeof client.fetchQuery>[0];
  await expect(client.fetchQuery(options)).resolves.toMatchObject({ id: "local-shift" });
  expect(fetchMock).not.toHaveBeenCalled();
  client.unmount();
});

it.each([
  ["replaced", { id: "new-local-shift" }],
  ["closed", undefined],
])("ignores an old server shift snapshot when the local shift was %s", async (_state, localShift) => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } } });
  client.mount();
  harness.client = client;
  harness.isOfflineSession = true;
  harness.getActiveShift.mockReset().mockResolvedValue(localShift);
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { onLine: true });
  const options = useActiveShift({ id: "old-server-shift" } as CashierShift) as unknown as Parameters<typeof client.fetchQuery>[0];
  await expect(client.fetchQuery(options)).resolves.toEqual(localShift ?? null);
  client.unmount();
});

it("does not try to close a server shift without a local copy in an offline session", async () => {
  const client = new QueryClient();
  client.mount();
  harness.client = client;
  harness.isOfflineSession = true;
  harness.getShift.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { onLine: true });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const mutation = useCloseShift() as unknown as MutationObserver<unknown, Error, { shiftId: string; closingBalance: number }>;
  await expect(mutation.mutate({ shiftId: "shift-1", closingBalance: 1000 })).rejects.toThrow(/shift.*belum tersedia/i);
  expect(fetchMock).not.toHaveBeenCalled();
  client.unmount();
});

it("loads only the current cashier's local shift while offline", async () => {
  const client = new QueryClient();
  client.mount();
  harness.client = client;
  harness.getActiveShift.mockReset().mockResolvedValue({ id: "local-shift" });
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { onLine: false });
  onlineManager.setOnline(false);
  const options = useActiveShift() as unknown as Parameters<typeof client.fetchQuery>[0];
  const operation = client.fetchQuery(options);
  const outcome = await Promise.race([
    operation.then(() => "loaded", (error: Error) => error.message),
    new Promise<string>(resolve => setTimeout(() => resolve("paused"), 200)),
  ]);
  onlineManager.setOnline(true);
  await operation.catch(() => undefined);
  client.unmount();

  expect(outcome).toBe("loaded");
  expect(harness.getActiveShift).toHaveBeenCalledWith({ cashierId: "cashier-1", storeId: "store-1" });
});

it("uses the same shift ID after an online open response is lost", async () => {
  const client = new QueryClient();
  client.mount();
  harness.client = client;
  harness.createShift.mockReset().mockResolvedValue({ id: "local-shift" });
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { onLine: true });
  const fetchMock = vi.fn().mockRejectedValue(new TypeError("response lost"));
  vi.stubGlobal("fetch", fetchMock);
  const mutation = useOpenShift() as unknown as MutationObserver<unknown, Error, { openingBalance: number }>;
  await mutation.mutate({ openingBalance: 1000 });
  client.unmount();

  const sentId = JSON.parse(fetchMock.mock.calls[0][1].body).clientShiftId;
  expect(sentId).toEqual(expect.any(String));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    originCashierId: "cashier-1", originStoreId: "store-1",
  });
  expect(harness.createShift).toHaveBeenCalledWith(expect.objectContaining({ clientShiftId: sentId }));
});

it("runs checkout while offline so the caller can save the failed request locally", async () => {
  const client = new QueryClient();
  client.mount();
  harness.client = client;
  const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
  vi.stubGlobal("fetch", fetchMock);
  onlineManager.setOnline(false);

  const mutation = useCreateTransaction() as unknown as MutationObserver<unknown, Error, {
    items: never[]; paymentMethod: string; amountPaid: number;
  }>;
  const operation = mutation.mutate({ items: [], paymentMethod: "CASH", amountPaid: 0 });
  const outcome = await Promise.race([
    operation.then(() => "success", () => "network-error"),
    new Promise<string>((resolve) => setTimeout(() => resolve("paused"), 200)),
  ]);

  onlineManager.setOnline(true);
  await client.resumePausedMutations();
  await operation.catch(() => undefined);
  client.unmount();

  expect(outcome).toBe("network-error");
  expect(fetchMock).toHaveBeenCalledOnce();
});

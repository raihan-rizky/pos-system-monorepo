import { afterEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ client: null as unknown, createShift: vi.fn(), getActiveShift: vi.fn() }));

vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ userId: "cashier-1", userName: "Kasir", storeId: "store-1" }),
}));
vi.mock("@/lib/offline/offline-db", () => ({
  createOfflineShift: harness.createShift,
  getOfflineActiveShift: harness.getActiveShift,
  rememberActiveShift: vi.fn(),
  offlineDb: { offlineShifts: { get: vi.fn() } },
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
import { useActiveShift, useOpenShift } from "@/hooks/useShift";

afterEach(() => {
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
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

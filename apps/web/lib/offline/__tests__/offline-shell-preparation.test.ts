import { expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => new Set<string>());
vi.mock("@/components/PwaStatusBanner", () => { loaded.add("status"); return {}; });
vi.mock("@/components/InAppPushNotifications", () => { loaded.add("push"); return {}; });
vi.mock("@/components/NotificationPermissionPrompt", () => { loaded.add("permission"); return {}; });
vi.mock("@/components/ServiceWorkerRegistration", () => { loaded.add("worker"); return {}; });
vi.mock("@/components/ReceiptModal", () => { loaded.add("receipt"); return {}; });

import { warmOfflineShellModules } from "../offline-shell-preparation";

it("loads deferred shell and receipt modules before listing offline assets", async () => {
  await warmOfflineShellModules();
  expect([...loaded].sort()).toEqual(["permission", "push", "receipt", "status", "worker"]);
});

import { describe, expect, it } from "vitest";
import {
  isOfflineSessionUsable,
  isOfflinePathAllowed,
  isOfflineActionAllowed,
  type OfflineSessionHandoff,
} from "../offline-session";

const session: OfflineSessionHandoff = {
  cashierId: "cashier-1",
  storeId: "store-1",
  preparedAt: "2026-11-07T00:00:00.000Z",
  nonce: "session-1",
};

describe("offline authorization handoff", () => {
  it("accepts a recent handoff for the same cashier and store", () => {
    expect(isOfflineSessionUsable(session, { userId: "cashier-1", storeId: "store-1" }, new Date("2026-11-07T01:00:00.000Z"))).toBe(true);
  });

  it.each([
    [{ ...session, cashierId: "other" }, "identity mismatch"],
    [{ ...session, storeId: "other" }, "store mismatch"],
    [{ ...session, preparedAt: "2026-10-30T00:00:00.000Z" }, "expired handoff"],
  ])("rejects %s", (candidate) => {
    expect(isOfflineSessionUsable(candidate, { userId: "cashier-1", storeId: "store-1" }, new Date("2026-11-07T01:00:00.000Z"))).toBe(false);
  });

  it("allows only the POS route while the handoff is active", () => {
    expect(isOfflinePathAllowed("/pos")).toBe(true);
    expect(isOfflinePathAllowed("/pos/")).toBe(true);
    expect(isOfflinePathAllowed("/settings")).toBe(false);
    expect(isOfflinePathAllowed("/history")).toBe(false);
  });

  it("limits offline actions to creating a transaction and opening a shift", () => {
    expect(isOfflineActionAllowed("OWNER", "transaction", "create")).toBe(true);
    expect(isOfflineActionAllowed("SALES", "transaction.request", "create")).toBe(true);
    expect(isOfflineActionAllowed("SALES", "transaction", "create")).toBe(false);
    expect(isOfflineActionAllowed("OWNER", "product", "update")).toBe(false);
  });
});

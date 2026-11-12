import { describe, expect, it } from "vitest";
import { buildDefaultRolePermissions } from "../rbac-core";
import { createOnlineAccessState, reduceOnlineAccessState } from "../online-access-state";
import type { CurrentRoleAccess } from "../permission-refresh";

const snapshot: CurrentRoleAccess = {
  authorizationFingerprint: "permissions-v1",
  permissions: buildDefaultRolePermissions(),
  user: { id: "sales-1", role: "SALES", name: "Sales", storeId: "store-1" },
};

describe("online authorization recovery", () => {
  it("keeps the verified snapshot while a temporary check is retried", () => {
    const current = createOnlineAccessState(snapshot);
    const retry = reduceOnlineAccessState(current, { type: "retrying", generation: 0 });
    expect(retry).toMatchObject({ phase: "recovering", snapshot });
    expect(reduceOnlineAccessState(retry, { type: "verified", generation: 0, snapshot }).phase).toBe("verified");
  });

  it("does not grant access when the first permission request fails", () => {
    const current = createOnlineAccessState(null);
    expect(reduceOnlineAccessState(current, { type: "failed", generation: 0, kind: "transient" }))
      .toMatchObject({ phase: "unavailable", snapshot: null });
  });

  it.each([["unauthenticated", "login-required"], ["forbidden", "forbidden"]] as const)(
    "removes the snapshot for %s and ignores responses started before invalidation",
    (kind, phase) => {
      const state = createOnlineAccessState(snapshot);
      const stopped = reduceOnlineAccessState(state, { type: "failed", generation: 0, kind });
      expect(stopped).toMatchObject({ phase, generation: 1, snapshot: null });
      expect(reduceOnlineAccessState(stopped, { type: "verified", generation: 0, snapshot })).toBe(stopped);
      if (phase === "login-required") {
        expect(reduceOnlineAccessState(stopped, { type: "verified", generation: 1, snapshot })).toBe(stopped);
      }
    },
  );

  it("ignores stale account data after a new generation starts", () => {
    const switched = reduceOnlineAccessState(createOnlineAccessState(snapshot), { type: "start-generation" });
    expect(reduceOnlineAccessState(switched, { type: "verified", generation: 0, snapshot })).toBe(switched);
    expect(switched.snapshot).toBeNull();
  });
});

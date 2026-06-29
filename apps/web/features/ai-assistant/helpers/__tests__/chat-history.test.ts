import { describe, expect, it } from "vitest";

import { buildAssistantHistoryKey, sanitizeAssistantHistoryRecord } from "../chat-history";

describe("AI assistant chat history", () => {
  it("isolates history by user, role, store, authorization fingerprint, and schema version", () => {
    const base = buildAssistantHistoryKey({
      userId: "user-1",
      role: "ADMIN",
      storeId: "store-1",
      authorizationFingerprint: "perm-a",
    });

    expect(base).not.toBe(buildAssistantHistoryKey({
      userId: "user-2",
      role: "ADMIN",
      storeId: "store-1",
      authorizationFingerprint: "perm-a",
    }));
    expect(base).not.toBe(buildAssistantHistoryKey({
      userId: "user-1",
      role: "CASHIER",
      storeId: "store-1",
      authorizationFingerprint: "perm-a",
    }));
    expect(base).not.toBe(buildAssistantHistoryKey({
      userId: "user-1",
      role: "ADMIN",
      storeId: "store-2",
      authorizationFingerprint: "perm-a",
    }));
    expect(base).not.toBe(buildAssistantHistoryKey({
      userId: "user-1",
      role: "ADMIN",
      storeId: "store-1",
      authorizationFingerprint: "perm-b",
    }));
  });

  it("discards expired and malformed history records", () => {
    const now = 1_000_000;

    expect(sanitizeAssistantHistoryRecord(
      { timestamp: now - 13 * 60 * 60 * 1000, messages: [{ role: "user", content: "Halo" }] },
      now,
    )).toBeNull();
    expect(sanitizeAssistantHistoryRecord(
      { timestamp: now, messages: [{ role: "admin", content: "bad" }] },
      now,
    )).toBeNull();
    expect(sanitizeAssistantHistoryRecord(
      { timestamp: now, messages: [{ role: "assistant", content: "Siap", workflow: { bad: true } }] },
      now,
    )).toBeNull();
  });
});

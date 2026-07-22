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

  it("keeps valid generated report cards and rejects malformed actions", () => {
    const now = 1_000_000;
    const valid = {
      timestamp: now,
      messages: [{
        role: "assistant",
        content: "File siap",
        generatedFile: {
          name: "laporan-keuangan-30d.pdf",
          format: "pdf",
          label: "Laporan Keuangan",
          action: { kind: "export_financial_report", period: "30d", format: "pdf" },
          advice: ["Pantau pengeluaran."],
        },
      }],
    };

    expect(sanitizeAssistantHistoryRecord(valid, now)?.messages[0].generatedFile?.name)
      .toBe("laporan-keuangan-30d.pdf");
    expect(sanitizeAssistantHistoryRecord({
      ...valid,
      messages: [{ ...valid.messages[0], generatedFile: { ...valid.messages[0].generatedFile, action: { kind: "open_modal" } } }],
    }, now)).toBeNull();
  });
});

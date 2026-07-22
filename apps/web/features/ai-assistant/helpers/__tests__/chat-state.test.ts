import { describe, expect, it } from "vitest";

import {
  appendAssistantActionFailure,
  appendAssistantActionLogEntry,
  appendAssistantRequestStatus,
  appendAssistantChunk,
  appendAssistantMetadata,
  appendUserMessage,
  completeAssistantActionLog,
  keepRecentMessages,
  setAssistantFinalContent,
  setAssistantGeneratedFile,
  setAssistantWorkflowPayload,
} from "../chat-state";

describe("AI assistant chat state", () => {
  it("appends user message", () => {
    const messages = appendUserMessage([], "Halo");

    expect(messages).toEqual([{ role: "user", content: "Halo" }]);
  });

  it("merges streamed assistant chunks into the last assistant message", () => {
    const messages = appendAssistantChunk([{ role: "user", content: "Halo" }], "Hai");
    const next = appendAssistantChunk(messages, " juga");

    expect(next).toEqual([
      { role: "user", content: "Halo" },
      { role: "assistant", content: "Hai juga" },
    ]);
  });

  it("keeps only the last 10 message pairs", () => {
    const messages = Array.from({ length: 22 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `Message ${index}`,
    }));

    const recent = keepRecentMessages(messages);

    expect(recent).toHaveLength(20);
    expect(recent[0].content).toBe("Message 2");
  });

  it("attaches metadata to the last assistant message", () => {
    const messages = appendAssistantMetadata(
      [{ role: "assistant", content: "Ini datanya" }],
      { sourceLabel: "Tool stok rendah", generatedAt: "2026-06-26T10:15:00.000Z" },
    );

    expect(messages[0].metadata?.sourceLabel).toBe("Tool stok rendah");
  });

  it("appends an action log entry to a new assistant message", () => {
    const messages = appendAssistantActionLogEntry(
      [{ role: "user", content: "Cek stok" }],
      { label: "Preparing answer", status: "active", occurredAt: "2026-06-26T10:15:00.000Z" },
    );

    expect(messages).toEqual([
      { role: "user", content: "Cek stok" },
      {
        role: "assistant",
        content: "",
        actionLog: [{
          id: "Preparing answer-2026-06-26T10:15:00.000Z",
          label: "Preparing answer",
          status: "active",
          occurredAt: "2026-06-26T10:15:00.000Z",
        }],
      },
    ]);
  });

  it("marks the previous active action as done when a new step arrives", () => {
    const messages = appendAssistantActionLogEntry(
      [{ role: "assistant", content: "", actionLog: [{ id: "one", label: "Preparing answer", status: "active", occurredAt: "2026-06-26T10:15:00.000Z" }] }],
      { label: "Checking data", status: "active", occurredAt: "2026-06-26T10:16:00.000Z" },
    );

    expect(messages[0].actionLog?.map((item) => item.status)).toEqual(["done", "active"]);
  });

  it("deduplicates repeated adjacent action labels", () => {
    const messages = appendAssistantActionLogEntry(
      [{ role: "assistant", content: "", actionLog: [{ id: "one", label: "Checking data", status: "active", occurredAt: "2026-06-26T10:15:00.000Z" }] }],
      { label: "Checking data", status: "active", occurredAt: "2026-06-26T10:16:00.000Z" },
    );

    expect(messages[0].actionLog).toHaveLength(1);
    expect(messages[0].actionLog?.[0].occurredAt).toBe("2026-06-26T10:16:00.000Z");
  });

  it("marks active action log entries done when the assistant completes", () => {
    const messages = completeAssistantActionLog([
      {
        role: "assistant",
        content: "Ini datanya",
        actionLog: [{ id: "one", label: "Preparing response", status: "active", occurredAt: "2026-06-26T10:15:00.000Z" }],
      },
    ]);

    expect(messages[0].actionLog?.[0].status).toBe("done");
  });

  it("appends a safe failed process entry", () => {
    const messages = appendAssistantActionFailure(
      [{ role: "user", content: "Cek stok" }],
      "Response interrupted",
      "2026-06-26T10:15:00.000Z",
    );

    expect(messages[1].actionLog?.[0]).toMatchObject({
      label: "Response interrupted",
      status: "failed",
    });
  });

  it("adds an immediate request status after the user sends a message", () => {
    const messages = appendAssistantRequestStatus(
      [{ role: "user", content: "Cek stok" }],
      "2026-06-26T10:15:00.000Z",
    );

    expect(messages).toEqual([
      { role: "user", content: "Cek stok" },
      {
        role: "assistant",
        content: "",
        actionLog: [{
          id: "Sending request-2026-06-26T10:15:00.000Z",
          label: "Sending request",
          status: "active",
          occurredAt: "2026-06-26T10:15:00.000Z",
        }],
      },
    ]);
  });

  it("overwrites the assistant message content on final answer", () => {
    const messages = [{ role: "assistant" as const, content: "Sesuatu yang belum selesai" }];
    const next = setAssistantFinalContent(messages, "Jawaban final");

    expect(next).toEqual([{ role: "assistant", content: "Jawaban final" }]);
  });

  it("attaches a workflow payload to the last assistant message", () => {
    const next = setAssistantWorkflowPayload(
      [{ role: "assistant", content: "Ikuti alur ini." }],
      {
        id: "faq-q01-add-product",
        title: "Tambah produk baru",
        route: "/products",
        actionLabel: "Buka Produk",
        sourceRef: "docs/help/faq.md#q1",
        steps: [{
          id: "faq-q01-add-product-step-1",
          title: "Buka katalog",
          description: "Buka halaman produk.",
          route: "/products",
          actionLabel: "Buka Produk",
          iconKey: "package",
        }],
      },
    );

    expect(next[0].workflow?.id).toBe("faq-q01-add-product");
  });

  it("attaches a generated report file and advice to the last assistant message", () => {
    const next = setAssistantGeneratedFile(
      [{ role: "assistant", content: "Laporan siap." }],
      {
        name: "laporan-keuangan-30d.pdf",
        format: "pdf",
        label: "Laporan Keuangan",
        action: { kind: "export_financial_report", period: "30d", format: "pdf" },
        advice: ["Review pengeluaran terbesar minggu ini."],
        downloaded: false,
      },
    );

    expect(next[0].generatedFile?.name).toBe("laporan-keuangan-30d.pdf");
    expect(next[0].generatedFile?.advice).toEqual(["Review pengeluaran terbesar minggu ini."]);
    expect(next[0].generatedFile?.downloaded).toBe(false);
  });
});

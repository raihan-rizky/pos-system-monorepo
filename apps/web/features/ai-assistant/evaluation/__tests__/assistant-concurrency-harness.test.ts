import { describe, expect, it, vi } from "vitest";

import {
  assertAssistantConcurrencySlo,
  buildWorkflowFastPathWorkload,
  createWorkflowFastPathHarnessRunner,
  runAssistantConcurrencyHarness,
} from "../assistant-concurrency-harness";

describe("assistant concurrency harness", () => {
  it("builds a repeatable 10-request workload from the versioned workflow evaluation set", () => {
    const workload = buildWorkflowFastPathWorkload();

    expect(workload.version).toBe("2026-06-29.faq-workflows.v1.concurrency-v1");
    expect(workload.concurrency).toBe(10);
    expect(workload.requests).toHaveLength(10);
    expect(new Set(workload.requests.map((item) => item.caseId)).size).toBe(10);
    expect(workload.requests.every((item) => item.expectedWorkflowId.startsWith("faq-q"))).toBe(true);
  });

  it("runs request functions concurrently and reports p95 latency and failure rate", async () => {
    const workload = {
      version: "test-workload",
      concurrency: 10,
      requests: Array.from({ length: 10 }, (_, index) => ({
        caseId: `case-${index + 1}`,
        prompt: `prompt ${index + 1}`,
        role: "OWNER" as const,
        expectedWorkflowId: "faq-q01-add-product",
      })),
    };
    let active = 0;
    let maxActive = 0;

    const result = await runAssistantConcurrencyHarness({
      workload,
      request: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return {
          ok: true,
          firstStatusMs: 10,
          completionMs: 20,
          workflowId: "faq-q01-add-product",
        };
      },
    });

    expect(maxActive).toBeGreaterThan(1);
    expect(result).toMatchObject({
      totalRequests: 10,
      successfulRequests: 10,
      failedRequests: 0,
      failureRate: 0,
      p95FirstStatusMs: 10,
      p95CompletionMs: 20,
    });
  });

  it("can execute the default workflow fast-path workload without provider calls", async () => {
    const providerCreate = vi.fn(() => {
      throw new Error("Provider should not be called by workflow fast-path harness");
    });
    const result = await runAssistantConcurrencyHarness({
      workload: buildWorkflowFastPathWorkload(),
      request: createWorkflowFastPathHarnessRunner({ providerCreate }),
    });

    expect(providerCreate).not.toHaveBeenCalled();
    expect(result.totalRequests).toBe(10);
    expect(result.failedRequests).toBe(0);
    expect(result.failureRate).toBe(0);
    expect(result.responses.every((item) => item.ok && item.workflowId === item.expectedWorkflowId)).toBe(true);
    expect(() => assertAssistantConcurrencySlo(result)).not.toThrow();
  });

  it("fails the release SLO when latency or failure thresholds are exceeded", () => {
    expect(() => assertAssistantConcurrencySlo({
      workloadVersion: "test",
      totalRequests: 10,
      successfulRequests: 9,
      failedRequests: 1,
      failureRate: 0.1,
      p95FirstStatusMs: 1_200,
      p95CompletionMs: 9_000,
      responses: [],
    })).toThrow(/SLO/);
  });
});

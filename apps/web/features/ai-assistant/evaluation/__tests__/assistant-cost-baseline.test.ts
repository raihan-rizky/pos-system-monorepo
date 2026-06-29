import { describe, expect, it } from "vitest";

import {
  ASSISTANT_COST_WORKLOAD,
  assertAssistantCostReduction,
  compareAssistantCostBaseline,
  estimateProviderCostUsd,
} from "../assistant-cost-baseline";

describe("assistant cost baseline", () => {
  it("defines a versioned representative workload with weights that sum to one", () => {
    const totalWeight = ASSISTANT_COST_WORKLOAD.segments
      .reduce((total, segment) => total + segment.weight, 0);

    expect(ASSISTANT_COST_WORKLOAD.version).toBe("2026-06-29.representative-ai-cost.v1");
    expect(ASSISTANT_COST_WORKLOAD.segments.map((segment) => segment.kind)).toEqual([
      "workflow_fast_path",
      "workflow_model_selection",
      "tool_fast_path",
      "model_fallback",
    ]);
    expect(totalWeight).toBeCloseTo(1, 6);
  });

  it("estimates provider cost from input and output token rates", () => {
    const cost = estimateProviderCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      rateSnapshot: {
        version: "test-rates",
        inputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 2,
      },
    });

    expect(cost).toBe(2);
  });

  it("compares baseline and candidate cost while counting retries and failed requests", () => {
    const comparison = compareAssistantCostBaseline({
      rateSnapshot: {
        version: "test-rates",
        inputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 2,
      },
      baselineRequests: [
        {
          id: "baseline-success",
          outcome: "success",
          attempts: [{ inputTokens: 1_000_000, outputTokens: 500_000 }],
        },
        {
          id: "baseline-failed",
          outcome: "failed",
          attempts: [{ inputTokens: 500_000, outputTokens: 250_000 }],
        },
      ],
      candidateRequests: [
        {
          id: "candidate-deterministic",
          outcome: "success",
          attempts: [],
        },
        {
          id: "candidate-retry",
          outcome: "failed",
          attempts: [
            { inputTokens: 100_000, outputTokens: 50_000 },
            { inputTokens: 100_000, outputTokens: 50_000 },
          ],
        },
      ],
    });

    expect(comparison.baseline.totalCostUsd).toBe(3);
    expect(comparison.baseline.averageCostUsd).toBe(1.5);
    expect(comparison.candidate.totalCostUsd).toBe(0.4);
    expect(comparison.candidate.requestCount).toBe(2);
    expect(comparison.reductionRatio).toBeCloseTo(0.866666, 5);
    expect(comparison.meetsThirtyPercentReduction).toBe(true);
    expect(() => assertAssistantCostReduction(comparison)).not.toThrow();
  });

  it("fails the release gate when candidate cost reduction is below thirty percent", () => {
    const comparison = compareAssistantCostBaseline({
      rateSnapshot: {
        version: "test-rates",
        inputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 1,
      },
      baselineRequests: [{ id: "baseline", outcome: "success", attempts: [{ inputTokens: 100, outputTokens: 100 }] }],
      candidateRequests: [{ id: "candidate", outcome: "success", attempts: [{ inputTokens: 90, outputTokens: 90 }] }],
    });

    expect(() => assertAssistantCostReduction(comparison)).toThrow(/cost reduction/);
  });
});

export type AssistantCostSegmentKind =
  | "workflow_fast_path"
  | "workflow_model_selection"
  | "tool_fast_path"
  | "model_fallback";

export type AssistantCostWorkloadSegment = {
  kind: AssistantCostSegmentKind;
  weight: number;
  description: string;
};

export type ProviderRateSnapshot = {
  version: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};

export type ProviderAttemptUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type AssistantCostRequestSample = {
  id: string;
  outcome: "success" | "failed" | "cancelled";
  attempts: ProviderAttemptUsage[];
};

export const ASSISTANT_COST_WORKLOAD = {
  version: "2026-06-29.representative-ai-cost.v1",
  segments: [
    {
      kind: "workflow_fast_path",
      weight: 0.45,
      description: "Recognized FAQ workflow requests rendered from the trusted catalog without provider calls.",
    },
    {
      kind: "workflow_model_selection",
      weight: 0.15,
      description: "Ambiguous or unmatched POS how-to requests resolved by constrained workflow ID selection.",
    },
    {
      kind: "tool_fast_path",
      weight: 0.25,
      description: "High-confidence live-data requests with deterministic routing and validated tool execution.",
    },
    {
      kind: "model_fallback",
      weight: 0.15,
      description: "Conversational or ambiguous requests that still need model synthesis.",
    },
  ] satisfies AssistantCostWorkloadSegment[],
};

export function estimateProviderCostUsd(input: {
  inputTokens: number;
  outputTokens: number;
  rateSnapshot: ProviderRateSnapshot;
}) {
  const inputCost = (input.inputTokens / 1_000_000) * input.rateSnapshot.inputUsdPerMillionTokens;
  const outputCost = (input.outputTokens / 1_000_000) * input.rateSnapshot.outputUsdPerMillionTokens;

  return inputCost + outputCost;
}

function summarizeSamples(samples: AssistantCostRequestSample[], rateSnapshot: ProviderRateSnapshot) {
  const requestCosts = samples.map((sample) => ({
    id: sample.id,
    outcome: sample.outcome,
    costUsd: sample.attempts.reduce((total, attempt) => total + estimateProviderCostUsd({
      ...attempt,
      rateSnapshot,
    }), 0),
    attemptCount: sample.attempts.length,
  }));
  const totalCostUsd = requestCosts.reduce((total, sample) => total + sample.costUsd, 0);

  return {
    requestCount: samples.length,
    totalCostUsd,
    averageCostUsd: samples.length === 0 ? 0 : totalCostUsd / samples.length,
    requestCosts,
  };
}

export function compareAssistantCostBaseline(input: {
  rateSnapshot: ProviderRateSnapshot;
  baselineRequests: AssistantCostRequestSample[];
  candidateRequests: AssistantCostRequestSample[];
}) {
  const baseline = summarizeSamples(input.baselineRequests, input.rateSnapshot);
  const candidate = summarizeSamples(input.candidateRequests, input.rateSnapshot);
  const reductionRatio = baseline.averageCostUsd === 0
    ? 0
    : (baseline.averageCostUsd - candidate.averageCostUsd) / baseline.averageCostUsd;

  return {
    rateSnapshotVersion: input.rateSnapshot.version,
    baseline,
    candidate,
    reductionRatio,
    meetsThirtyPercentReduction: reductionRatio >= 0.3,
  };
}

export function assertAssistantCostReduction(
  comparison: ReturnType<typeof compareAssistantCostBaseline>,
  minimumReductionRatio = 0.3,
) {
  if (comparison.reductionRatio < minimumReductionRatio) {
    throw new Error(
      `Assistant cost reduction gate failed: ${(comparison.reductionRatio * 100).toFixed(2)}% < ${(minimumReductionRatio * 100).toFixed(0)}%`,
    );
  }
}

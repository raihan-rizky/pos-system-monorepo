import type { Role } from "@/features/rbac/helpers/rbac-core";
import { AssistantService } from "../services/assistant-service";
import { WORKFLOW_EVALUATION_DATASET } from "./assistant-workflow-evaluation";

export type AssistantHarnessRequest = {
  caseId: string;
  prompt: string;
  role: Role;
  expectedWorkflowId: string;
};

export type AssistantHarnessWorkload = {
  version: string;
  concurrency: number;
  requests: AssistantHarnessRequest[];
};

export type AssistantHarnessRequestResult = {
  ok: boolean;
  firstStatusMs: number;
  completionMs: number;
  workflowId?: string;
  error?: string;
};

export type AssistantHarnessResponse = AssistantHarnessRequestResult & {
  caseId: string;
  expectedWorkflowId: string;
};

export type AssistantHarnessSummary = {
  workloadVersion: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  failureRate: number;
  p95FirstStatusMs: number;
  p95CompletionMs: number;
  responses: AssistantHarnessResponse[];
};

export const ASSISTANT_CONCURRENCY_SLO = {
  maxP95FirstStatusMs: 1_000,
  maxP95CompletionMs: 8_500,
  maxFailureRate: 0.03,
} as const;

type HarnessRunner = (request: AssistantHarnessRequest, index: number) => Promise<AssistantHarnessRequestResult>;

export function buildWorkflowFastPathWorkload(concurrency = 10): AssistantHarnessWorkload {
  const requests = WORKFLOW_EVALUATION_DATASET.cases
    .filter((item) => item.expected.kind === "matched" && item.tags.includes("canonical"))
    .slice(0, concurrency)
    .map((item) => ({
      caseId: item.id,
      prompt: item.prompt,
      role: item.role,
      expectedWorkflowId: item.expected.kind === "matched" ? item.expected.workflowId : "",
    }));

  if (requests.length < concurrency) {
    throw new Error(`Workflow fast-path workload needs ${concurrency} requests, found ${requests.length}.`);
  }

  return {
    version: `${WORKFLOW_EVALUATION_DATASET.version}.concurrency-v1`,
    concurrency,
    requests,
  };
}

export function percentile(values: number[], rank: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1));
  return sorted[index];
}

export async function runAssistantConcurrencyHarness(input: {
  workload: AssistantHarnessWorkload;
  request: HarnessRunner;
}): Promise<AssistantHarnessSummary> {
  const responses = await Promise.all(input.workload.requests.map(async (request, index) => {
    try {
      const result = await input.request(request, index);
      const matchesExpected = result.workflowId === undefined || result.workflowId === request.expectedWorkflowId;

      return {
        ...result,
        ok: result.ok && matchesExpected,
        caseId: request.caseId,
        expectedWorkflowId: request.expectedWorkflowId,
      };
    } catch (error) {
      return {
        ok: false,
        firstStatusMs: 0,
        completionMs: 0,
        error: error instanceof Error ? error.message : String(error),
        caseId: request.caseId,
        expectedWorkflowId: request.expectedWorkflowId,
      };
    }
  }));

  const successful = responses.filter((response) => response.ok);

  return {
    workloadVersion: input.workload.version,
    totalRequests: responses.length,
    successfulRequests: successful.length,
    failedRequests: responses.length - successful.length,
    failureRate: responses.length === 0 ? 0 : (responses.length - successful.length) / responses.length,
    p95FirstStatusMs: percentile(successful.map((response) => response.firstStatusMs), 95),
    p95CompletionMs: percentile(successful.map((response) => response.completionMs), 95),
    responses,
  };
}

export function assertAssistantConcurrencySlo(
  summary: AssistantHarnessSummary,
  thresholds = ASSISTANT_CONCURRENCY_SLO,
) {
  const failures: string[] = [];

  if (summary.p95FirstStatusMs > thresholds.maxP95FirstStatusMs) {
    failures.push(`p95 first status ${summary.p95FirstStatusMs}ms > ${thresholds.maxP95FirstStatusMs}ms`);
  }
  if (summary.p95CompletionMs > thresholds.maxP95CompletionMs) {
    failures.push(`p95 completion ${summary.p95CompletionMs}ms > ${thresholds.maxP95CompletionMs}ms`);
  }
  if (summary.failureRate > thresholds.maxFailureRate) {
    failures.push(`failure rate ${summary.failureRate} > ${thresholds.maxFailureRate}`);
  }

  if (failures.length > 0) {
    throw new Error(`Assistant concurrency SLO failed for ${summary.workloadVersion}: ${failures.join("; ")}`);
  }
}

function parseSseFrames(body: string) {
  return body
    .split("\n\n")
    .map((frame) => frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6))
    .filter((value): value is string => Boolean(value) && value !== "[DONE]")
    .map((value) => JSON.parse(value));
}

export function createWorkflowFastPathHarnessRunner(input?: {
  providerCreate?: (...args: unknown[]) => unknown;
  now?: () => Date;
}): HarnessRunner {
  return async (request) => {
    const providerCreate = input?.providerCreate ?? (() => {
      throw new Error("Provider should not be called by workflow fast-path harness");
    });
    const service = new AssistantService({
      apiKey: "harness-key",
      model: "harness-model",
      client: { chat: { completions: { create: providerCreate } } } as any,
      now: input?.now ?? (() => new Date("2026-06-29T08:00:00.000Z")),
    });
    const startedAt = Date.now();
    const response = service.toResponseStream({
      role: request.role,
      storeId: "harness-store",
      messages: [{ role: "user", content: request.prompt }],
      signal: new AbortController().signal,
    });

    let firstStatusMs = 0;
    let body = "";
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Assistant stream did not include a body.");
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      body += chunk;
      if (firstStatusMs === 0 && chunk.includes('"type":"progress"')) {
        firstStatusMs = Date.now() - startedAt;
      }
    }

    body += decoder.decode();
    const frames = parseSseFrames(body);
    const finalFrame = frames.find((frame) => frame.type === "final");
    const workflowId = finalFrame?.answer?.workflow?.id;
    const completionMs = Date.now() - startedAt;

    return {
      ok: finalFrame?.answer?.responseKind === "workflow" && workflowId === request.expectedWorkflowId,
      firstStatusMs,
      completionMs,
      workflowId,
    };
  };
}

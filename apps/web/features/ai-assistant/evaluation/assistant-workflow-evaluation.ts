import {
  buildDefaultRolePermissions,
  type Role,
  type RolePermissions,
} from "@/features/rbac/helpers/rbac-core";
import { matchAssistantWorkflow } from "../workflows/assistant-workflow-matcher";
import { FAQ_WORKFLOWS } from "../workflows/workflow-catalog";

export const WORKFLOW_EVALUATION_DATASET_VERSION = "2026-06-29.faq-workflows.v1";

export type WorkflowEvaluationExpected =
  | { kind: "matched"; workflowId: string }
  | { kind: "denied"; workflowId: string }
  | { kind: "none" };

export type WorkflowEvaluationCase = {
  id: string;
  prompt: string;
  role: Role;
  expected: WorkflowEvaluationExpected;
  tags: string[];
};

export type WorkflowEvaluationDataset = {
  version: string;
  cases: WorkflowEvaluationCase[];
};

export type WorkflowEvaluationResult = {
  case: WorkflowEvaluationCase;
  actual: WorkflowEvaluationExpected | { kind: "ambiguous"; workflowIds: string[] };
  passed: boolean;
};

function caseId(workflowId: string, suffix: string) {
  return `${workflowId}:${suffix}`;
}

function workflowCases(): WorkflowEvaluationCase[] {
  return FAQ_WORKFLOWS.flatMap((workflow) => {
    const paraphrases = workflow.aliases.slice(0, 2);

    return [
      {
        id: caseId(workflow.id, "canonical"),
        prompt: workflow.title,
        role: "OWNER" as const,
        expected: { kind: "matched" as const, workflowId: workflow.id },
        tags: ["canonical", "faq", `q${workflow.faqNumber}`],
      },
      ...paraphrases.map((prompt, index) => ({
        id: caseId(workflow.id, `paraphrase-${index + 1}`),
        prompt,
        role: "OWNER" as const,
        expected: { kind: "matched" as const, workflowId: workflow.id },
        tags: ["paraphrase", "faq", `q${workflow.faqNumber}`],
      })),
    ];
  });
}

export const WORKFLOW_EVALUATION_DATASET: WorkflowEvaluationDataset = {
  version: WORKFLOW_EVALUATION_DATASET_VERSION,
  cases: [
    ...workflowCases(),
    {
      id: "security:cashier-add-product-denied",
      prompt: "cara tambah produk baru",
      role: "CASHIER",
      expected: { kind: "denied", workflowId: "faq-q01-add-product" },
      tags: ["security", "rbac"],
    },
    {
      id: "security:admin-rbac-denied",
      prompt: "cara mengatur hak akses kasir dan admin di RBAC",
      role: "ADMIN",
      expected: { kind: "denied", workflowId: "faq-q22-manage-rbac" },
      tags: ["security", "rbac"],
    },
    {
      id: "scope:non-pos-question",
      prompt: "apa resep soto bening",
      role: "OWNER",
      expected: { kind: "none" },
      tags: ["scope", "out_of_scope"],
    },
  ],
};

function actualFromMatch(input: ReturnType<typeof matchAssistantWorkflow>): WorkflowEvaluationResult["actual"] {
  if (input.kind === "matched") return { kind: "matched", workflowId: input.workflow.id };
  if (input.kind === "denied") return { kind: "denied", workflowId: input.workflow.id };
  if (input.kind === "ambiguous") {
    return { kind: "ambiguous", workflowIds: input.candidates.map((workflow) => workflow.id) };
  }
  return { kind: "none" };
}

function expectedMatchesActual(
  expected: WorkflowEvaluationExpected,
  actual: WorkflowEvaluationResult["actual"],
) {
  if (expected.kind === "none") return actual.kind === "none";
  return actual.kind === expected.kind && "workflowId" in actual && actual.workflowId === expected.workflowId;
}

export function runWorkflowEvaluation(input?: {
  dataset?: WorkflowEvaluationDataset;
  permissions?: RolePermissions;
}): WorkflowEvaluationResult[] {
  const dataset = input?.dataset ?? WORKFLOW_EVALUATION_DATASET;
  const permissions = input?.permissions ?? buildDefaultRolePermissions();

  return dataset.cases.map((evaluationCase) => {
    const actual = actualFromMatch(matchAssistantWorkflow({
      message: evaluationCase.prompt,
      role: evaluationCase.role,
      permissions,
    }));

    return {
      case: evaluationCase,
      actual,
      passed: expectedMatchesActual(evaluationCase.expected, actual),
    };
  });
}

export function summarizeWorkflowEvaluation(results: WorkflowEvaluationResult[]) {
  const passedCases = results.filter((result) => result.passed).length;
  const workflowResults = results.filter((result) => result.case.expected.kind === "matched");
  const canonicalResults = workflowResults.filter((result) => result.case.tags.includes("canonical"));
  const grouped = new Map<string, WorkflowEvaluationResult[]>();

  for (const result of workflowResults) {
    const workflowId = result.case.expected.kind === "matched" ? result.case.expected.workflowId : "";
    grouped.set(workflowId, [...(grouped.get(workflowId) ?? []), result]);
  }

  const perWorkflow = Array.from(grouped.entries()).map(([workflowId, items]) => {
    const passed = items.filter((item) => item.passed).length;
    return {
      workflowId,
      totalCases: items.length,
      passedCases: passed,
      accuracy: items.length === 0 ? 1 : passed / items.length,
    };
  });

  return {
    totalCases: results.length,
    passedCases,
    accuracy: results.length === 0 ? 1 : passedCases / results.length,
    canonicalPassRate: canonicalResults.length === 0
      ? 1
      : canonicalResults.filter((result) => result.passed).length / canonicalResults.length,
    minimumWorkflowAccuracy: perWorkflow.length === 0
      ? 1
      : Math.min(...perWorkflow.map((item) => item.accuracy)),
    perWorkflow,
    failures: results.filter((result) => !result.passed),
  };
}

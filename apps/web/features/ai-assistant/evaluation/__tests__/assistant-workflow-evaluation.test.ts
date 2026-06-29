import { describe, expect, it } from "vitest";

import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { FAQ_WORKFLOWS } from "../../workflows/workflow-catalog";
import {
  WORKFLOW_EVALUATION_DATASET,
  runWorkflowEvaluation,
  summarizeWorkflowEvaluation,
} from "../assistant-workflow-evaluation";

describe("assistant workflow evaluation", () => {
  it("defines a versioned canonical and paraphrase dataset for every numbered FAQ workflow", () => {
    const workflowCases = WORKFLOW_EVALUATION_DATASET.cases.filter((item) => item.expected.kind === "matched");

    expect(WORKFLOW_EVALUATION_DATASET.version).toBe("2026-06-29.faq-workflows.v1");
    expect(workflowCases.length).toBeGreaterThanOrEqual(FAQ_WORKFLOWS.length * 3);

    for (const workflow of FAQ_WORKFLOWS) {
      const cases = workflowCases.filter((item) =>
        item.expected.kind === "matched" && item.expected.workflowId === workflow.id
      );

      expect(cases.some((item) => item.tags.includes("canonical"))).toBe(true);
      expect(cases.filter((item) => item.tags.includes("paraphrase")).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("meets the guided workflow release accuracy thresholds against the deterministic matcher", () => {
    const results = runWorkflowEvaluation({
      dataset: WORKFLOW_EVALUATION_DATASET,
      permissions: buildDefaultRolePermissions(),
    });
    const summary = summarizeWorkflowEvaluation(results);

    expect(summary.totalCases).toBe(WORKFLOW_EVALUATION_DATASET.cases.length);
    expect(summary.accuracy).toBeGreaterThanOrEqual(0.95);
    expect(summary.canonicalPassRate).toBe(1);
    expect(summary.minimumWorkflowAccuracy).toBeGreaterThanOrEqual(0.9);
    expect(summary.failures).toEqual([]);
  });
});

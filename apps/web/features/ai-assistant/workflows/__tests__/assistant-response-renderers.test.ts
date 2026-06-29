import { describe, expect, it } from "vitest";

import { FAQ_WORKFLOWS } from "../workflow-catalog";
import { renderWorkflowAccessDeniedAnswer, renderWorkflowAnswer } from "../assistant-response-renderers";

describe("assistant workflow response renderers", () => {
  const workflow = FAQ_WORKFLOWS[0];

  it("renders a trusted guided workflow answer with a serializable payload", () => {
    const answer = renderWorkflowAnswer(workflow, "2026-06-29T08:00:00.000Z");

    expect(answer).toMatchObject({
      responseKind: "workflow",
      dataStatus: "help_docs",
      sourceLabel: "FAQ Operasional",
      generatedAt: "2026-06-29T08:00:00.000Z",
      workflow: {
        id: workflow.id,
        title: workflow.title,
        route: workflow.route,
        steps: expect.arrayContaining([
          expect.objectContaining({
            id: `${workflow.id}-step-1`,
            title: expect.any(String),
            description: expect.any(String),
          }),
        ]),
      },
    });
    expect(JSON.stringify(answer.workflow)).toContain(workflow.sourceRef);
  });

  it("renders deterministic Indonesian access guidance without operational steps", () => {
    const answer = renderWorkflowAccessDeniedAnswer(workflow, "2026-06-29T08:00:00.000Z");

    expect(answer.responseKind).toBe("text");
    expect(answer.dataStatus).toBe("error");
    expect(answer.answerMarkdown).toContain("akses");
    expect(answer).not.toHaveProperty("workflow");
  });
});

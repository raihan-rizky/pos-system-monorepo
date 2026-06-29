"use client";

import type { AssistantWorkflowPayload } from "../types/assistant";
import { WorkflowStepper } from "./WorkflowStepper";

export function AssistantWorkflowMessage({ workflow }: { workflow: AssistantWorkflowPayload }) {
  return (
    <section className="mt-3 border-t border-surface-500/30 pt-3" aria-label={workflow.title}>
      <div className="mb-2">
        <h3 className="text-sm font-bold text-surface-50">{workflow.title}</h3>
        <p className="mt-1 text-[11px] text-surface-400">Sumber: {workflow.sourceRef}</p>
      </div>
      <WorkflowStepper steps={workflow.steps} compact tone="dark" />
    </section>
  );
}

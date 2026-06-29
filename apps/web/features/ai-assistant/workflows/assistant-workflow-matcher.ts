import {
  canRoleAccessPage,
  canRolePerformAction,
  type Role,
  type RolePermissions,
} from "@/features/rbac/helpers/rbac-core";
import { FAQ_WORKFLOWS, type AssistantWorkflowDefinition } from "./workflow-catalog";

export type WorkflowMatchResult =
  | { kind: "matched"; workflow: AssistantWorkflowDefinition; confidence: number }
  | { kind: "denied"; workflow: AssistantWorkflowDefinition; confidence: number; missingRequirements: string[] }
  | { kind: "ambiguous"; candidates: AssistantWorkflowDefinition[]; confidence: number }
  | { kind: "none" };

type MatchInput = {
  message: string;
  role: Role;
  permissions: RolePermissions;
};

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return new Set(normalize(value).split(" ").filter((token) => token.length > 2));
}

function scoreAlias(message: string, alias: string) {
  const normalizedMessage = normalize(message);
  const normalizedAlias = normalize(alias);
  if (!normalizedAlias) return 0;
  if (normalizedMessage === normalizedAlias) return 1;
  if (normalizedMessage.includes(normalizedAlias)) return 0.95;
  if (normalizedAlias.includes(normalizedMessage) && normalizedMessage.length >= 8) return 0.9;

  const messageTokens = tokens(normalizedMessage);
  const aliasTokens = tokens(normalizedAlias);
  if (!messageTokens.size || !aliasTokens.size) return 0;

  let overlap = 0;
  for (const token of aliasTokens) {
    if (messageTokens.has(token)) overlap += 1;
  }

  return overlap / aliasTokens.size;
}

function workflowScore(message: string, workflow: AssistantWorkflowDefinition) {
  return Math.max(
    scoreAlias(message, workflow.title),
    ...workflow.aliases.map((alias) => scoreAlias(message, alias)),
  );
}

export function getMissingWorkflowRequirements(
  workflow: AssistantWorkflowDefinition,
  role: Role,
  permissions: RolePermissions,
) {
  const missing: string[] = [];

  for (const page of workflow.requiredPages) {
    if (!canRoleAccessPage(role, page, permissions)) missing.push(`page:${page}`);
  }

  for (const capability of workflow.requiredCapabilities) {
    if (!canRolePerformAction(role, capability.resource, capability.action, permissions)) {
      missing.push(`resource:${capability.resource}.${capability.action}`);
    }
  }

  return missing;
}

export function isWorkflowPermitted(
  workflow: AssistantWorkflowDefinition,
  role: Role,
  permissions: RolePermissions,
) {
  return getMissingWorkflowRequirements(workflow, role, permissions).length === 0;
}

export function getPermittedWorkflows(role: Role, permissions: RolePermissions) {
  return FAQ_WORKFLOWS.filter((workflow) => isWorkflowPermitted(workflow, role, permissions));
}

export function matchAssistantWorkflow(input: MatchInput): WorkflowMatchResult {
  const scored = FAQ_WORKFLOWS
    .map((workflow) => ({ workflow, confidence: workflowScore(input.message, workflow) }))
    .filter((candidate) => candidate.confidence >= 0.55)
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  if (!best) return { kind: "none" };

  const nearBest = scored.filter((candidate) => best.confidence - candidate.confidence <= 0.06);
  const permittedNearBest = nearBest.filter((candidate) =>
    isWorkflowPermitted(candidate.workflow, input.role, input.permissions)
  );

  if (permittedNearBest.length > 1) {
    return {
      kind: "ambiguous",
      candidates: permittedNearBest.map((candidate) => candidate.workflow),
      confidence: permittedNearBest[0].confidence,
    };
  }

  if (permittedNearBest.length === 1) {
    return {
      kind: "matched",
      workflow: permittedNearBest[0].workflow,
      confidence: permittedNearBest[0].confidence,
    };
  }

  return {
    kind: "denied",
    workflow: best.workflow,
    confidence: best.confidence,
    missingRequirements: getMissingWorkflowRequirements(best.workflow, input.role, input.permissions),
  };
}

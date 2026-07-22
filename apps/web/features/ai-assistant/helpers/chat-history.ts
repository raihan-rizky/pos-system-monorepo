import type { AssistantGeneratedFile, AssistantWorkflowPayload, Message } from "../types/assistant";

export const ASSISTANT_HISTORY_SCHEMA_VERSION = "v2";
export const ASSISTANT_HISTORY_TTL_MS = 12 * 60 * 60 * 1000;

type HistoryKeyInput = {
  userId?: string | null;
  role?: string | null;
  storeId?: string | null;
  authorizationFingerprint?: string | null;
};

type AssistantHistoryRecord = {
  timestamp: number;
  messages: Message[];
};

function safePart(value: string | null | undefined) {
  return encodeURIComponent(value || "unknown");
}

export function buildAssistantHistoryKey(input: HistoryKeyInput) {
  return [
    "ai_assistant_history",
    ASSISTANT_HISTORY_SCHEMA_VERSION,
    safePart(input.userId),
    safePart(input.role),
    safePart(input.storeId),
    safePart(input.authorizationFingerprint),
  ].join("_");
}

function isWorkflowPayload(value: unknown): value is AssistantWorkflowPayload {
  if (!value || typeof value !== "object") return false;
  const workflow = value as AssistantWorkflowPayload;
  return typeof workflow.id === "string"
    && typeof workflow.title === "string"
    && typeof workflow.sourceRef === "string"
    && Array.isArray(workflow.steps)
    && workflow.steps.every((step) =>
      step
      && typeof step.id === "string"
      && typeof step.title === "string"
      && typeof step.description === "string"
      && (step.route === undefined || typeof step.route === "string")
      && (step.actionLabel === undefined || typeof step.actionLabel === "string")
      && (step.iconKey === undefined || typeof step.iconKey === "string")
    );
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const message = value as Message;
  if (message.role !== "user" && message.role !== "assistant") return false;
  if (typeof message.content !== "string") return false;
  if (message.workflow !== undefined && !isWorkflowPayload(message.workflow)) return false;
  if (message.followUps !== undefined && !Array.isArray(message.followUps)) return false;
  if (message.generatedFile !== undefined && !isGeneratedFile(message.generatedFile)) return false;
  return true;
}

function isGeneratedFile(value: unknown): value is AssistantGeneratedFile {
  if (!value || typeof value !== "object") return false;
  const file = value as AssistantGeneratedFile;
  const action = file.action;
  return typeof file.name === "string"
    && typeof file.label === "string"
    && (file.format === "pdf" || file.format === "xlsx")
    && Array.isArray(file.advice)
    && file.advice.every((item) => typeof item === "string")
    && !!action
    && (action.kind === "export_financial_report" || action.kind === "export_customer_recap")
    && ["daily", "weekly", "monthly", "30d"].includes(action.period)
    && action.format === file.format;
}

export function sanitizeAssistantHistoryRecord(
  value: unknown,
  now = Date.now(),
): AssistantHistoryRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as AssistantHistoryRecord;
  if (typeof record.timestamp !== "number") return null;
  if (now - record.timestamp > ASSISTANT_HISTORY_TTL_MS) return null;
  if (!Array.isArray(record.messages)) return null;
  if (!record.messages.every(isMessage)) return null;

  return {
    timestamp: record.timestamp,
    messages: record.messages,
  };
}

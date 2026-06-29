import type { StructuredAssistantAnswer } from "../services/assistant-structured-output";
import { getWorkflowPayload, type AssistantWorkflowDefinition } from "./workflow-catalog";

const DEFAULT_WORKFLOW_CLARIFICATION = "Maaf, Pak Tel belum yakin panduan mana yang kamu maksud. Sebutkan menu atau tujuan langkahnya ya.";

export function renderWorkflowAnswer(
  workflow: AssistantWorkflowDefinition,
  generatedAt = new Date().toISOString(),
): StructuredAssistantAnswer {
  return {
    responseKind: "workflow",
    answerMarkdown: `Siap, Sobat! Ini alur panduan untuk **${workflow.title}**. Pak Tel cuma bantu arahkan dan navigasi ya. Untuk pengisian form dan simpan data, tetap kamu sendiri yang konfirmasi.`,
    dataStatus: "help_docs",
    sourceLabel: "FAQ Operasional",
    sourceRefs: [workflow.sourceRef],
    generatedAt,
    followUps: [],
    workflow: getWorkflowPayload(workflow),
  };
}

export function renderWorkflowAccessDeniedAnswer(
  workflow: AssistantWorkflowDefinition,
  generatedAt = new Date().toISOString(),
): StructuredAssistantAnswer {
  return {
    responseKind: "text",
    answerMarkdown: `Maaf, akses role kamu belum cukup untuk membuka alur **${workflow.title}**. Hubungi OWNER atau admin toko kalau akses ini memang diperlukan.`,
    dataStatus: "error",
    sourceLabel: "RBAC",
    sourceRefs: [workflow.sourceRef],
    generatedAt,
    followUps: [],
  };
}

export function renderWorkflowClarificationAnswer(
  question = DEFAULT_WORKFLOW_CLARIFICATION,
  generatedAt = new Date().toISOString(),
): StructuredAssistantAnswer {
  const safeQuestion = question.trim().slice(0, 180) || DEFAULT_WORKFLOW_CLARIFICATION;

  return {
    responseKind: "text",
    answerMarkdown: safeQuestion,
    dataStatus: "help_docs",
    sourceLabel: "FAQ Operasional",
    generatedAt,
    followUps: [],
  };
}

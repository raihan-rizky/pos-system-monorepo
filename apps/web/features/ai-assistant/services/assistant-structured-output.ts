import { z } from "zod";

export const structuredAssistantAnswerSchema = z.object({
  answerMarkdown: z.string().min(1),
  dataStatus: z.enum(["live_data", "help_docs", "no_data", "error", "no_tool_used"]),
  sourceLabel: z.string().min(1),
  sourceRefs: z.array(z.string()).optional(),
  generatedAt: z.string().min(1),
  followUps: z.array(z.string().min(1).max(120)).max(3).default([]),
}).strict();

export type StructuredAssistantAnswer = z.infer<typeof structuredAssistantAnswerSchema>;

export const structuredAssistantAnswerJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answerMarkdown", "dataStatus", "sourceLabel", "generatedAt", "followUps"],
  properties: {
    answerMarkdown: {
      type: "string",
      minLength: 1,
      description: "Markdown answer shown to the user. Must not invent data.",
    },
    dataStatus: {
      type: "string",
      enum: ["live_data", "help_docs", "no_data", "error", "no_tool_used"],
      description: "How the answer was grounded.",
    },
    sourceLabel: {
      type: "string",
      minLength: 1,
      description: "Human-readable source label.",
    },
    sourceRefs: {
      type: "array",
      items: { type: "string" },
      description: "Optional source references from help docs or tool output.",
    },
    generatedAt: {
      type: "string",
      minLength: 1,
      description: "ISO timestamp or tool generatedAt value.",
    },
    followUps: {
      type: "array",
      maxItems: 3,
      items: { type: "string", minLength: 1, maxLength: 120 },
      description: "Zero to three short follow-up suggestions.",
    },
  },
} as const;

export function sanitizeMarkdownLists(text: string): string {
  if (!text) return text;
  
  let formatted = text;
  
  // 1. Match inline bullet lists starting with asterisk: "text * Item" -> "text\n* Item"
  formatted = formatted.replace(/([^\n])\s+\*\s+/g, "$1\n* ");

  // 2. Match inline numbered lists: "text 1. Item" -> "text\n1. Item"
  formatted = formatted.replace(/([^\n])\s+(\d+\.\s+)/g, "$1\n$2");

  // 3. Match colons immediately followed by list items without newline: "text: * Item" -> "text:\n* Item"
  formatted = formatted.replace(/:\s+(\*\s+|\d+\.\s+)/g, ":\n$1");

  return formatted;
}

export function parseStructuredAnswer(content: string) {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.answerMarkdown === "string") {
      parsed.answerMarkdown = sanitizeMarkdownLists(parsed.answerMarkdown);
    }
    return structuredAssistantAnswerSchema.safeParse(parsed);
  } catch {
    return structuredAssistantAnswerSchema.safeParse(null);
  }
}

export function buildSafeAnswer(input: {
  answerMarkdown: string;
  dataStatus?: StructuredAssistantAnswer["dataStatus"];
  sourceLabel?: string;
  sourceRefs?: string[];
  generatedAt?: string;
  followUps?: string[];
}): StructuredAssistantAnswer {
  return {
    answerMarkdown: input.answerMarkdown,
    dataStatus: input.dataStatus ?? "error",
    sourceLabel: input.sourceLabel ?? "Pak Teladan",
    sourceRefs: input.sourceRefs,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    followUps: input.followUps ?? [],
  };
}

export function buildFinalAnswerInstruction() {
  return `Return exactly one JSON object that matches this schema:
{
  "answerMarkdown": "string",
  "dataStatus": "live_data | help_docs | no_data | error | no_tool_used",
  "sourceLabel": "string",
  "sourceRefs": ["string"],
  "generatedAt": "string",
  "followUps": ["string"]
}

Rules:
- Do not wrap the JSON in markdown fences.
- Use answerMarkdown for the complete user-facing answer in Indonesian.
- ALWAYS format lists, bullet points, or multiple items in answerMarkdown using proper Markdown lists with separate lines. Use the newline character to separate each item so it looks like:
* Item 1
* Item 2
* Item 3
Do NOT write lists, bullet points, or numbered items inline in a single line.
- Use followUps for 0-3 short suggestions only.
- If TOOL_OUTPUT is a valid empty result, clearly say no matching data was found and use dataStatus "no_data".
- Reserve dataStatus "error" for failures; never describe a valid empty result as a tool failure.
- If TOOL_OUTPUT is present, answer only from TOOL_OUTPUT.`;
}

export function buildStructuredRepairInstruction(validationError: string) {
  return `Your previous response did not match the required JSON schema.
Validation error: ${validationError}

Re-emit exactly one valid JSON object. Do not include markdown fences or explanation.`;
}

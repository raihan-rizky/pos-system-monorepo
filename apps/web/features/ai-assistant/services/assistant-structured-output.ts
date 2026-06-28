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
  return `## TASK
Compose one JSON object as the final answer to the user. Do NOT wrap it in markdown fences or add any text before/after.

## OUTPUT SCHEMA
{
  "answerMarkdown": string,       // full user-facing answer in Indonesian
  "dataStatus": enum,             // see DATASTATUS RULES below
  "sourceLabel": string,          // human-readable source (e.g. "Alat stok rendah", "Dokumentasi bantuan")
  "sourceRefs": string[],         // optional — doc filenames or tool IDs; omit if empty
  "generatedAt": string,          // ISO timestamp from TOOL_OUTPUT.generatedAt, or now()
  "followUps": string[]           // 0–3 follow-up suggestions; see FOLLOWUP RULES below
}

## DATASTATUS RULES (pick exactly one)
- "live_data"     → TOOL_OUTPUT is present and contains real store data
- "help_docs"     → TOOL_OUTPUT is present and contains documentation markdown
- "no_data"       → TOOL_OUTPUT is a valid empty result (empty items array, null match)
- "error"         → tool failed, was blocked by RBAC, or structured output could not be generated
- "no_tool_used"  → answered from model knowledge without any tool (greetings, how-to without tool, etc.)

## GROUNDING RULES
- If TOOL_OUTPUT is present: base answerMarkdown ONLY on TOOL_OUTPUT. Do NOT add facts, names, numbers, or prices not in TOOL_OUTPUT.
- If TOOL_OUTPUT is absent: answer from identity/capability knowledge only. Do NOT invent store data.
- Empty result (zero items / null match) is NOT an error — use "no_data" and state clearly nothing was found.

## FORMATTING RULES
- Answer in Indonesian. Match the informal/friendly tone of Pak Teladan.
- Do NOT use # or ## headings. Use ### or **bold** at most.
- Format every list as separate Markdown lines, never inline. Example:
  * Item A
  * Item B
- For numbers/prices/stock: use Markdown table or bullet list, not paragraphs.
- Keep answers concise — this is a small chat widget.

## FOLLOWUP RULES
- 0 follow-ups for error, RBAC, or out-of-scope answers.
- 1–3 follow-ups for data answers. Each must be a natural next question the user would actually ask, under 80 characters, in Indonesian.
- Do NOT repeat what was just answered. Do NOT write meta-questions like "Mau tahu lebih lanjut?".`;
}

export function buildStructuredRepairInstruction(validationError: string) {
  return `## REPAIR REQUIRED
Your previous response failed JSON schema validation.

Error: ${validationError}

Fix the specific field that caused the error and re-emit exactly one valid JSON object. No markdown fences, no explanation — only the JSON.`;
}

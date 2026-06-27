export type UserRole = 'OWNER' | 'ADMIN' | 'INVENTORY' | 'CASHIER' | 'SALES';

export interface AssistantMessageMetadata {
  sourceLabel: string;
  generatedAt: string;
  sourceRefs?: string[];
}

export type AssistantActionLogStatus = "active" | "done" | "failed";

export interface AssistantActionLogEntry {
  id: string;
  label: string;
  status: AssistantActionLogStatus;
  occurredAt: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  metadata?: AssistantMessageMetadata;
  actionLog?: AssistantActionLogEntry[];
}

export interface PageContext {
  page: string;
  productId?: string;
  customerId?: string;
  supplierId?: string;
}

export interface ChatRequest {
  messages: Message[];
  pageContext?: PageContext;
}

export interface ChatResponse {
  message: Message;
  error?: string;
}

export interface StructuredAssistantAnswer {
  answerMarkdown: string;
  dataStatus: "live_data" | "help_docs" | "no_data" | "error" | "no_tool_used";
  sourceLabel: string;
  sourceRefs?: string[];
  generatedAt: string;
  followUps: string[];
}

export type AssistantStreamFrame =
  | { type: "progress"; status: "planning" | "tool_selected" | "tool_running" | "tool_retrying" | "answer_generating"; occurredAt: string; toolName?: string }
  | { type: "final"; answer: StructuredAssistantAnswer }
  | { message?: Message; metadata?: AssistantMessageMetadata };

export interface ToolResult {
  error?: string;
  error_code?: string;
  data?: unknown;
}

export type UserRole = 'OWNER' | 'ADMIN' | 'INVENTORY' | 'CASHIER' | 'SALES';

export interface AssistantMessageMetadata {
  sourceLabel: string;
  generatedAt: string;
  sourceRefs?: string[];
}

export interface AssistantWorkflowStepPayload {
  id: string;
  title: string;
  description: string;
  route?: string;
  actionLabel?: string;
  iconKey?: string;
}

export interface AssistantWorkflowPayload {
  id: string;
  title: string;
  route?: string;
  actionLabel?: string;
  sourceRef: string;
  steps: AssistantWorkflowStepPayload[];
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
  followUps?: string[];
  workflow?: AssistantWorkflowPayload;
  generatedFile?: AssistantGeneratedFile;
}

export interface PageContext {
  page: string;
  productId?: string;
  customerId?: string;
  supplierId?: string;
}

export type AssistantReportPeriod = "daily" | "weekly" | "monthly" | "30d";
export type AssistantExportFormat = "pdf" | "xlsx";
export type AssistantModalId =
  | "product-create"
  | "customer-create"
  | "supplier-create"
  | "salesperson-create"
  | "expense-create"
  | "shift-open"
  | "inventory-stock-single"
  | "inventory-inbound";

export type AssistantClientAction =
  | {
      kind: "open_modal";
      modal: AssistantModalId;
      route: string;
    }
  | {
      kind: "export_financial_report";
      period: AssistantReportPeriod;
      format: AssistantExportFormat;
    }
  | {
      kind: "export_customer_recap";
      period: AssistantReportPeriod;
      format: AssistantExportFormat;
    };

export interface AssistantGeneratedFile {
  name: string;
  format: AssistantExportFormat;
  label: string;
  action: Extract<AssistantClientAction, { kind: "export_financial_report" | "export_customer_recap" }>;
  advice: string[];
  downloaded?: boolean;
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
  responseKind?: "text" | "workflow";
  answerMarkdown: string;
  dataStatus: "live_data" | "help_docs" | "no_data" | "error" | "no_tool_used";
  sourceLabel: string;
  sourceRefs?: string[];
  generatedAt: string;
  followUps: string[];
  workflow?: AssistantWorkflowPayload;
}

export type AssistantStreamFrame =
  | { type: "progress"; status: "planning" | "tool_selected" | "tool_running" | "tool_retrying" | "answer_generating"; occurredAt: string; toolName?: string }
  | { type: "client_action"; action: AssistantClientAction; occurredAt: string }
  | { type: "final"; answer: StructuredAssistantAnswer }
  | { message?: Message; metadata?: AssistantMessageMetadata };

export interface ToolResult {
  error?: string;
  error_code?: string;
  data?: unknown;
}

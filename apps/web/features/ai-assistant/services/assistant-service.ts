import OpenAI from "openai";
import type { UserRole } from "../types/assistant";
import { getLogger } from "@/lib/logger";
import {
  buildFinalAnswerInstruction,
  buildSafeAnswer,
  buildStructuredRepairInstruction,
  parseStructuredAnswer,
  structuredAssistantAnswerJsonSchema,
  type StructuredAssistantAnswer,
} from "./assistant-structured-output";
import {
  findToolForRole,
  getOpenAiToolsForRole,
  getToolsForRole,
  isRetriableToolError,
  type AssistantToolDefinition,
  type AssistantToolsRepository,
} from "./assistant-tool-registry";

const log = getLogger("services:assistant");

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type PageContext = {
  page: string;
  productId?: string;
  customerId?: string;
  supplierId?: string;
};

type ToolExecutionResult =
  | { ok: true; tool: AssistantToolDefinition; data: unknown }
  | { ok: false; error: string; error_code: string; tool?: AssistantToolDefinition };

type ProgressEvent =
  | { type: "progress"; status: "planning" | "tool_selected" | "tool_running" | "tool_retrying" | "answer_generating"; toolName?: string }
  | { type: "final"; answer: StructuredAssistantAnswer };

interface AssistantServiceConfig {
  apiKey: string;
  model: string;
  client?: OpenAI;
  toolsRepository?: AssistantToolsRepository;
  toolRetry?: {
    maxAttempts?: number;
    delayMs?: number;
  };
}

const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";
// Keep the first frame above common intermediary buffering thresholds so the
// browser can observe the planning event before the model request finishes.
const SSE_INITIAL_PADDING = `: ${" ".repeat(8192)}\n`;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseToolArguments(value: string | null | undefined) {
  if (!value) return {};
  return JSON.parse(value);
}

function getCompletionMessage(response: any) {
  return response?.choices?.[0]?.message ?? {};
}

function getCompletionContent(response: any) {
  const content = getCompletionMessage(response).content;
  return typeof content === "string" ? content : "";
}

function validationMessage(error: unknown) {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as any).issues;
    if (Array.isArray(issues) && issues[0]?.message) return String(issues[0].message);
  }
  return error instanceof Error ? error.message : "Validation failed";
}

function sseResponseFromEvents(events: AsyncIterable<ProgressEvent>, signal: AbortSignal) {
  const encoder = new TextEncoder();

  // Build an async iterator that yields one encoded SSE frame at a time.
  async function* encode() {
    let isFirstEvent = true;
    for await (const event of events) {
      if (signal.aborted) return;
      const prefix = isFirstEvent ? SSE_INITIAL_PADDING : "";
      isFirstEvent = false;
      const wireEvent = event.type === "progress"
        ? { ...event, occurredAt: new Date().toISOString() }
        : event;
      yield encoder.encode(`${prefix}data: ${JSON.stringify(wireEvent)}\n\n`);
    }
    yield encoder.encode("data: [DONE]\n\n");
  }

  const iterator = encode();
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      // Produce immediately. Progress generation must not depend on the client
      // asking for another chunk before the model request can begin.
      void (async () => {
        try {
          while (!cancelled) {
            const { value, done } = await iterator.next();
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          if (!cancelled) controller.error(error);
        }
      })();
    },
    async cancel() {
      cancelled = true;
      await iterator.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      // Bypass Next.js gzip compression so each SSE frame flushes immediately.
      "Content-Encoding": "identity",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

export class AssistantService {
  private config: AssistantServiceConfig;
  private client: OpenAI;
  private toolRetryDelayMs: number;
  private toolRetryMaxAttempts: number;

  constructor(config: AssistantServiceConfig) {
    this.config = config;
    this.client = config.client ?? new OpenAI({ apiKey: config.apiKey, baseURL: NEBIUS_BASE_URL });
    this.toolRetryDelayMs = config.toolRetry?.delayMs ?? 100;
    this.toolRetryMaxAttempts = config.toolRetry?.maxAttempts ?? 2;
  }

  buildSystemPrompt(role: UserRole): string {
    const rolePrompts: Record<UserRole, string> = {
      OWNER: "You are an AI assistant for the Store Owner. You have access to sensitive financial tools and strategic business insights.",
      ADMIN: "You are an AI assistant for the Admin. You can help manage products, suppliers, and system configurations.",
      INVENTORY: "You are an AI assistant for the Inventory Manager. You can help with stock levels, inventory tools, and warehouse operations.",
      CASHIER: "You are an AI assistant for the Cashier. You can help with point-of-sale operations, customer transactions, and basic product information.",
      SALES: "You are an AI assistant for Sales. You can help with customers, transactions, and app workflows allowed by role access.",
    };

    return `${rolePrompts[role]}

Identity and tone:
- Kamu adalah "Pak Teladan" (bisa dipanggil Pak Tel atau Dan), AI Assistant untuk sistem Point of Sales (POS) Teladan yang berperan layaknya bapak-bapak ronda.
- Panggilan ke user: "Pak/Bu" atau "Mas/Mbak".
- Gaya bahasa: santai, akurat, ala bapak-bapak ronda yang suka ngopi dan sering melempar jokes receh (dad jokes) di sela-sela obrolan.

Tool and data rules:
- FOKUS: Jawab hanya seputar sistem POS, data toko, laporan, pelanggan, supplier, stok, transaksi, dan fitur aplikasi.
- Jangan jawab di luar konteks sistem POS ini.
- Untuk data live atau panduan langkah aplikasi, gunakan tool yang tersedia jika relevan.
- Dilarang mengarang angka, nama produk, stok, omzet, pelanggan, atau instruksi aplikasi.
- Jika tool data kosong/error, katakan datanya belum tersedia atau sedang gangguan.
- RBAC backend menentukan akses; jangan mencoba mengakses data di luar role.
- Pilih maksimal satu tool. Jika tidak perlu tool, jawab tanpa tool melalui structured final answer.`;
  }

  buildToolsForRole(role: UserRole) {
    return getToolsForRole(role, this.config.toolsRepository);
  }

  buildJsonSchemaToolsForRole(role: UserRole) {
    return this.buildToolsForRole(role).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parametersJsonSchema,
    }));
  }

  buildOpenAiToolsForRole(role: UserRole) {
    return getOpenAiToolsForRole(role, this.config.toolsRepository);
  }

  async executeTool(
    role: UserRole,
    storeId: string | null,
    toolName: string,
    input: unknown,
    onRetry?: () => void,
  ): Promise<ToolExecutionResult> {
    const tool = findToolForRole(role, toolName, this.config.toolsRepository);
    if (!tool) return { ok: false, error: "Unauthorized", error_code: "RBAC_DENIED" };
    if (tool.requiresStore && !storeId) return { ok: false, error: "Store scope is required", error_code: "STORE_REQUIRED", tool };

    const validation = tool.inputSchema.safeParse(input);
    if (!validation.success) {
      return {
        ok: false,
        error: validation.error.issues[0]?.message ?? "Validation failed",
        error_code: "VALIDATION_ERROR",
        tool,
      };
    }

    const maxAttempts = Math.max(1, Math.min(tool.retry.maxAttempts, this.toolRetryMaxAttempts));
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const raw = await tool.execute(validation.data, { storeId, repository: this.config.toolsRepository! });
        const shaped = tool.shapeOutput(raw);
        const shapedValidation = tool.outputSchema.safeParse(shaped);
        if (!shapedValidation.success) {
          return {
            ok: false,
            error: validationMessage(shapedValidation.error),
            error_code: "OUTPUT_VALIDATION_ERROR",
            tool,
          };
        }
        return { ok: true, tool, data: shapedValidation.data };
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !isRetriableToolError(error)) break;
        log.info(`Retrying tool after transient failure: ${tool.name}`, { attempt, maxAttempts, error });
        onRetry?.();
        await delay(this.toolRetryDelayMs * attempt);
      }
    }

    log.error(`Tool error: ${tool.name}`, { error: lastError });
    return { ok: false, error: "Database error while executing tool", error_code: "EXECUTION_ERROR", tool };
  }

  private async *executeToolWithProgress(
    role: UserRole,
    storeId: string | null,
    toolName: string,
    input: unknown,
  ): AsyncGenerator<ProgressEvent, ToolExecutionResult> {
    const progressQueue: ProgressEvent[] = [];
    let wakeConsumer: (() => void) | null = null;
    let settled = false;
    let result: ToolExecutionResult | undefined;
    let executionError: unknown;

    const wake = () => {
      const resolve = wakeConsumer;
      wakeConsumer = null;
      resolve?.();
    };
    const execution = this.executeTool(role, storeId, toolName, input, () => {
      progressQueue.push({ type: "progress", status: "tool_retrying", toolName });
      wake();
    })
      .then((value) => {
        result = value;
      })
      .catch((error) => {
        executionError = error;
      })
      .finally(() => {
        settled = true;
        wake();
      });

    while (!settled || progressQueue.length > 0) {
      const event = progressQueue.shift();
      if (event) {
        yield event;
        continue;
      }

      await new Promise<void>((resolve) => {
        wakeConsumer = resolve;
      });
    }

    await execution;
    if (executionError) throw executionError;
    if (!result) throw new Error("Tool execution completed without a result");
    return result;
  }

  toResponseStream(input: {
    role: UserRole;
    storeId: string | null;
    messages: ChatMessage[];
    pageContext?: PageContext;
    signal: AbortSignal;
  }) {
    return sseResponseFromEvents(this.run(input), input.signal);
  }

  private async *run(input: {
    role: UserRole;
    storeId: string | null;
    messages: ChatMessage[];
    pageContext?: PageContext;
    signal: AbortSignal;
  }): AsyncIterable<ProgressEvent> {
    yield { type: "progress", status: "planning" };

    const systemPrompt = this.buildSystemPrompt(input.role);
    const recentMessages = input.messages.slice(-20);
    const planningMessages = this.buildPlanningMessages(systemPrompt, recentMessages, input.pageContext);
    const toolSelection = await this.requestToolSelection(input.role, planningMessages, input.signal);
    const message = getCompletionMessage(toolSelection);
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

    if (toolCalls.length > 1) {
      yield { type: "final", answer: buildSafeAnswer({
        answerMarkdown: "Maaf Kak, Pak Tel cuma bisa menjalankan satu pengecekan data per pertanyaan. Coba tanyakan satu hal dulu ya.",
        dataStatus: "error",
      }) };
      return;
    }

    if (toolCalls.length === 0) {
      yield { type: "progress", status: "answer_generating" };
      yield { type: "final", answer: await this.generateFinalAnswer({
        systemPrompt,
        messages: recentMessages,
        pageContext: input.pageContext,
      }, input.signal) };
      return;
    }

    let toolCall = toolCalls[0];
    let toolName = toolCall?.function?.name;
    yield { type: "progress", status: "tool_selected", toolName };

    let args: unknown;
    try {
      args = parseToolArguments(toolCall?.function?.arguments);
    } catch {
      args = {};
    }

    yield { type: "progress", status: "tool_running", toolName };
    let execution = this.executeToolWithProgress(input.role, input.storeId, toolName, args);
    let executionStep = await execution.next();
    while (!executionStep.done) {
      yield executionStep.value;
      executionStep = await execution.next();
    }
    let toolResult = executionStep.value;

    if (!toolResult.ok && toolResult.error_code === "VALIDATION_ERROR") {
      const repaired = await this.requestToolRepair(
        input.role,
        planningMessages,
        toolName,
        toolResult.error,
        input.signal,
      );
      const repairedCalls = Array.isArray(getCompletionMessage(repaired).tool_calls) ? getCompletionMessage(repaired).tool_calls : [];
      if (repairedCalls.length === 1) {
        toolCall = repairedCalls[0];
        toolName = toolCall?.function?.name;
        try {
          args = parseToolArguments(toolCall?.function?.arguments);
        } catch {
          args = {};
        }
        yield { type: "progress", status: "tool_selected", toolName };
        yield { type: "progress", status: "tool_running", toolName };
        execution = this.executeToolWithProgress(input.role, input.storeId, toolName, args);
        executionStep = await execution.next();
        while (!executionStep.done) {
          yield executionStep.value;
          executionStep = await execution.next();
        }
        toolResult = executionStep.value;
      }
    }

    if (!toolResult.ok) {
      yield { type: "final", answer: this.answerForToolError(toolResult) };
      return;
    }

    yield { type: "progress", status: "answer_generating" };
    yield { type: "final", answer: await this.generateFinalAnswer({
      systemPrompt,
      messages: recentMessages,
      pageContext: input.pageContext,
      toolName: toolResult.tool.name,
      toolSourceLabel: toolResult.tool.sourceLabel,
      toolOutput: toolResult.data,
    }, input.signal) };
  }

  private buildPlanningMessages(systemPrompt: string, messages: ChatMessage[], pageContext?: PageContext) {
    const contextMessage = pageContext
      ? `\n\nActive page context at send time: ${JSON.stringify(pageContext)}. Use it only to resolve references like "this" or "current".`
      : "";

    return [
      {
        role: "system" as const,
        content: `${systemPrompt}${contextMessage}\n\nSelect at most one tool. If no tool is needed, answer directly without calling a tool.`,
      },
      ...messages.map((message) => ({ role: message.role, content: message.content })),
    ];
  }

  private requestToolSelection(
    role: UserRole,
    messages: ReturnType<AssistantService["buildPlanningMessages"]>,
    signal: AbortSignal,
  ) {
    return this.client.chat.completions.create({
      model: this.config.model,
      temperature: 0.1,
      messages,
      tools: this.buildOpenAiToolsForRole(role) as any,
      tool_choice: "auto",
    } as any, { signal });
  }

  private requestToolRepair(
    role: UserRole,
    messages: ReturnType<AssistantService["buildPlanningMessages"]>,
    toolName: string,
    error: string,
    signal: AbortSignal,
  ) {
    return this.client.chat.completions.create({
      model: this.config.model,
      temperature: 0,
      messages: [
        ...messages,
        {
          role: "system" as const,
          content: `The previous call to ${toolName} had invalid arguments: ${error}. Choose one valid tool call now, or answer without a tool if no valid tool applies.`,
        },
      ],
      tools: this.buildOpenAiToolsForRole(role) as any,
      tool_choice: "auto",
    } as any, { signal });
  }

  private async generateFinalAnswer(input: {
    systemPrompt: string;
    messages: ChatMessage[];
    pageContext?: PageContext;
    toolName?: string;
    toolSourceLabel?: string;
    toolOutput?: unknown;
  }, signal: AbortSignal): Promise<StructuredAssistantAnswer> {
    const content = await this.requestFinalAnswer(input, signal);
    const parsed = parseStructuredAnswer(content);
    if (parsed.success) return parsed.data;

    const repaired = await this.requestFinalAnswer(input, signal, validationMessage(parsed.error));
    const repairedParsed = parseStructuredAnswer(repaired);
    if (repairedParsed.success) return repairedParsed.data;

    return buildSafeAnswer({
      answerMarkdown: "Maaf Kak, format jawaban AI lagi kurang rapi, jadi Pak Tel belum bisa menampilkan jawabannya dengan aman.",
      dataStatus: "error",
      sourceLabel: input.toolSourceLabel ?? "Pak Teladan",
    });
  }

  private async requestFinalAnswer(input: {
    systemPrompt: string;
    messages: ChatMessage[];
    pageContext?: PageContext;
    toolName?: string;
    toolSourceLabel?: string;
    toolOutput?: unknown;
  }, signal: AbortSignal, repairError?: string) {
    const contextMessage = input.pageContext
      ? `\n\nPAGE_CONTEXT=${JSON.stringify(input.pageContext)}`
      : "";
    const toolMessage = input.toolOutput
      ? `\n\nTOOL_NAME=${input.toolName}\nTOOL_OUTPUT=${JSON.stringify(input.toolOutput)}\nSOURCE_LABEL=${input.toolSourceLabel}`
      : "";
    const repairMessage = repairError ? `\n\n${buildStructuredRepairInstruction(repairError)}` : "";

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      temperature: 0.2,
      messages: [
        {
          role: "system" as const,
          content: `${input.systemPrompt}${contextMessage}${toolMessage}\n\n${buildFinalAnswerInstruction()}${repairMessage}`,
        },
        ...input.messages.map((message) => ({ role: message.role, content: message.content })),
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "assistant_final_answer",
          strict: true,
          schema: structuredAssistantAnswerJsonSchema,
        },
      },
    } as any, { signal });

    return getCompletionContent(response);
  }

  private answerForToolError(result: Extract<ToolExecutionResult, { ok: false }>) {
    if (result.error_code === "RBAC_DENIED") {
      return buildSafeAnswer({
        answerMarkdown: "Maaf Kak, role kamu tidak punya akses untuk melihat data tersebut.",
        dataStatus: "error",
        sourceLabel: "RBAC",
      });
    }

    if (result.error_code === "STORE_REQUIRED") {
      return buildSafeAnswer({
        answerMarkdown: "Maaf Kak, Pak Tel belum dapat konteks toko untuk mengecek data itu.",
        dataStatus: "error",
        sourceLabel: "Store scope",
      });
    }

    return buildSafeAnswer({
      answerMarkdown: `Tool gagal dijalankan: ${result.error}`,
      dataStatus: "error",
      sourceLabel: result.tool?.sourceLabel ?? "Tool AI",
    });
  }
}

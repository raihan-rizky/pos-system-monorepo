import OpenAI from "openai";
import type { UserRole } from "../types/assistant";
import { buildDefaultRolePermissions, type RolePermissions } from "@/features/rbac/helpers/rbac-core";
import { getLogger, type Logger } from "@/lib/logger";
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
import {
  getFastPathIntentName,
  routeAssistantIntent,
  type AssistantIntent,
  type FastPathIntentName,
} from "./assistant-intent-router";
import {
  getPermittedWorkflows,
  matchAssistantWorkflow,
} from "../workflows/assistant-workflow-matcher";
import type { AssistantWorkflowDefinition } from "../workflows/workflow-catalog";
import {
  renderWorkflowAccessDeniedAnswer,
  renderWorkflowAnswer,
  renderWorkflowClarificationAnswer,
} from "../workflows/assistant-response-renderers";

const log = getLogger("services:assistant");
let activeAssistantRequests = 0;
let assistantRequestOrdinal = 0;

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
  | { type: "final"; answer: StructuredAssistantAnswer }
  | { message: { role: "assistant"; content: string } };

interface AssistantServiceConfig {
  apiKey: string;
  model: string;
  client?: OpenAI;
  toolsRepository?: AssistantToolsRepository;
  fastPathIntents?: ReadonlySet<FastPathIntentName>;
  rolePermissions?: RolePermissions;
  now?: () => Date;
  toolRetry?: {
    maxAttempts?: number;
    delayMs?: number;
  };
  assistantDeadlineMs?: number;
}

type AssistantRequestTelemetry = {
  requestId?: string;
  requestStartedAt?: number;
  authDurationMs?: number;
  bodyParseDurationMs?: number;
  validationDurationMs?: number;
  requestBytes?: number;
};

type ModelStage = "planning" | "tool_repair" | "final" | "final_repair";
type TrackModelCall = <T>(stage: ModelStage, call: () => Promise<T>) => Promise<T>;

type WorkflowSelectionResult =
  | { action: "select_workflow"; workflowId: string }
  | { action: "clarify"; question: string };

type RunMetrics = {
  routeKind: "model_fallback" | "static_fast_path" | "tool_fast_path" | "workflow_fast_path" | "workflow_model_selection";
  intent: string;
  outcome: "success" | "error" | "cancelled";
  shadowAgreement: "tool_match" | "tool_mismatch" | "not_comparable" | "no_candidate";
  modelCalls: number;
  toolCalls: number;
  planningModelMs: number;
  toolRepairModelMs: number;
  finalModelMs: number;
  finalRepairModelMs: number;
  toolDurationMs: number;
  routingDurationMs: number;
  responseCharacters: number;
  answerDataStatus: StructuredAssistantAnswer["dataStatus"] | "none";
  failureCategory: "none" | "rbac" | "store_scope" | "validation" | "tool" | "multiple_tools" | "structured_output" | "provider";
};

function toolFailureCategory(errorCode: string): RunMetrics["failureCategory"] {
  if (errorCode === "RBAC_DENIED") return "rbac";
  if (errorCode === "STORE_REQUIRED") return "store_scope";
  if (errorCode === "VALIDATION_ERROR") return "validation";
  return "tool";
}

const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";
// Keep the first frame above common intermediary buffering thresholds so the
// browser can observe the planning event before the model request finishes.
const SSE_INITIAL_PADDING = `: ${" ".repeat(8192)}\n`;
const DEFAULT_WORKFLOW_CLARIFICATION = "Maaf, Pak Tel belum yakin panduan mana yang kamu maksud. Sebutkan menu atau tujuan langkahnya ya.";
const DEFAULT_ASSISTANT_DEADLINE_MS = 8_000;

const assistantWorkflowSelectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "workflowId", "question"],
  properties: {
    action: {
      type: "string",
      enum: ["select_workflow", "clarify"],
      description: "Select a permitted workflow ID, or ask a short clarification question.",
    },
    workflowId: {
      type: "string",
      description: "Permitted workflow ID when action is select_workflow. Empty string when action is clarify.",
    },
    question: {
      type: "string",
      description: "Indonesian clarification question when action is clarify. Empty string when selecting a workflow.",
    },
  },
} as const;

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

function isWorkflowHelpRequest(message: string) {
  const text = message.toLowerCase();
  if (!text.trim()) return false;
  if (/\b(?:dan|serta|sekaligus|kemudian|lalu|plus)\b/.test(text) || (text.match(/\?/g)?.length ?? 0) > 1) {
    return false;
  }

  const helpIntent = /\b(?:cara|bagaimana|bantuan|help|panduan|langkah|tutorial|pakai|memakai|menggunakan|gunakan|buka|menu|fitur|alur|proses)\b/.test(text);
  const posDomain = /\b(?:pos|produk|barang|stok|stock|inventory|inventori|inventaris|gudang|transaksi|kasir|pelanggan|customer|supplier|keuangan|laporan|settings|pengaturan|akses|role|produksi|sales|shift|riwayat|surat jalan|nota|invoice|aplikasi|sistem|toko)\b/.test(text);

  return helpIntent && posDomain;
}

function workflowSelectionPromptItems(workflows: AssistantWorkflowDefinition[]) {
  return workflows.map((workflow) => ({
    id: workflow.id,
    title: workflow.title,
    aliases: workflow.aliases,
    route: workflow.route,
    actionLabel: workflow.actionLabel,
  }));
}

function parseWorkflowSelection(content: string): WorkflowSelectionResult | null {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") return null;

    if (parsed.action === "select_workflow" && typeof parsed.workflowId === "string" && parsed.workflowId.trim()) {
      return { action: "select_workflow", workflowId: parsed.workflowId.trim() };
    }

    if (parsed.action === "clarify" && typeof parsed.question === "string" && parsed.question.trim()) {
      return { action: "clarify", question: parsed.question.trim().slice(0, 180) };
    }
  } catch {
    return null;
  }

  return null;
}

function validationMessage(error: unknown) {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as any).issues;
    if (Array.isArray(issues) && issues[0]?.message) return String(issues[0].message);
  }
  return error instanceof Error ? error.message : "Validation failed";
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

function getParsedAnswerMarkdownSoFar(accumulated: string): { content: string; isComplete: boolean } {
  const startIndex = accumulated.indexOf('"answerMarkdown"');
  if (startIndex === -1) return { content: "", isComplete: false };

  const firstColon = accumulated.indexOf(':', startIndex + 16);
  if (firstColon === -1) return { content: "", isComplete: false };
  const openQuoteIndex = accumulated.indexOf('"', firstColon);
  if (openQuoteIndex === -1) return { content: "", isComplete: false };

  let content = "";
  let isEscaped = false;
  let isComplete = false;

  for (let i = openQuoteIndex + 1; i < accumulated.length; i++) {
    const char = accumulated[i];
    if (isEscaped) {
      if (char === 'n') content += '\n';
      else if (char === 't') content += '\t';
      else if (char === 'r') content += '\r';
      else if (char === 'b') content += '\b';
      else if (char === 'f') content += '\f';
      else if (char === 'u') {
        if (i + 4 < accumulated.length) {
          const code = accumulated.slice(i + 1, i + 5);
          content += String.fromCharCode(parseInt(code, 16));
          i += 4;
        } else {
          break;
        }
      } else {
        content += char;
      }
      isEscaped = false;
    } else if (char === '\\') {
      if (i === accumulated.length - 1) {
        break;
      }
      isEscaped = true;
    } else if (char === '"') {
      isComplete = true;
      break;
    } else {
      content += char;
    }
  }

  return { content, isComplete };
}

function sseResponseFromEvents(
  events: AsyncIterable<ProgressEvent>,
  signal: AbortSignal,
  requestId?: string,
  lifecycle?: { cancel?: () => void; finalize?: () => void },
) {
  const encoder = new TextEncoder();

  // Build an async iterator that yields one encoded SSE frame at a time.
  async function* encode() {
    let isFirstEvent = true;
    for await (const event of events) {
      if (signal.aborted) {
        log.info("assistant.stream.aborted", { requestId });
        return;
      }
      const prefix = isFirstEvent ? SSE_INITIAL_PADDING : "";
      if (isFirstEvent) {
        const eventType = "type" in event ? event.type : undefined;
        const progressStatus = "type" in event && event.type === "progress" ? event.status : undefined;
        log.info("assistant.stream.first_frame", {
          requestId,
          eventType,
          progressStatus,
        });
      }
      isFirstEvent = false;
      const wireEvent = "type" in event && event.type === "progress"
        ? { ...event, occurredAt: new Date().toISOString() }
        : event;
      yield encoder.encode(`${prefix}data: ${JSON.stringify(wireEvent)}\n\n`);
    }
    log.info("assistant.stream.completed", { requestId });
    yield encoder.encode("data: [DONE]\n\n");
  }

  const iterator = encode();
  let cancelled = false;
  let pendingRead: Promise<IteratorResult<Uint8Array>> | undefined;

  const readNext = () => {
    const read = pendingRead ?? iterator.next();
    pendingRead = undefined;
    return read;
  };

  const prefetchNext = () => {
    if (cancelled || pendingRead) return;
    pendingRead = iterator.next();
    // The next pull observes the original rejection. This handler prevents an
    // unhandled rejection while the prefetched provider chunk is waiting.
    void pendingRead.catch(() => undefined);
  };

  const stream = new ReadableStream({
    start(controller) {
      log.info("assistant.stream.started", { requestId });
    },
    async pull(controller) {
      if (cancelled) return;
      try {
        const { value, done } = await readNext();
        if (done) {
          lifecycle?.finalize?.();
          controller.close();
          return;
        }
        controller.enqueue(value);
        prefetchNext();
      } catch (error) {
        if (!cancelled) {
          log.error("assistant.stream.failed", { requestId, errorName: errorName(error) });
          controller.error(error);
        }
        lifecycle?.finalize?.();
      }
    },
    async cancel() {
      cancelled = true;
      log.info("assistant.stream.cancelled", { requestId });
      lifecycle?.cancel?.();
      try {
        await iterator.return?.(undefined);
      } finally {
        lifecycle?.finalize?.();
      }
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store, no-transform",
    // Bypass Next.js gzip compression so each SSE frame flushes immediately.
    "Content-Encoding": "identity",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  };
  if (requestId) headers["X-Request-Id"] = requestId;

  return new Response(stream, {
    headers,
  });
}

export class AssistantService {
  private config: AssistantServiceConfig;
  private client: OpenAI | undefined;
  private toolRetryDelayMs: number;
  private toolRetryMaxAttempts: number;

  constructor(config: AssistantServiceConfig) {
    this.config = config;
    this.client = config.client;
    this.toolRetryDelayMs = config.toolRetry?.delayMs ?? 100;
    this.toolRetryMaxAttempts = config.toolRetry?.maxAttempts ?? 2;
  }

  private getClient() {
    this.client ??= new OpenAI({ apiKey: this.config.apiKey, baseURL: NEBIUS_BASE_URL });
    return this.client;
  }

  buildSystemPrompt(role: UserRole): string {
    const roleContext: Record<UserRole, string> = {
      OWNER: "Kamu melayani **Pemilik Toko**. Akses penuh: keuangan, laporan, stok, pelanggan, supplier, pengaturan toko, dan semua data operasional.",
      ADMIN: "Kamu melayani **Admin**. Akses: produk, supplier, stok, laporan penjualan, pelanggan, dan konfigurasi sistem. Tidak ada akses ke data keuangan sensitif.",
      INVENTORY: "Kamu melayani **Manajer Inventori**. Akses: stok, produk, gudang, opname, dan laporan inventori. Tidak ada akses ke data penjualan atau keuangan.",
      CASHIER: "Kamu melayani **Kasir**. Akses: informasi produk, transaksi aktif, dan stok dasar. Tidak ada akses ke laporan keuangan atau data pelanggan lengkap.",
      SALES: "Kamu melayani **Sales**. Akses: data pelanggan, transaksi, dan fitur aplikasi sesuai role. Tidak ada akses ke laporan keuangan.",
    };

    return `## IDENTITAS
Kamu adalah **Pak Teladan** (panggil: Pak Tel atau Dan) — AI Assistant untuk sistem POS Teladan. Gayamu seperti bapak-bapak ronda: santai, akrab, suka jokes receh (dad jokes) yang bervariasi (jangan mengulang lelucon/dad jokes yang sama dalam obrolan), tapi tetap akurat dan profesional. Sapa user dengan panggilan universal dan akrab seperti "Sobat" atau "Bos" (hindari sapaan yang spesifik gender).

### Contoh Gaya Bicara & Dad Jokes:
- **Menyambut**: "Halo Bos! Ada yang bisa dibantu? Tenang, Pak Tel siap nemenin sambil mantau transaksi toko biar aman terkendali."
- **Menjawab data kosong**: "Stoknya kosong melompong nih Sobat, mirip dompet Pak Tel pas akhir bulan. Hehehe. Mau dicarikan barang alternatif lain?"
- **Menyajikan data**: "Ini daftarnya ya Bos. Kalo ada yang kurang jelas, tanya aja, asal jangan tanya kapan nikah, ya."
- **Membantu kesalahan input**: "Waduh, tanggalnya kayaknya agak keliru nih Sobat. Coba diinput lagi tanggal yang bener, jangan sampai ingatan masa lalu aja yang diingat terus."
- **Dad Joke Ringan**: "Sambil nunggu datanya keluar, Bos tahu nggak kenapa semen itu keras? Karena kalau lembek, namanya bubur ayam! Hahaha. Oke, ini dia datanya..."

## ROLE AKTIF
${roleContext[role]}

## ATURAN UTAMA
1. **Cakupan**: Hanya jawab tentang sistem POS, data toko, stok, transaksi, pelanggan, supplier, dan fitur aplikasi. Tolak pertanyaan di luar cakupan ini.
2. **Grounding**: Jangan pernah mengarang angka, nama produk, stok, omzet, nama pelanggan, atau instruksi aplikasi. Jika data tidak ada di TOOL_OUTPUT, jangan sebut.
3. **Tool**: Gunakan maksimal satu tool per pertanyaan. Pilih tool yang paling tepat. Jika tidak butuh data live, jawab langsung tanpa tool.
4. **RBAC**: Backend sudah mengatur akses. Jangan coba akses data di luar role aktif.
5. **Hasil kosong**: Hasil tool kosong (stok 0, daftar kosong) bukan error — sampaikan datanya kosong dengan jelas.

## FORMAT JAWABAN
- Jangan gunakan heading \`#\` atau \`##\`. Maksimal \`###\` atau **bold** untuk sub-judul.
- Jawaban tampil di chat widget kecil — tulis ringkas, mudah di-scan.
- List selalu di baris terpisah (bukan inline). Angka/data: tabel singkat atau bullet list.`;
  }

  buildToolsForRole(role: UserRole, permissions = this.config.rolePermissions) {
    return getToolsForRole(role, this.config.toolsRepository, permissions);
  }

  buildJsonSchemaToolsForRole(role: UserRole, permissions = this.config.rolePermissions) {
    return this.buildToolsForRole(role, permissions).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parametersJsonSchema,
    }));
  }

  buildOpenAiToolsForRole(role: UserRole, permissions = this.config.rolePermissions) {
    return getOpenAiToolsForRole(role, this.config.toolsRepository, permissions);
  }

  async executeTool(
    role: UserRole,
    storeId: string | null,
    toolName: string,
    input: unknown,
    onRetry?: () => void,
    requestId?: string,
    permissions = this.config.rolePermissions,
  ): Promise<ToolExecutionResult> {
    const tool = findToolForRole(role, toolName, this.config.toolsRepository, permissions);
    const toolLog = log.child({ requestId, role, toolName: tool?.name ?? "unknown" });
    toolLog.info("assistant.tool.requested");
    if (!tool) {
      toolLog.info("assistant.tool.rejected", { reason: "rbac_denied" });
      return { ok: false, error: "Unauthorized", error_code: "RBAC_DENIED" };
    }
    if (tool.requiresStore && !storeId) {
      toolLog.info("assistant.tool.rejected", { reason: "store_required" });
      return { ok: false, error: "Store scope is required", error_code: "STORE_REQUIRED", tool };
    }

    const validation = tool.inputSchema.safeParse(input);
    if (!validation.success) {
      toolLog.info("assistant.tool.rejected", {
        reason: "input_validation",
        issueCount: validation.error.issues.length,
      });
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
      const attemptStartedAt = Date.now();
      toolLog.info("assistant.tool.attempt.started", { attempt, maxAttempts });
      try {
        const raw = await tool.execute(validation.data, { storeId, repository: this.config.toolsRepository! });
        const shaped = tool.shapeOutput(raw);
        const shapedValidation = tool.outputSchema.safeParse(shaped);
        if (!shapedValidation.success) {
          toolLog.warn("assistant.tool.output_validation.failed", {
            attempt,
            durationMs: Date.now() - attemptStartedAt,
            issueCount: shapedValidation.error.issues.length,
          });
          return {
            ok: false,
            error: validationMessage(shapedValidation.error),
            error_code: "OUTPUT_VALIDATION_ERROR",
            tool,
          };
        }
        toolLog.info("assistant.tool.attempt.completed", {
          attempt,
          durationMs: Date.now() - attemptStartedAt,
        });
        return { ok: true, tool, data: shapedValidation.data };
      } catch (error) {
        lastError = error;
        const retriable = isRetriableToolError(error);
        toolLog.warn("assistant.tool.attempt.failed", {
          attempt,
          maxAttempts,
          durationMs: Date.now() - attemptStartedAt,
          errorName: errorName(error),
          retriable,
        });
        if (attempt >= maxAttempts || !retriable) break;
        const retryDelayMs = this.toolRetryDelayMs * attempt;
        toolLog.info("assistant.tool.retry.scheduled", { attempt, maxAttempts, retryDelayMs });
        onRetry?.();
        await delay(retryDelayMs);
      }
    }

    toolLog.error("assistant.tool.failed", { errorName: errorName(lastError) });
    return { ok: false, error: "Database error while executing tool", error_code: "EXECUTION_ERROR", tool };
  }

  private async *executeToolWithProgress(
    role: UserRole,
    storeId: string | null,
    toolName: string,
    input: unknown,
    requestId?: string,
    permissions = this.config.rolePermissions,
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
    }, requestId, permissions)
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
    rolePermissions?: RolePermissions;
    telemetry?: AssistantRequestTelemetry;
  }) {
    const streamController = new AbortController();
    const operationController = new AbortController();
    let deadlineExceeded = false;
    const forwardRequestAbort = () => {
      operationController.abort(input.signal.reason);
      streamController.abort(input.signal.reason);
    };
    if (input.signal.aborted) {
      forwardRequestAbort();
    } else {
      input.signal.addEventListener("abort", forwardRequestAbort, { once: true });
    }
    const deadlineMs = this.config.assistantDeadlineMs ?? DEFAULT_ASSISTANT_DEADLINE_MS;
    const deadlineTimer = setTimeout(() => {
      deadlineExceeded = true;
      operationController.abort(new DOMException("Assistant request deadline exceeded", "TimeoutError"));
    }, deadlineMs);
    const finalize = () => {
      clearTimeout(deadlineTimer);
      input.signal.removeEventListener("abort", forwardRequestAbort);
    };
    const streamInput = {
      ...input,
      signal: operationController.signal,
      deadlineExceeded: () => deadlineExceeded,
    };
    return sseResponseFromEvents(
      this.run(streamInput),
      streamController.signal,
      input.telemetry?.requestId,
      {
        cancel: () => {
          operationController.abort();
          streamController.abort();
        },
        finalize: () => {
          operationController.abort();
          finalize();
        },
      },
    );
  }

  private async *run(input: {
    role: UserRole;
    storeId: string | null;
    messages: ChatMessage[];
    pageContext?: PageContext;
    signal: AbortSignal;
    rolePermissions?: RolePermissions;
    telemetry?: AssistantRequestTelemetry;
    deadlineExceeded?: () => boolean;
  }): AsyncIterable<ProgressEvent> {
    const requestStartedAt = input.telemetry?.requestStartedAt ?? Date.now();
    const concurrencyAtStart = ++activeAssistantRequests;
    const requestOrdinal = ++assistantRequestOrdinal;
    const requestLog = log.child({
      requestId: input.telemetry?.requestId,
      role: input.role,
    });
    const recentMessages = input.messages.slice(-20);
    const latestUserMessage = [...recentMessages].reverse().find((item) => item.role === "user")?.content ?? "";
    const rolePermissions = input.rolePermissions ?? this.config.rolePermissions ?? buildDefaultRolePermissions();
    const workflowMatch = matchAssistantWorkflow({
      message: latestUserMessage,
      role: input.role,
      permissions: rolePermissions,
    });
    requestLog.info("assistant.request.started", {
      messageCount: recentMessages.length,
      contextCharacters: recentMessages.reduce((total, message) => total + message.content.length, 0),
      concurrencyAtStart,
      instanceState: requestOrdinal === 1 ? "cold_candidate" : "warm",
    });
    const routingStartedAt = Date.now();
    const candidate = routeAssistantIntent(latestUserMessage, this.config.now?.() ?? new Date());
    const candidateName = getFastPathIntentName(candidate);
    const workflowIntent = workflowMatch.kind === "matched" || workflowMatch.kind === "denied"
      ? workflowMatch.workflow.id
      : workflowMatch.kind === "ambiguous"
        ? "workflow_ambiguous"
        : null;
    const metrics: RunMetrics = {
      routeKind: "model_fallback",
      intent: workflowIntent ?? candidateName ?? candidate.kind,
      outcome: "error",
      shadowAgreement: candidateName ? "not_comparable" : "no_candidate",
      modelCalls: 0,
      toolCalls: 0,
      planningModelMs: 0,
      toolRepairModelMs: 0,
      finalModelMs: 0,
      finalRepairModelMs: 0,
      toolDurationMs: 0,
      routingDurationMs: Date.now() - routingStartedAt,
      responseCharacters: 0,
      answerDataStatus: "none",
      failureCategory: "none",
    };
    requestLog.info("assistant.routing.completed", {
      intent: metrics.intent,
      candidateKind: candidate.kind,
      workflowMatchKind: workflowMatch.kind,
      durationMs: metrics.routingDurationMs,
    });
    const trackModelCall: TrackModelCall = async (stage, call) => {
      metrics.modelCalls += 1;
      const callNumber = metrics.modelCalls;
      const startedAt = Date.now();
      requestLog.info("assistant.model.started", { stage, callNumber, model: this.config.model });
      try {
        const result = await call();
        requestLog.info("assistant.model.completed", {
          stage,
          callNumber,
          durationMs: Date.now() - startedAt,
        });
        return result;
      } catch (error) {
        requestLog.error("assistant.model.failed", {
          stage,
          callNumber,
          durationMs: Date.now() - startedAt,
          errorName: errorName(error),
        });
        throw error;
      } finally {
        const duration = Date.now() - startedAt;
        if (stage === "planning") metrics.planningModelMs += duration;
        if (stage === "tool_repair") metrics.toolRepairModelMs += duration;
        if (stage === "final") metrics.finalModelMs += duration;
        if (stage === "final_repair") metrics.finalRepairModelMs += duration;
      }
    };
    const finalEvent = (answer: StructuredAssistantAnswer): Extract<ProgressEvent, { type: "final" }> => {
      metrics.responseCharacters = answer.answerMarkdown.length;
      metrics.answerDataStatus = answer.dataStatus;
      if (answer.dataStatus === "error" && metrics.failureCategory === "none") {
        metrics.failureCategory = "structured_output";
      }
      requestLog.info("assistant.answer.ready", {
        dataStatus: answer.dataStatus,
        responseCharacters: metrics.responseCharacters,
        followUpCount: answer.followUps.length,
      });
      return { type: "final", answer };
    };
    const progressEvent = (
      status: Extract<ProgressEvent, { type: "progress" }>["status"],
      toolName?: string,
    ): Extract<ProgressEvent, { type: "progress" }> => {
      const safeToolName = toolName
        ? findToolForRole(input.role, toolName, this.config.toolsRepository, rolePermissions)?.name ?? "unknown"
        : undefined;
      requestLog.info("assistant.stream.progress", { status, toolName: safeToolName });
      return { type: "progress", status, toolName };
    };
    const forwardedProgressEvent = (event: ProgressEvent) => {
      if ("type" in event && event.type === "progress") {
        const safeToolName = event.toolName
          ? findToolForRole(input.role, event.toolName, this.config.toolsRepository, rolePermissions)?.name ?? "unknown"
          : undefined;
        requestLog.info("assistant.stream.progress", { status: event.status, toolName: safeToolName });
      }
      return event;
    };
    let firstFrameReadyAt = requestStartedAt;

    try {
      firstFrameReadyAt = Date.now();
      yield progressEvent("planning");
      const fastPathEnabled = candidateName !== null && this.config.fastPathIntents?.has(candidateName) === true;
      requestLog.info("assistant.path.evaluated", {
        intent: metrics.intent,
        fastPathEnabled,
      });

      if (workflowMatch.kind === "matched") {
        metrics.routeKind = "workflow_fast_path";
        requestLog.info("assistant.path.selected", {
          routeKind: metrics.routeKind,
          workflowId: workflowMatch.workflow.id,
        });
        metrics.outcome = "success";
        yield finalEvent(renderWorkflowAnswer(
          workflowMatch.workflow,
          (this.config.now?.() ?? new Date()).toISOString(),
        ));
        return;
      }

      if (workflowMatch.kind === "denied") {
        metrics.routeKind = "workflow_fast_path";
        metrics.failureCategory = "rbac";
        requestLog.info("assistant.path.selected", {
          routeKind: metrics.routeKind,
          workflowId: workflowMatch.workflow.id,
          reason: "workflow_rbac_denied",
        });
        metrics.outcome = "success";
        yield finalEvent(renderWorkflowAccessDeniedAnswer(
          workflowMatch.workflow,
          (this.config.now?.() ?? new Date()).toISOString(),
        ));
        return;
      }

      const workflowSelectionCandidates = workflowMatch.kind === "ambiguous"
        ? workflowMatch.candidates
        : workflowMatch.kind === "none" && isWorkflowHelpRequest(latestUserMessage)
          ? getPermittedWorkflows(input.role, rolePermissions)
          : [];
      if (workflowSelectionCandidates.length > 0) {
        metrics.routeKind = "workflow_model_selection";
        requestLog.info("assistant.path.selected", {
          routeKind: metrics.routeKind,
          candidateCount: workflowSelectionCandidates.length,
          workflowMatchKind: workflowMatch.kind,
        });

        const selectionResponse = await trackModelCall("planning", () => this.requestWorkflowSelection({
          latestUserMessage,
          pageContext: input.pageContext,
          workflows: workflowSelectionCandidates,
          signal: input.signal,
        }));
        const selection = parseWorkflowSelection(getCompletionContent(selectionResponse));
        const selectedWorkflow = selection?.action === "select_workflow"
          ? workflowSelectionCandidates.find((workflow) => workflow.id === selection.workflowId)
          : undefined;

        if (selectedWorkflow) {
          metrics.intent = selectedWorkflow.id;
          metrics.outcome = "success";
          requestLog.info("assistant.workflow.selection.completed", {
            outcome: "selected",
            workflowId: selectedWorkflow.id,
          });
          yield finalEvent(renderWorkflowAnswer(
            selectedWorkflow,
            (this.config.now?.() ?? new Date()).toISOString(),
          ));
          return;
        }

        const clarificationQuestion = selection?.action === "clarify"
          ? selection.question
          : DEFAULT_WORKFLOW_CLARIFICATION;
        requestLog.info("assistant.workflow.selection.completed", {
          outcome: selection?.action === "select_workflow" ? "invalid_selection" : "clarify",
          selectedWorkflowId: selection?.action === "select_workflow" ? selection.workflowId : undefined,
        });
        metrics.outcome = "success";
        yield finalEvent(renderWorkflowClarificationAnswer(
          clarificationQuestion,
          (this.config.now?.() ?? new Date()).toISOString(),
        ));
        return;
      }

      if (fastPathEnabled && (
        candidate.kind === "social_static"
        || candidate.kind === "out_of_scope"
        || candidate.kind === "unsupported_data"
      )) {
        metrics.routeKind = "static_fast_path";
        requestLog.info("assistant.path.selected", { routeKind: metrics.routeKind, intent: metrics.intent });
        metrics.outcome = "success";
        yield finalEvent(this.answerForStaticIntent(candidate));
        return;
      }

      const systemPrompt = this.buildSystemPrompt(input.role);
      const planningMessages = this.buildPlanningMessages(systemPrompt, recentMessages, input.pageContext);

      if (fastPathEnabled && candidate.kind === "tool") {
        metrics.routeKind = "tool_fast_path";
        requestLog.info("assistant.path.selected", { routeKind: metrics.routeKind, intent: metrics.intent });
        requestLog.info("assistant.tool.selected", { toolName: candidate.toolName, selectionSource: "deterministic" });
        yield progressEvent("tool_selected", candidate.toolName);
        yield progressEvent("tool_running", candidate.toolName);
        metrics.toolCalls += 1;
        const toolStartedAt = Date.now();
        const directExecution = this.executeToolWithProgress(
          input.role,
          input.storeId,
          candidate.toolName,
          candidate.input,
          input.telemetry?.requestId,
          rolePermissions,
        );
        let directStep = await directExecution.next();
        while (!directStep.done) {
          yield forwardedProgressEvent(directStep.value);
          directStep = await directExecution.next();
        }
        metrics.toolDurationMs += Date.now() - toolStartedAt;
        const directResult = directStep.value;

        // A deterministic route must never guess invalid arguments. Fall back
        // to model selection if its schema contract is unexpectedly violated.
        if (directResult.ok) {
          requestLog.info("assistant.tool.completed", { toolName: candidate.toolName, durationMs: metrics.toolDurationMs });
          yield* this.yieldFinalAnswer({
            systemPrompt,
            messages: recentMessages,
            pageContext: input.pageContext,
            toolName: directResult.tool.name,
            toolSourceLabel: directResult.tool.sourceLabel,
            toolOutput: directResult.data,
          }, input.signal, trackModelCall, requestLog, progressEvent, finalEvent);
          metrics.outcome = "success";
          return;
        }
        if (directResult.error_code !== "VALIDATION_ERROR") {
          requestLog.info("assistant.tool.completed", {
            toolName: candidate.toolName,
            durationMs: metrics.toolDurationMs,
            outcome: toolFailureCategory(directResult.error_code),
          });
          metrics.failureCategory = toolFailureCategory(directResult.error_code);
          yield finalEvent(this.answerForToolError(directResult));
          metrics.outcome = "success";
          return;
        }
        metrics.routeKind = "model_fallback";
        requestLog.info("assistant.path.fallback", { reason: "deterministic_validation" });
      }

      requestLog.info("assistant.path.selected", { routeKind: "model_fallback", intent: metrics.intent });

      const toolSelection = await trackModelCall(
        "planning",
        () => this.requestToolSelection(input.role, planningMessages, input.signal, rolePermissions),
      );
      const message = getCompletionMessage(toolSelection);
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (candidate.kind === "tool") {
        metrics.shadowAgreement = toolCalls.length === 1 && toolCalls[0]?.function?.name === candidate.toolName
          ? "tool_match"
          : "tool_mismatch";
      }
      requestLog.info("assistant.planning.completed", {
        toolCallCount: toolCalls.length,
        shadowAgreement: metrics.shadowAgreement,
      });

      if (toolCalls.length > 1) {
        metrics.failureCategory = "multiple_tools";
        requestLog.warn("assistant.planning.rejected", { reason: "multiple_tools", toolCallCount: toolCalls.length });
        yield finalEvent(buildSafeAnswer({
          answerMarkdown: "Maaf Kak, Pak Tel cuma bisa menjalankan satu pengecekan data per pertanyaan. Coba tanyakan satu hal dulu ya.",
          dataStatus: "error",
        }));
        metrics.outcome = "success";
        return;
      }

      if (toolCalls.length === 0) {
        yield* this.yieldFinalAnswer({
          systemPrompt,
          messages: recentMessages,
          pageContext: input.pageContext,
        }, input.signal, trackModelCall, requestLog, progressEvent, finalEvent);
        metrics.outcome = "success";
        return;
      }

      let toolCall = toolCalls[0];
      let toolName = toolCall?.function?.name;
      requestLog.info("assistant.tool.selected", {
        toolName: findToolForRole(input.role, toolName, this.config.toolsRepository, rolePermissions)?.name ?? "unknown",
        selectionSource: "model",
      });
      yield progressEvent("tool_selected", toolName);

      let args: unknown;
      try {
        args = parseToolArguments(toolCall?.function?.arguments);
      } catch {
        requestLog.warn("assistant.tool.arguments.invalid", {
          toolName: findToolForRole(input.role, toolName, this.config.toolsRepository, rolePermissions)?.name ?? "unknown",
          selectionSource: "model",
        });
        args = {};
      }

      yield progressEvent("tool_running", toolName);
      metrics.toolCalls += 1;
      let toolStartedAt = Date.now();
      let execution = this.executeToolWithProgress(
        input.role,
        input.storeId,
        toolName,
        args,
        input.telemetry?.requestId,
        rolePermissions,
      );
      let executionStep = await execution.next();
      while (!executionStep.done) {
        yield forwardedProgressEvent(executionStep.value);
        executionStep = await execution.next();
      }
      metrics.toolDurationMs += Date.now() - toolStartedAt;
      let toolResult = executionStep.value;
      requestLog.info("assistant.tool.completed", {
        toolName: findToolForRole(input.role, toolName, this.config.toolsRepository, rolePermissions)?.name ?? "unknown",
        durationMs: Date.now() - toolStartedAt,
        outcome: toolResult.ok ? "success" : toolFailureCategory(toolResult.error_code),
      });

      if (!toolResult.ok && toolResult.error_code === "VALIDATION_ERROR") {
        const validationError = toolResult.error;
        const repaired = await trackModelCall("tool_repair", () => this.requestToolRepair(
          input.role,
          planningMessages,
          toolName,
          validationError,
          input.signal,
          rolePermissions,
        ));
        const repairedCalls = Array.isArray(getCompletionMessage(repaired).tool_calls) ? getCompletionMessage(repaired).tool_calls : [];
        requestLog.info("assistant.tool.repair.completed", { toolCallCount: repairedCalls.length });
        if (repairedCalls.length === 1) {
          toolCall = repairedCalls[0];
          toolName = toolCall?.function?.name;
          try {
            args = parseToolArguments(toolCall?.function?.arguments);
          } catch {
            requestLog.warn("assistant.tool.arguments.invalid", {
              toolName: findToolForRole(input.role, toolName, this.config.toolsRepository, rolePermissions)?.name ?? "unknown",
              selectionSource: "repair",
            });
            args = {};
          }
          requestLog.info("assistant.tool.selected", {
            toolName: findToolForRole(input.role, toolName, this.config.toolsRepository, rolePermissions)?.name ?? "unknown",
            selectionSource: "repair",
          });
          yield progressEvent("tool_selected", toolName);
          yield progressEvent("tool_running", toolName);
          metrics.toolCalls += 1;
          toolStartedAt = Date.now();
          execution = this.executeToolWithProgress(
            input.role,
            input.storeId,
            toolName,
            args,
            input.telemetry?.requestId,
            rolePermissions,
          );
          executionStep = await execution.next();
          while (!executionStep.done) {
            yield forwardedProgressEvent(executionStep.value);
            executionStep = await execution.next();
          }
          metrics.toolDurationMs += Date.now() - toolStartedAt;
          toolResult = executionStep.value;
          requestLog.info("assistant.tool.completed", {
            toolName: findToolForRole(input.role, toolName, this.config.toolsRepository, rolePermissions)?.name ?? "unknown",
            durationMs: Date.now() - toolStartedAt,
            outcome: toolResult.ok ? "success" : toolFailureCategory(toolResult.error_code),
            repaired: true,
          });
        }
      }

      if (!toolResult.ok) {
        metrics.failureCategory = toolFailureCategory(toolResult.error_code);
        yield finalEvent(this.answerForToolError(toolResult));
        metrics.outcome = "success";
        return;
      }

      yield* this.yieldFinalAnswer({
        systemPrompt,
        messages: recentMessages,
        pageContext: input.pageContext,
        toolName: toolResult.tool.name,
        toolSourceLabel: toolResult.tool.sourceLabel,
        toolOutput: toolResult.data,
      }, input.signal, trackModelCall, requestLog, progressEvent, finalEvent);
      metrics.outcome = "success";
    } catch (error) {
      metrics.outcome = input.signal.aborted ? "cancelled" : "error";
      if (input.deadlineExceeded?.()) {
        metrics.outcome = "success";
        metrics.failureCategory = "provider";
        requestLog.warn("assistant.request.deadline_exceeded", {
          totalDurationMs: Date.now() - requestStartedAt,
        });
        yield finalEvent(buildSafeAnswer({
          answerMarkdown: "Maaf Kak, jawaban AI melewati batas waktu aman. Silakan coba lagi dengan pertanyaan yang lebih spesifik.",
          dataStatus: "error",
          sourceLabel: "Timeout AI",
        }));
        return;
      }
      if (!input.signal.aborted && metrics.failureCategory === "none") metrics.failureCategory = "provider";
      requestLog.error("assistant.request.failed", {
        outcome: metrics.outcome,
        failureCategory: metrics.failureCategory,
        errorName: errorName(error),
      });
      throw error;
    } finally {
      if (input.signal.aborted) {
        metrics.outcome = "cancelled";
        requestLog.info("assistant.request.cancelled");
      }
      const summary = {
        requestId: input.telemetry?.requestId,
        role: input.role,
        routeKind: metrics.routeKind,
        intent: metrics.intent,
        outcome: metrics.outcome,
        answerDataStatus: metrics.answerDataStatus,
        failureCategory: metrics.failureCategory,
        shadowAgreement: metrics.shadowAgreement,
        messageCount: recentMessages.length,
        contextCharacters: recentMessages.reduce((total, message) => total + message.content.length, 0),
        responseCharacters: metrics.responseCharacters,
        concurrencyAtStart,
        instanceState: requestOrdinal === 1 ? "cold_candidate" : "warm",
        requestBytes: input.telemetry?.requestBytes,
        authDurationMs: input.telemetry?.authDurationMs,
        bodyParseDurationMs: input.telemetry?.bodyParseDurationMs,
        validationDurationMs: input.telemetry?.validationDurationMs,
        firstFrameReadyMs: firstFrameReadyAt - requestStartedAt,
        routingDurationMs: metrics.routingDurationMs,
        modelCalls: metrics.modelCalls,
        toolCalls: metrics.toolCalls,
        planningModelMs: metrics.planningModelMs,
        toolRepairModelMs: metrics.toolRepairModelMs,
        finalModelMs: metrics.finalModelMs,
        finalRepairModelMs: metrics.finalRepairModelMs,
        toolDurationMs: metrics.toolDurationMs,
        totalDurationMs: Date.now() - requestStartedAt,
      };
      activeAssistantRequests = Math.max(0, activeAssistantRequests - 1);
      queueMicrotask(() => requestLog.info("assistant.request.completed", summary));
    }
  }

  private answerForStaticIntent(
    intent: Extract<AssistantIntent, { kind: "social_static" | "unsupported_data" | "out_of_scope" }>,
  ) {
    if (intent.kind === "social_static") {
      return buildSafeAnswer({ answerMarkdown: intent.reply, dataStatus: "no_tool_used" });
    }
    if (intent.kind === "unsupported_data") {
      return buildSafeAnswer({ answerMarkdown: intent.guidance, dataStatus: "no_data" });
    }
    return buildSafeAnswer({
      answerMarkdown: "Maaf, Pak Tel hanya bisa membantu pertanyaan seputar sistem POS dan data toko.",
      dataStatus: "no_tool_used",
    });
  }

  private buildPlanningMessages(systemPrompt: string, messages: ChatMessage[], pageContext?: PageContext) {
    const contextMessage = pageContext
      ? `\n\n## KONTEKS HALAMAN AKTIF\n${JSON.stringify(pageContext)}\nGunakan HANYA untuk memahami referensi seperti "ini", "produk ini", atau "pelanggan ini". Jangan buat asumsi lain dari konteks ini.`
      : "";

    return [
      {
        role: "system" as const,
        content: `${systemPrompt}${contextMessage}

## INSTRUKSI PEMILIHAN TOOL
- Pilih **maksimal satu tool** yang paling relevan dengan pertanyaan user.
- Jika tidak ada tool yang cocok, jawab langsung tanpa memanggil tool.
- Jangan memanggil tool untuk pertanyaan sapaan, pertanyaan tentang dirimu, atau pertanyaan di luar cakupan POS.
- Gunakan tool "get_system_help" jika user bertanya cara memakai fitur aplikasi.
- Jika pertanyaan ambigu (bisa cocok dengan beberapa tool), pilih tool yang paling spesifik.`,
      },
      ...messages.map((message) => ({ role: message.role, content: message.content })),
    ];
  }

  private requestWorkflowSelection(input: {
    latestUserMessage: string;
    pageContext?: PageContext;
    workflows: AssistantWorkflowDefinition[];
    signal: AbortSignal;
  }) {
    return this.getClient().chat.completions.create({
      model: this.config.model,
      temperature: 0,
      messages: [
        {
          role: "system" as const,
          content: `## TUGAS
Pilih satu panduan operasional POS dari daftar ALLOWED_WORKFLOWS, atau minta klarifikasi singkat dalam Bahasa Indonesia.

## BATASAN WAJIB
- Hanya boleh memilih workflowId yang ada di ALLOWED_WORKFLOWS.
- Jangan menulis langkah operasional, ringkasan tutorial, angka toko, atau data aplikasi.
- Jika tidak yakin, gunakan action "clarify".
- Untuk action "select_workflow", isi workflowId dan kosongkan question.
- Untuk action "clarify", kosongkan workflowId dan isi question.`,
        },
        {
          role: "user" as const,
          content: JSON.stringify({
            latestUserMessage: input.latestUserMessage,
            pageContext: input.pageContext ?? null,
            allowedWorkflows: workflowSelectionPromptItems(input.workflows),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "assistant_workflow_selection",
          strict: true,
          schema: assistantWorkflowSelectionJsonSchema,
        },
      },
    } as any, { signal: input.signal });
  }

  private requestToolSelection(
    role: UserRole,
    messages: ReturnType<AssistantService["buildPlanningMessages"]>,
    signal: AbortSignal,
    permissions?: RolePermissions,
  ) {
    return this.getClient().chat.completions.create({
      model: this.config.model,
      temperature: 0.1,
      messages,
      tools: this.buildOpenAiToolsForRole(role, permissions) as any,
      tool_choice: "auto",
    } as any, { signal });
  }

  private requestToolRepair(
    role: UserRole,
    messages: ReturnType<AssistantService["buildPlanningMessages"]>,
    toolName: string,
    error: string,
    signal: AbortSignal,
    permissions?: RolePermissions,
  ) {
    return this.getClient().chat.completions.create({
      model: this.config.model,
      temperature: 0,
      messages: [
        ...messages,
        {
          role: "system" as const,
          content: `## PERBAIKAN ARGUMEN TOOL\nPanggilan sebelumnya ke tool "${toolName}" gagal validasi:\n\nError: ${error}\n\nPilih satu tool yang valid dengan argumen yang benar, atau jawab tanpa tool jika tidak ada tool yang berlaku.`,
        },
      ],
      tools: this.buildOpenAiToolsForRole(role, permissions) as any,
      tool_choice: "auto",
    } as any, { signal });
  }

  private async *yieldFinalAnswer(
    input: {
      systemPrompt: string;
      messages: ChatMessage[];
      pageContext?: PageContext;
      toolName?: string;
      toolSourceLabel?: string;
      toolOutput?: unknown;
    },
    signal: AbortSignal,
    trackModelCall: TrackModelCall,
    requestLog: Logger,
    progressEvent: (status: any, toolName?: string) => any,
    finalEvent: (answer: any) => any
  ): AsyncGenerator<ProgressEvent, void> {
    yield progressEvent("answer_generating");
    const generator = this.generateFinalAnswer(input, signal, trackModelCall, requestLog);
    let step = await generator.next();
    while (!step.done) {
      yield step.value;
      step = await generator.next();
    }
    yield finalEvent(step.value);
  }

  private async *generateFinalAnswer(input: {
    systemPrompt: string;
    messages: ChatMessage[];
    pageContext?: PageContext;
    toolName?: string;
    toolSourceLabel?: string;
    toolOutput?: unknown;
  }, signal: AbortSignal, trackModelCall?: TrackModelCall, requestLog?: Logger): AsyncGenerator<ProgressEvent, StructuredAssistantAnswer> {
    const request = <T>(stage: ModelStage, call: () => Promise<T>) => trackModelCall
      ? trackModelCall(stage, call)
      : call();

    let accumulatedJson = "";
    let lastExtractedLength = 0;

    const runStreamCall = async () => {
      return this.requestFinalAnswerStream(input, signal);
    };

    try {
      const stream = await request("final", runStreamCall);
      if (stream && typeof stream === "object" && Symbol.asyncIterator in stream) {
        for await (const chunk of (stream as any)) {
          if (signal.aborted) break;
          const text = chunk.choices?.[0]?.delta?.content ?? "";
          accumulatedJson += text;

          const { content } = getParsedAnswerMarkdownSoFar(accumulatedJson);
          if (content.length > lastExtractedLength) {
            const delta = content.slice(lastExtractedLength);
            lastExtractedLength = content.length;
            yield { message: { role: "assistant", content: delta } };
          }
        }
      } else {
        accumulatedJson = getCompletionContent(stream);
      }
    } catch (error) {
      requestLog?.error("assistant.final_answer.stream.failed", { errorName: errorName(error) });
      throw error;
    }

    const parsed = parseStructuredAnswer(accumulatedJson);
    if (parsed.success) {
      requestLog?.info("assistant.structured_output.validated", { attempt: 1 });
      return parsed.data;
    }
    requestLog?.warn("assistant.structured_output.invalid", { attempt: 1 });

    const repaired = await request(
      "final_repair",
      () => this.requestFinalAnswer(input, signal, validationMessage(parsed.error)),
    );
    const repairedParsed = parseStructuredAnswer(repaired);
    if (repairedParsed.success) {
      requestLog?.info("assistant.structured_output.validated", { attempt: 2 });
      return repairedParsed.data;
    }
    requestLog?.warn("assistant.structured_output.invalid", { attempt: 2 });
    requestLog?.error("assistant.structured_output.fallback", { reason: "repair_exhausted" });

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

    const response = await this.getClient().chat.completions.create({
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

  private async requestFinalAnswerStream(input: {
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

    return this.getClient().chat.completions.create({
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
      stream: true,
    } as any, { signal }) as any;
  }

  private answerForToolError(result: Extract<ToolExecutionResult, { ok: false }>) {
    if (result.error_code === "RBAC_DENIED") {
      return buildSafeAnswer({
        answerMarkdown: "Maaf, role kamu tidak punya akses ke data tersebut. Hubungi admin toko jika akses ini memang diperlukan.",
        dataStatus: "error",
        sourceLabel: "RBAC",
      });
    }

    if (result.error_code === "STORE_REQUIRED") {
      return buildSafeAnswer({
        answerMarkdown: "Pak Tel belum mendapatkan konteks toko dari sesi ini. Pastikan akunmu terhubung ke toko yang benar.",
        dataStatus: "error",
        sourceLabel: "Store scope",
      });
    }

    if (result.error_code === "VALIDATION_ERROR") {
      return buildSafeAnswer({
        answerMarkdown: "Permintaan datanya belum cukup jelas untuk diperiksa. Lengkapi nama atau periode yang ingin dicek.",
        dataStatus: "error",
        sourceLabel: result.tool?.sourceLabel ?? "Validasi permintaan",
      });
    }

    return buildSafeAnswer({
      answerMarkdown: "Pengecekan data sedang mengalami gangguan sementara dan belum menghasilkan jawaban. Silakan coba lagi.",
      dataStatus: "error",
      sourceLabel: result.tool?.sourceLabel ?? "Tool AI",
    });
  }
}

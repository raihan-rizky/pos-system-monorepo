import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantService } from "../assistant-service";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const toolsRepository = {
  getLowStockItems: vi.fn(),
  getDailySalesSummary: vi.fn(),
  getSystemHelp: vi.fn(),
  getProductSearch: vi.fn(),
  getProductStock: vi.fn(),
  getProductPrice: vi.fn(),
  getCustomerSearch: vi.fn(),
  getCustomerDebtSummary: vi.fn(),
  getCustomerRecapSummary: vi.fn(),
  getSupplierSearch: vi.fn(),
  getTopProducts: vi.fn(),
  getPendingTransactions: vi.fn(),
};

const finalAnswer = (answerMarkdown = "Ini jawabannya.") => ({
  choices: [{
    message: {
      content: JSON.stringify({
        answerMarkdown,
        dataStatus: "live_data",
        sourceLabel: "Alat stok rendah",
        generatedAt: "2026-06-26T10:00:00.000Z",
        followUps: [],
      }),
    },
  }],
});

const workflowSelection = (workflowId: string) => ({
  choices: [{
    message: {
      content: JSON.stringify({
        action: "select_workflow",
        workflowId,
      }),
    },
  }],
});

const workflowClarification = (question = "Panduan mana yang ingin dibuka?") => ({
  choices: [{
    message: {
      content: JSON.stringify({
        action: "clarify",
        question,
      }),
    },
  }],
});

async function readStream(response: Response) {
  return await response.text();
}

async function readFirstStreamChunk(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response body");
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
}

describe("AssistantService", () => {
  let service: AssistantService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      toolRetry: { delayMs: 0 },
    });
  });

  it("initializes with role-aware strict scope system prompt", () => {
    const prompt = service.buildSystemPrompt("OWNER");
    expect(prompt).toContain("Pemilik Toko");
    expect(prompt).toContain("sistem POS Teladan");
    expect(prompt).toContain("Tolak pertanyaan di luar");
    expect(prompt).toContain("Pak Teladan");
    expect(prompt).toContain("Tel");
    expect(prompt).toContain("Dan");
    expect(prompt).toContain("jokes receh");
  });

  it("builds different prompts for different roles", () => {
    const ownerPrompt = service.buildSystemPrompt("OWNER");
    const cashierPrompt = service.buildSystemPrompt("CASHIER");

    expect(ownerPrompt).not.toBe(cashierPrompt);
    expect(cashierPrompt).toContain("Kasir");
    expect(ownerPrompt).toContain("Pemilik Toko");
  });

  it("enforces RBAC at tool level - CASHIER cannot access sales data", () => {
    const tools = service.buildToolsForRole("CASHIER");
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).not.toContain("get_daily_sales_summary");
  });

  it("OWNER role has access to all tools", () => {
    const tools = service.buildToolsForRole("OWNER");
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("get_daily_sales_summary");
    expect(toolNames).toContain("get_low_stock_items");
    expect(toolNames).toContain("get_system_help");
    expect(tools.find((tool) => tool.name === "get_product_stock")?.description)
      .toContain("broad low-stock lists");
  });

  it("exposes role-filtered JSON schema tool contracts", () => {
    const tools = service.buildJsonSchemaToolsForRole("INVENTORY");
    const stockTool = tools.find((tool) => tool.name === "get_product_stock");

    expect(tools.map((tool) => tool.name)).not.toContain("get_daily_sales_summary");
    expect(stockTool).toEqual(expect.objectContaining({
      description: expect.stringContaining("specific named product"),
      parameters: expect.objectContaining({
        type: "object",
        additionalProperties: false,
        required: ["query"],
      }),
    }));
  });

  it("removes tools when fresh effective RBAC resource permission is revoked", () => {
    const permissions = buildDefaultRolePermissions();
    permissions.ADMIN.resources.product.read = false;
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      rolePermissions: permissions,
    });

    const tools = service.buildToolsForRole("ADMIN");
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).not.toContain("get_product_search");
    expect(toolNames).not.toContain("get_product_stock");
    expect(toolNames).not.toContain("get_product_price");
  });

  it("INVENTORY role has access to stock tools only", () => {
    const tools = service.buildToolsForRole("INVENTORY");
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("get_low_stock_items");
    expect(toolNames).not.toContain("get_daily_sales_summary");
  });

  it("rejects execution of unauthorized tool for role", async () => {
    const result = await service.executeTool("CASHIER", "store-1", "get_daily_sales_summary", {
      date: "2026-06-25",
    });

    expect(result).toMatchObject({ ok: false, error: "Unauthorized", error_code: "RBAC_DENIED" });
    expect(toolsRepository.getDailySalesSummary).not.toHaveBeenCalled();
  });

  it("rejects execution when fresh effective RBAC resource permission is revoked", async () => {
    const permissions = buildDefaultRolePermissions();
    permissions.ADMIN.resources.product.read = false;
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      rolePermissions: permissions,
    });

    const result = await service.executeTool("ADMIN", "store-1", "get_product_price", {
      query: "A4",
    });

    expect(result).toMatchObject({ ok: false, error: "Unauthorized", error_code: "RBAC_DENIED" });
    expect(toolsRepository.getProductPrice).not.toHaveBeenCalled();
  });

  it("calls low-stock repository for allowed inventory role", async () => {
    toolsRepository.getLowStockItems.mockResolvedValue({ items: [], generatedAt: "now" });

    const result = await service.executeTool("INVENTORY", "store-1", "get_low_stock_items", {});

    expect(toolsRepository.getLowStockItems).toHaveBeenCalledWith({ storeId: "store-1", limit: 50 });
    expect(result).toMatchObject({
      ok: true,
      data: { kind: "low_stock_items", items: [], total: 0, generatedAt: "now" },
    });
  });

  it("calls sales summary repository for OWNER", async () => {
    toolsRepository.getDailySalesSummary.mockResolvedValue({
      date: "2026-06-25",
      revenue: 100000,
      grossProfit: 40000,
      transactionCount: 2,
      generatedAt: "now",
    });

    const result = await service.executeTool("OWNER", "store-1", "get_daily_sales_summary", {
      date: "2026-06-25",
    });

    expect(toolsRepository.getDailySalesSummary).toHaveBeenCalledWith({ storeId: "store-1", date: "2026-06-25" });
    expect(result).toMatchObject({
      ok: true,
      data: { kind: "daily_sales_summary", revenue: 100000 },
    });
  });

  it("validates tool input with Zod before execution", async () => {
    const result = await service.executeTool("OWNER", "store-1", "get_daily_sales_summary", {
      date: "invalid-date",
    });

    expect(result).toMatchObject({ ok: false, error_code: "VALIDATION_ERROR" });
    expect(toolsRepository.getDailySalesSummary).not.toHaveBeenCalled();
  });

  it("rejects unknown tool input properties before execution", async () => {
    const result = await service.executeTool("OWNER", "store-1", "get_low_stock_items", {
      query: "unexpected",
    });

    expect(result).toMatchObject({ ok: false, error_code: "VALIDATION_ERROR" });
    expect(toolsRepository.getLowStockItems).not.toHaveBeenCalled();
  });

  it("retries transient tool execution failures", async () => {
    toolsRepository.getLowStockItems
      .mockRejectedValueOnce(new Error("connection timeout"))
      .mockResolvedValueOnce({ items: [], generatedAt: "now" });

    const result = await service.executeTool("OWNER", "store-1", "get_low_stock_items", {});

    expect(toolsRepository.getLowStockItems).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      data: { kind: "low_stock_items", items: [], generatedAt: "now" },
    });
  });

  it("does not retry validation-safe non-transient tool failures", async () => {
    toolsRepository.getLowStockItems.mockRejectedValue(new Error("unique constraint failed"));

    const result = await service.executeTool("OWNER", "store-1", "get_low_stock_items", {});

    expect(toolsRepository.getLowStockItems).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, error_code: "EXECUTION_ERROR" });
  });

  it("streams retry progress before the retry attempt completes", async () => {
    let resolveRetry: (value: unknown) => void = () => {};
    toolsRepository.getLowStockItems
      .mockRejectedValueOnce(new Error("connection timeout"))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveRetry = resolve;
      }));
    const create = vi.fn()
      .mockResolvedValueOnce({
        choices: [{
          message: {
            tool_calls: [{ function: { name: "get_low_stock_items", arguments: "{}" } }],
          },
        }],
      })
      .mockResolvedValueOnce(finalAnswer("Retry selesai."));
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      toolRetry: { delayMs: 0, maxAttempts: 2 },
      client: { chat: { completions: { create } } } as any,
    });
    const response = service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "cek stok" }],
      signal: new AbortController().signal,
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";

    while (!received.includes('"status":"tool_retrying"')) {
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      received += decoder.decode(value, { stream: true });
    }

    expect(received).not.toContain('"type":"final"');
    resolveRetry({ items: [], generatedAt: "now" });

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }
    expect(received).toContain('"type":"final"');
  });

  it("returns safe error message on tool execution failure", async () => {
    toolsRepository.getLowStockItems.mockRejectedValue(new Error("password leaked raw db error"));

    const result = await service.executeTool("OWNER", "store-1", "get_low_stock_items", {});

    expect(result).toMatchObject({
      ok: false,
      error: "Database error while executing tool",
      error_code: "EXECUTION_ERROR",
    });
  });

  it("rejects multiple model tool calls without executing tools", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{
        message: {
          tool_calls: [
            { function: { name: "get_low_stock_items", arguments: "{}" } },
            { function: { name: "get_system_help", arguments: "{\"query\":\"help\"}" } },
          ],
        },
      }],
    });
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
    });

    const response = service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "cek stok dan bantuan" }],
      signal: new AbortController().signal,
    });
    const body = await readStream(response);

    expect(toolsRepository.getLowStockItems).not.toHaveBeenCalled();
    expect(body).toContain("satu pengecekan data");
  });

  it("streams initial planning progress before waiting for the model response", async () => {
    let resolveModelResponse: (value: unknown) => void = () => {};
    const create = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveModelResponse = resolve;
      }),
    );
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
    });

    const response = service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "halo" }],
      signal: new AbortController().signal,
    });
    const firstChunk = await readFirstStreamChunk(response);

    expect(firstChunk).toContain('"type":"progress","status":"planning"');
    expect(create).toHaveBeenCalledTimes(1);

    resolveModelResponse({ choices: [{ message: { content: "no tool" } }] });
  });

  it("forwards provider content deltas before the final structured answer", async () => {
    const streamedAnswer = {
      answerMarkdown: "Real streaming answer",
      dataStatus: "no_tool_used",
      sourceLabel: "Pak Teladan",
      generatedAt: "2026-06-27T01:00:01.000Z",
      followUps: [],
    };
    const fragments = [
      '{"answerMarkdown":"Real ',
      'streaming answer","dataStatus":"no_tool_used",',
      '"sourceLabel":"Pak Teladan","generatedAt":"2026-06-27T01:00:01.000Z","followUps":[]}',
    ];
    const providerStream = {
      async *[Symbol.asyncIterator]() {
        for (const content of fragments) {
          yield { choices: [{ delta: { content } }] };
        }
      },
    };
    const create = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: "no tool" } }] })
      .mockResolvedValueOnce(providerStream);
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
    });

    const body = await readStream(service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "jelaskan sistem POS" }],
      signal: new AbortController().signal,
    }));

    expect(create.mock.calls[1][0]).toMatchObject({ stream: true });
    expect(body).toContain('"message":{"role":"assistant","content":"Real "}');
    expect(body).toContain('"message":{"role":"assistant","content":"streaming answer"}');
    expect(body).toContain(JSON.stringify({ type: "final", answer: streamedAnswer }));
  });

  it("aborts the provider request when the response consumer cancels", async () => {
    let providerAborted = false;
    const create = vi.fn((_body, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        providerAborted = true;
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }));
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
    });
    const response = service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "jelaskan sistem POS" }],
      signal: new AbortController().signal,
    });
    const reader = response.body!.getReader();

    await reader.read();
    await reader.cancel();

    expect(create).toHaveBeenCalledTimes(1);
    expect(providerAborted).toBe(true);
  });

  it("returns a safe timeout answer when the hard assistant deadline expires", async () => {
    let providerAborted = false;
    const create = vi.fn((_body, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        providerAborted = true;
        const error = new Error("deadline exceeded");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }));
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
      assistantDeadlineMs: 25,
    } as any);

    const body = await Promise.race([
      readStream(service.toResponseStream({
        role: "OWNER",
        storeId: "store-1",
        messages: [{ role: "user", content: "jelaskan sistem POS" }],
        signal: new AbortController().signal,
      })),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed_out_without_answer"), 100)),
    ]);

    expect(providerAborted).toBe(true);
    expect(body).toContain("batas waktu");
    expect(body).toContain('"dataStatus":"error"');
  });

  it("disables reverse-proxy buffering for progress events", () => {
    const response = service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "halo" }],
      signal: new AbortController().signal,
    });

    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
  });

  it("pads the first progress event so it is flushed through buffered transports", async () => {
    let resolveModelResponse: (value: unknown) => void = () => {};
    const create = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveModelResponse = resolve;
      }),
    );
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
    });
    const response = service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "halo" }],
      signal: new AbortController().signal,
    });

    const firstChunk = await readFirstStreamChunk(response);

    expect(firstChunk).toContain('"status":"planning"');
    expect(new TextEncoder().encode(firstChunk).byteLength).toBeGreaterThanOrEqual(8192);
    resolveModelResponse({ choices: [{ message: { content: "no tool" } }] });
  });

  it("timestamps progress events on the server", async () => {
    let resolveModelResponse: (value: unknown) => void = () => {};
    const create = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveModelResponse = resolve;
      }),
    );
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
    });
    const response = service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "halo" }],
      signal: new AbortController().signal,
    });

    const firstChunk = await readFirstStreamChunk(response);
    const dataLine = firstChunk.split("\n").find((line) => line.startsWith("data: "))!;
    const event = JSON.parse(dataLine.slice(6));

    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    resolveModelResponse({ choices: [{ message: { content: "no tool" } }] });
  });

  it("allows one model repair attempt for invalid tool arguments", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({
        choices: [{
          message: {
            tool_calls: [{ function: { name: "get_daily_sales_summary", arguments: "{\"date\":\"today\"}" } }],
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{
          message: {
            tool_calls: [{ function: { name: "get_daily_sales_summary", arguments: "{\"date\":\"2026-06-26\"}" } }],
          },
        }],
      })
      .mockResolvedValueOnce(finalAnswer("Omzet hari ini Rp 100.000."));
    toolsRepository.getDailySalesSummary.mockResolvedValue({
      date: "2026-06-26",
      revenue: 100000,
      grossProfit: 40000,
      transactionCount: 2,
      generatedAt: "2026-06-26T10:00:00.000Z",
    });
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
    });

    const response = service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "omzet hari ini?" }],
      signal: new AbortController().signal,
    });
    const body = await readStream(response);

    expect(create).toHaveBeenCalledTimes(3);
    expect(toolsRepository.getDailySalesSummary).toHaveBeenCalledWith({ storeId: "store-1", date: "2026-06-26" });
    expect(body).toContain("Omzet hari ini");
  });

  it("allows one final structured output repair attempt", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: "no tool" } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: "not json" } }] })
      .mockResolvedValueOnce(finalAnswer("Jawaban sudah valid."));
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
    });

    const response = service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "halo" }],
      signal: new AbortController().signal,
    });
    const body = await readStream(response);

    expect(create).toHaveBeenCalledTimes(3);
    expect(body).toContain("Jawaban sudah valid");
  });

  it("returns an allowlisted static response without calling the model", async () => {
    const create = vi.fn();
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      fastPathIntents: new Set(["social_static"] as const),
      client: { chat: { completions: { create } } } as any,
    });

    const body = await readStream(service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "halo" }],
      signal: new AbortController().signal,
    }));

    expect(create).not.toHaveBeenCalled();
    expect(body).toContain("Pak Teladan");
    expect(body).toContain('"dataStatus":"no_tool_used"');
  });

  it("executes an allowlisted deterministic tool with one model call", async () => {
    const create = vi.fn().mockResolvedValueOnce(finalAnswer("Stok rendah ditemukan."));
    toolsRepository.getLowStockItems.mockResolvedValue({
      items: [],
      generatedAt: "2026-06-26T10:00:00.000Z",
    });
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      fastPathIntents: new Set(["get_low_stock_items"] as const),
      client: { chat: { completions: { create } } } as any,
    });

    const body = await readStream(service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "produk apa yang stoknya rendah?" }],
      signal: new AbortController().signal,
    }));

    expect(toolsRepository.getLowStockItems).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(body).toContain("Stok rendah ditemukan");
  });

  it("keeps contextual requests on the two-call model fallback", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: "no tool" } }] })
      .mockResolvedValueOnce(finalAnswer("Jawaban kontekstual."));
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      fastPathIntents: new Set(["get_product_stock"] as const),
      client: { chat: { completions: { create } } } as any,
    });

    const body = await readStream(service.toResponseStream({
      role: "OWNER",
      storeId: "store-1",
      messages: [{ role: "user", content: "cek stok yang tadi" }],
      signal: new AbortController().signal,
    }));

    expect(create).toHaveBeenCalledTimes(2);
    expect(toolsRepository.getProductStock).not.toHaveBeenCalled();
    expect(body).toContain("Jawaban kontekstual");
  });

  it("keeps RBAC fail-closed on an allowlisted direct tool", async () => {
    const create = vi.fn();
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      fastPathIntents: new Set(["get_daily_sales_summary"] as const),
      client: { chat: { completions: { create } } } as any,
      now: () => new Date("2026-06-26T10:00:00Z"),
    });

    const body = await readStream(service.toResponseStream({
      role: "CASHIER",
      storeId: "store-1",
      messages: [{ role: "user", content: "omzet hari ini berapa?" }],
      signal: new AbortController().signal,
    }));

    expect(create).not.toHaveBeenCalled();
    expect(toolsRepository.getDailySalesSummary).not.toHaveBeenCalled();
    expect(body).toContain("tidak punya akses");
  });

  it("returns a permitted guided workflow deterministically without a provider call", async () => {
    const create = vi.fn();
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
      now: () => new Date("2026-06-29T08:00:00.000Z"),
    });

    const body = await readStream(service.toResponseStream({
      role: "ADMIN",
      storeId: "store-1",
      messages: [{ role: "user", content: "Bagaimana cara menambahkan produk baru ke katalog toko?" }],
      signal: new AbortController().signal,
    }));

    expect(create).not.toHaveBeenCalled();
    expect(body).toContain('"responseKind":"workflow"');
    expect(body).toContain('"id":"faq-q01-add-product"');
    expect(body).toContain('"route":"/products"');
    expect(body).toContain("Tambah Produk");
  });

  it("returns deterministic access guidance for a restricted guided workflow", async () => {
    const create = vi.fn();
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
      now: () => new Date("2026-06-29T08:00:00.000Z"),
    });

    const body = await readStream(service.toResponseStream({
      role: "CASHIER",
      storeId: "store-1",
      messages: [{ role: "user", content: "cara tambah produk baru" }],
      signal: new AbortController().signal,
    }));

    expect(create).not.toHaveBeenCalled();
    expect(body).toContain("akses");
    expect(body).not.toContain('"workflow"');
  });

  it("uses constrained workflow selection for unresolved how-to requests", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(workflowSelection("faq-q01-add-product"))
      .mockResolvedValueOnce(finalAnswer("Jawaban generik ini tidak boleh dipakai."));
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
      now: () => new Date("2026-06-29T08:00:00.000Z"),
    });

    const body = await readStream(service.toResponseStream({
      role: "ADMIN",
      storeId: "store-1",
      messages: [{ role: "user", content: "cara memakai fitur toko untuk input barang baru yang belum ada" }],
      signal: new AbortController().signal,
    }));

    const selectionRequest = create.mock.calls[0][0];
    const selectionPrompt = JSON.stringify(selectionRequest.messages);

    expect(create).toHaveBeenCalledTimes(1);
    expect(selectionRequest).toMatchObject({
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "assistant_workflow_selection",
        },
      },
    });
    expect(selectionPrompt).toContain("faq-q01-add-product");
    expect(selectionPrompt).not.toContain("Buka katalog produk");
    expect(body).toContain('"responseKind":"workflow"');
    expect(body).toContain('"id":"faq-q01-add-product"');
    expect(body).toContain("Tambah Produk");
    expect(body).not.toContain("Jawaban generik ini tidak boleh dipakai.");
  });

  it("only exposes permitted workflow IDs in fallback selection prompts", async () => {
    const create = vi.fn().mockResolvedValueOnce(workflowClarification("Sebutkan menu yang mau dipandu ya."));
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
      now: () => new Date("2026-06-29T08:00:00.000Z"),
    });

    const body = await readStream(service.toResponseStream({
      role: "CASHIER",
      storeId: "store-1",
      messages: [{ role: "user", content: "cara pakai fitur aplikasi toko" }],
      signal: new AbortController().signal,
    }));

    const selectionPrompt = JSON.stringify(create.mock.calls[0][0].messages);

    expect(selectionPrompt).toContain("faq-q06-pos-sale");
    expect(selectionPrompt).not.toContain("faq-q01-add-product");
    expect(selectionPrompt).not.toContain("faq-q23-manage-rbac");
    expect(body).toContain("Sebutkan menu yang mau dipandu ya.");
    expect(body).not.toContain('"workflow"');
  });

  it("rejects workflow selection IDs outside the permitted set", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(workflowSelection("faq-q23-manage-rbac"))
      .mockResolvedValueOnce(finalAnswer("Jangan jawab dari model umum."));
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
      now: () => new Date("2026-06-29T08:00:00.000Z"),
    });

    const body = await readStream(service.toResponseStream({
      role: "CASHIER",
      storeId: "store-1",
      messages: [{ role: "user", content: "cara pakai fitur aplikasi toko" }],
      signal: new AbortController().signal,
    }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(body).toContain("belum yakin panduan mana");
    expect(body).not.toContain('"responseKind":"workflow"');
    expect(body).not.toContain("Buka tab RBAC");
    expect(body).not.toContain("Jangan jawab dari model umum.");
  });

  it("recognizes Indonesian inventory wording for constrained workflow selection", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(workflowSelection("faq-q28-inventory-day-session"))
      .mockResolvedValueOnce(finalAnswer("Jawaban inventori umum tidak boleh dipakai."));
    service = new AssistantService({
      apiKey: "test-key",
      model: "gpt-4",
      toolsRepository,
      client: { chat: { completions: { create } } } as any,
      now: () => new Date("2026-06-29T08:00:00.000Z"),
    });

    const body = await readStream(service.toResponseStream({
      role: "INVENTORY",
      storeId: "store-1",
      messages: [{ role: "user", content: "cara pakai inventori harian" }],
      signal: new AbortController().signal,
    }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(body).toContain('"id":"faq-q28-inventory-day-session"');
    expect(body).toContain("Check In");
    expect(body).not.toContain("Jawaban inventori umum tidak boleh dipakai.");
  });
});

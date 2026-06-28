import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const openAIChatCreateMock = vi.hoisted(() => vi.fn());
const getLowStockItemsMock = vi.hoisted(() => vi.fn());
const getDailySalesSummaryMock = vi.hoisted(() => vi.fn());
const getSystemHelpMock = vi.hoisted(() => vi.fn());
const getProductSearchMock = vi.hoisted(() => vi.fn());
const getProductStockMock = vi.hoisted(() => vi.fn());
const getProductPriceMock = vi.hoisted(() => vi.fn());
const getCustomerSearchMock = vi.hoisted(() => vi.fn());
const getCustomerDebtSummaryMock = vi.hoisted(() => vi.fn());
const getCustomerRecapSummaryMock = vi.hoisted(() => vi.fn());
const getSupplierSearchMock = vi.hoisted(() => vi.fn());
const getTopProductsMock = vi.hoisted(() => vi.fn());
const getPendingTransactionsMock = vi.hoisted(() => vi.fn());
const openAIConstructorMock = vi.hoisted(() =>
  vi.fn().mockImplementation(function OpenAI() {
    return {
      chat: {
        completions: {
          create: openAIChatCreateMock,
        },
      },
    };
  })
);

vi.mock("@/lib/rbac/guard", () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("openai", () => ({
  default: openAIConstructorMock,
}));

vi.mock("@/features/ai-assistant/repositories/assistant-tools-repository", () => ({
  getLowStockItems: getLowStockItemsMock,
  getDailySalesSummary: getDailySalesSummaryMock,
  getSystemHelp: getSystemHelpMock,
  getProductSearch: getProductSearchMock,
  getProductStock: getProductStockMock,
  getProductPrice: getProductPriceMock,
  getCustomerSearch: getCustomerSearchMock,
  getCustomerDebtSummary: getCustomerDebtSummaryMock,
  getCustomerRecapSummary: getCustomerRecapSummaryMock,
  getSupplierSearch: getSupplierSearchMock,
  getTopProducts: getTopProductsMock,
  getPendingTransactions: getPendingTransactionsMock,
}));

const makeRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/ai/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const finalAnswer = (answerMarkdown = "Ini jawabannya.") => ({
  choices: [{
    message: {
      content: JSON.stringify({
        answerMarkdown,
        dataStatus: "live_data",
        sourceLabel: "Alat stok rendah",
        generatedAt: "2026-06-26T10:00:00.000Z",
        followUps: ["Cek produk lain?"],
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

describe("POST /api/ai/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NEBIUS_API_KEY = "test-nebius-key";
    process.env.NEBIUS_MODEL = "test-nebius-model";
    delete process.env.AI_FAST_PATH_INTENTS;
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      username: "owner",
      name: "Owner User",
      role: "OWNER",
      storeId: "store-1",
      isActive: true,
    });
    getLowStockItemsMock.mockResolvedValue({
      items: [{ id: "p1", name: "Kertas A4", sku: "A4", stock: 2, minStock: 5, unit: "rim" }],
      generatedAt: "2026-06-26T10:00:00.000Z",
    });
    getDailySalesSummaryMock.mockResolvedValue({
      date: "2026-06-26",
      revenue: 100000,
      grossProfit: 40000,
      transactionCount: 2,
      generatedAt: "2026-06-26T10:00:00.000Z",
    });
    getSystemHelpMock.mockResolvedValue({
      markdown: "Gunakan menu Produk untuk tambah produk.",
      sourceRefs: ["products.md"],
      generatedAt: "2026-06-26T10:00:00.000Z",
    });
    getProductSearchMock.mockResolvedValue({ items: [], total: 0, generatedAt: "2026-06-26T10:00:00.000Z" });
    getProductStockMock.mockResolvedValue({ match: null, candidates: [], generatedAt: "2026-06-26T10:00:00.000Z" });
    getProductPriceMock.mockResolvedValue({ match: null, candidates: [], generatedAt: "2026-06-26T10:00:00.000Z" });
    getCustomerSearchMock.mockResolvedValue({ items: [], total: 0, generatedAt: "2026-06-26T10:00:00.000Z" });
    getCustomerDebtSummaryMock.mockResolvedValue({ match: null, candidates: [], generatedAt: "2026-06-26T10:00:00.000Z" });
    getCustomerRecapSummaryMock.mockResolvedValue({ match: null, candidates: [], generatedAt: "2026-06-26T10:00:00.000Z" });
    getSupplierSearchMock.mockResolvedValue({ items: [], total: 0, generatedAt: "2026-06-26T10:00:00.000Z" });
    getTopProductsMock.mockResolvedValue({ date: "2026-06-26", items: [], generatedAt: "2026-06-26T10:00:00.000Z" });
    getPendingTransactionsMock.mockResolvedValue({ items: [], total: 0, generatedAt: "2026-06-26T10:00:00.000Z" });
  });

  it("uses Nebius API key, base URL, and model from env", async () => {
    openAIChatCreateMock
      .mockResolvedValueOnce({ choices: [{ message: { content: "no tool" } }] })
      .mockResolvedValueOnce(finalAnswer("Halo Kak."));
    const { POST } = await import("../route");

    const response = await POST(makeRequest({ messages: [{ role: "user", content: "jelaskan sistem POS" }] }));
    await readStream(response);

    expect(response.status).toBe(200);
    expect(openAIConstructorMock).toHaveBeenCalledWith({
      apiKey: "test-nebius-key",
      baseURL: "https://api.tokenfactory.nebius.com/v1/",
    });
    expect(openAIChatCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-nebius-model",
        tools: expect.any(Array),
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  }, 15_000);

  it("sends role-filtered JSON schema tools to Nebius", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-2",
      username: "cashier",
      name: "Cashier User",
      role: "CASHIER",
      storeId: "store-1",
      isActive: true,
    });
    openAIChatCreateMock
      .mockResolvedValueOnce({ choices: [{ message: { content: "no tool" } }] })
      .mockResolvedValueOnce(finalAnswer("Halo cashier."));
    const { POST } = await import("../route");

    const response = await POST(makeRequest({ messages: [{ role: "user", content: "cek harga A4" }] }));
    await readStream(response);

    const firstCall = openAIChatCreateMock.mock.calls[0][0];
    const toolNames = firstCall.tools.map((tool: any) => tool.function.name);
    expect(toolNames).toContain("get_product_price");
    expect(toolNames).not.toContain("get_daily_sales_summary");
    expect(firstCall.tools[0].function.parameters.additionalProperties).toBe(false);
  });

  it("executes one model-selected tool and returns progress plus final answer frames", async () => {
    openAIChatCreateMock
      .mockResolvedValueOnce({
        choices: [{
          message: {
            tool_calls: [{
              id: "call-1",
              type: "function",
              function: { name: "get_low_stock_items", arguments: "{}" },
            }],
          },
        }],
      })
      .mockResolvedValueOnce(finalAnswer("Ada **Kertas A4** yang stoknya rendah."));
    const { POST } = await import("../route");

    const response = await POST(makeRequest({ messages: [{ role: "user", content: "produk mana yang stoknya rendah?" }] }));
    const body = await readStream(response);

    expect(getLowStockItemsMock).toHaveBeenCalledWith({ storeId: "store-1", limit: 50 });
    expect(body).toContain('"type":"progress","status":"planning"');
    expect(body).toContain('"type":"progress","status":"tool_selected","toolName":"get_low_stock_items"');
    expect(body).toContain('"type":"final"');
    expect(body).toContain("Kertas A4");
    expect(body).toContain("data: [DONE]");
  });

  it("streams initial planning progress before the provider response resolves", async () => {
    let resolveProviderResponse: (value: unknown) => void = () => {};
    openAIChatCreateMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProviderResponse = resolve;
      }),
    );
    const { POST } = await import("../route");

    const response = await POST(makeRequest({ messages: [{ role: "user", content: "jelaskan sistem POS" }] }));
    const firstChunk = await readFirstStreamChunk(response);

    expect(firstChunk).toContain('"type":"progress","status":"planning"');
    expect(openAIChatCreateMock).toHaveBeenCalledTimes(1);

    resolveProviderResponse({ choices: [{ message: { content: "no tool" } }] });
  });

  it("rejects unauthorized model-requested tools backend-side", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-2",
      username: "cashier",
      name: "Cashier User",
      role: "CASHIER",
      storeId: "store-1",
      isActive: true,
    });
    openAIChatCreateMock.mockResolvedValueOnce({
      choices: [{
        message: {
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: { name: "get_daily_sales_summary", arguments: "{\"date\":\"2026-06-26\"}" },
          }],
        },
      }],
    });
    const { POST } = await import("../route");

    const response = await POST(makeRequest({ messages: [{ role: "user", content: "omzet hari ini berapa?" }] }));
    const body = await readStream(response);

    expect(getDailySalesSummaryMock).not.toHaveBeenCalled();
    expect(openAIChatCreateMock).toHaveBeenCalledTimes(1);
    expect(body).toContain("tidak punya akses");
    expect(body).toContain('"sourceLabel":"RBAC"');
  });

  it("returns 500 when NEBIUS_API_KEY is missing", async () => {
    delete process.env.NEBIUS_API_KEY;
    const { POST } = await import("../route");

    const response = await POST(makeRequest({ messages: [{ role: "user", content: "jelaskan sistem POS" }] }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toContain("NEBIUS_API_KEY");
  });

  it("returns 401 when user is not authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("../route");

    const response = await POST(makeRequest({ messages: [{ role: "user", content: "jelaskan sistem POS" }] }));

    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed messages", async () => {
    const { POST } = await import("../route");

    const response = await POST(makeRequest({ messages: "bad" }));

    expect(response.status).toBe(400);
  });

  it("uses one provider call for an allowlisted deterministic tool", async () => {
    process.env.AI_FAST_PATH_INTENTS = "get_low_stock_items";
    openAIChatCreateMock.mockResolvedValueOnce(finalAnswer("Fast stock answer."));
    const { POST } = await import("../route");

    const response = await POST(makeRequest({ messages: [{ role: "user", content: "produk apa yang stoknya rendah?" }] }));
    const body = await readStream(response);

    expect(response.status).toBe(200);
    expect(getLowStockItemsMock).toHaveBeenCalledTimes(1);
    expect(openAIChatCreateMock).toHaveBeenCalledTimes(1);
    expect(body).toContain("Fast stock answer");
  });

  it("uses zero provider calls for an allowlisted static intent", async () => {
    process.env.AI_FAST_PATH_INTENTS = "social_static";
    const { POST } = await import("../route");

    const response = await POST(makeRequest({ messages: [{ role: "user", content: "halo" }] }));
    const body = await readStream(response);

    expect(response.status).toBe(200);
    expect(openAIConstructorMock).not.toHaveBeenCalled();
    expect(openAIChatCreateMock).not.toHaveBeenCalled();
    expect(body).toContain("Pak Teladan");
  });

  it("rejects messages above the visible composer limit", async () => {
    const { POST } = await import("../route");

    const response = await POST(makeRequest({
      messages: [{ role: "user", content: "a".repeat(2_001) }],
    }));

    expect(response.status).toBe(400);
    expect(openAIChatCreateMock).not.toHaveBeenCalled();
  });

  it("rejects request bodies above the abuse limit", async () => {
    const { POST } = await import("../route");

    const response = await POST(makeRequest({
      messages: Array.from({ length: 100 }, () => ({ role: "user", content: "a".repeat(2_000) })),
      padding: "a".repeat(70_000),
    }));

    expect(response.status).toBe(413);
    expect(openAIChatCreateMock).not.toHaveBeenCalled();
  });
});

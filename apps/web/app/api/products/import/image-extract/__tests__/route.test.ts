import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";

const openAIChatCreateMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbProductFindManyMock = vi.hoisted(() => vi.fn());
const dbCategoryFindManyMock = vi.hoisted(() => vi.fn());
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

// Mock fetch for EasyOCR
global.fetch = vi.fn();

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: {
      findMany: dbProductFindManyMock,
    },
    category: {
      findMany: dbCategoryFindManyMock,
    },
  },
}));

// Mock openai
vi.mock("openai", () => {
  return {
    default: openAIConstructorMock,
  };
});

describe("POST /api/products/import/image-extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EASYOCR_API_KEY = "test-easyocr-key";
    process.env.NEBIUS_API_KEY = "test-nebius-key";
    requirePermissionMock.mockResolvedValue({ id: "user-1", storeId: "store-main" });
    handleAuthErrorMock.mockReturnValue(null);
    dbProductFindManyMock.mockResolvedValue([]);
    dbCategoryFindManyMock.mockResolvedValue([{ name: "Jasa Cetak" }, { name: "Uncategorized" }]);
  });

  it("returns 400 if no files uploaded", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost/api/products/import/image-extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("No images provided");
  });

  it("returns 400 if more than 5 images uploaded", async () => {
    const formData = new FormData();
    for (let i = 0; i < 6; i++) {
      formData.append(`image_${i}`, new Blob(["test"], { type: "image/jpeg" }));
    }
    const req = new NextRequest("http://localhost/api/products/import/image-extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Maximum 5 images allowed");
  });

  it("returns 400 if invalid file type uploaded", async () => {
    const formData = new FormData();
    formData.append("image_0", new Blob(["test"], { type: "text/plain" }));
    
    const req = new NextRequest("http://localhost/api/products/import/image-extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("Invalid file type");
  });

  it("calls EasyOCR and returns products if successful", async () => {
    // Mock successful EasyOCR response
    const mockOcrResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        request_id: "caf0fc07c342481f895c0face490e4bc",
        message: "OCR recognition succeeded.",
        user: "test-user",
        remaining_quota: 99,
        elapsed_seconds: 0.2417,
        result_summary: "Recognition complete, 4 text blocks.",
        words: [
          { text: "Kertas", score: 0.99 },
          { text: "A4", score: 0.98 },
          { text: "Rp", score: 0.97 },
          { text: "55000", score: 0.96 },
        ],
      }),
    };
    (global.fetch as any).mockResolvedValueOnce(mockOcrResponse);

    const formData = new FormData();
    formData.append("image_0", new Blob(["test"], { type: "image/png" }));
    
    const req = new NextRequest("http://localhost/api/products/import/image-extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    const fetchInit = (global.fetch as any).mock.calls[0][1];
    const uploadedFile = fetchInit.body.get("file") as File;
    
    // The parser handles "Kertas A4 Rp 55000"
    expect(uploadedFile.name).toBe("image.png");
    expect(json.source).toBe("easyocr");
    expect(json.extractedProducts.length).toBeGreaterThan(0);
    expect(json.extractedProducts[0].name).toContain("Kertas A4");
    expect(json.extractedProducts[0].price).toBe(55000);
    expect(json.unknownColumns).toBeDefined();
    expect(json.unknownColumns).toEqual([]);
    expect(json.missingColumns).toBeDefined();
    expect(json.missingColumns).toEqual([]);
  });

  it("falls back to Nebius Vision using NEBIUS_API_KEY when EasyOCR is unauthorized", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });
    openAIChatCreateMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              products: [
                {
                  name: "Banner Flexi",
                  sku: "BNR-FLX",
                  category: "Jasa Cetak",
                  price: 25000,
                  stock: 0,
                  unit: "meter",
                  confidence: { name: 0.95, price: 0.9, sku: 0.8 },
                },
              ],
            }),
          },
        },
      ],
    });

    const formData = new FormData();
    formData.append("image_0", new Blob(["test"], { type: "image/jpeg" }));

    const req = new NextRequest("http://localhost/api/products/import/image-extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const json = await response.json();

    expect(openAIConstructorMock).toHaveBeenCalledWith({
      baseURL: "https://api.tokenfactory.nebius.com/v1/",
      apiKey: "test-nebius-key",
    });
    expect(json.source).toBe("nebius-vision");
    expect(json.extractedProducts[0].name).toBe("Banner Flexi");
    expect(json.unknownColumns).toBeDefined();
    expect(json.unknownColumns).toEqual([]);
    expect(json.missingColumns).toBeDefined();
    expect(json.missingColumns).toEqual([]);
  });

  it("detects and sets duplicateInFile for products with identical SKUs", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });
    openAIChatCreateMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              products: [
                {
                  name: "Banner Flexi",
                  sku: "BNR-FLX",
                  category: "Jasa Cetak",
                  price: 25000,
                  stock: 0,
                  unit: "meter",
                  confidence: { name: 0.95, price: 0.9, sku: 0.8 },
                },
                {
                  name: "Banner Flexi Duplicate",
                  sku: "BNR-FLX",
                  category: "Jasa Cetak",
                  price: 30000,
                  stock: 0,
                  unit: "meter",
                  confidence: { name: 0.95, price: 0.9, sku: 0.8 },
                },
              ],
            }),
          },
        },
      ],
    });

    const formData = new FormData();
    formData.append("image_0", new Blob(["test"], { type: "image/jpeg" }));

    const req = new NextRequest("http://localhost/api/products/import/image-extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.rows.length).toBe(2);
    expect(json.rows[0].duplicateInFile).toBe(true);
    expect(json.rows[1].duplicateInFile).toBe(true);
    expect(json.rows[0].warnings).toContain("Duplicate SKU in file.");
    expect(json.rows[1].warnings).toContain("Duplicate SKU in file.");
  });

  it("marks extracted rows with existing SKUs so commit requires update or skip decisions", async () => {
    dbProductFindManyMock.mockResolvedValueOnce([
      { id: "prod-existing", sku: "BNR-FLX", name: "Existing Banner Flexi" },
    ]);
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });
    openAIChatCreateMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              products: [
                {
                  name: "Banner Flexi",
                  sku: "BNR-FLX",
                  category: "Jasa Cetak",
                  price: 25000,
                  stock: 0,
                  unit: "meter",
                  confidence: { name: 0.95, price: 0.9, sku: 0.8 },
                },
              ],
            }),
          },
        },
      ],
    });

    const formData = new FormData();
    formData.append("image_0", new Blob(["test"], { type: "image/jpeg" }));

    const req = new NextRequest("http://localhost/api/products/import/image-extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const json = await response.json();

    expect(dbProductFindManyMock).toHaveBeenCalledWith({
      where: { storeId: "store-main", sku: { in: ["BNR-FLX"] } },
      select: { id: true, sku: true, name: true },
    });
    expect(json.existingSkuMatches).toEqual([
      { sku: "BNR-FLX", productId: "prod-existing", name: "Existing Banner Flexi" },
    ]);
    expect(json.rows[0].existingProductId).toBe("prod-existing");
    expect(json.rows[0].existingProductName).toBe("Existing Banner Flexi");
    expect(json.rows[0].warnings).toContain("SKU already exists. Choose update or skip before commit.");
  });


  it("returns a clear configuration error when Nebius fallback has no API key", async () => {
    delete process.env.EASYOCR_API_KEY;
    delete process.env.NEBIUS_API_KEY;

    const formData = new FormData();
    formData.append("image_0", new Blob(["test"], { type: "image/jpeg" }));

    const req = new NextRequest("http://localhost/api/products/import/image-extract", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(500);
    const json = await response.json();

    expect(json.error).toContain("NEBIUS_API_KEY is not configured");
    expect(openAIConstructorMock).not.toHaveBeenCalled();
  });
});

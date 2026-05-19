import { NextRequest, NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { parseOCRTextToProducts, mapExtractedToImportRows, PRODUCT_EXTRACTION_SCHEMA, IMAGE_EXTRACT_SYSTEM_PROMPT } from "../../../../../features/product-import/helpers/image-extract";
import type { ExtractedProduct } from "../../../../../features/product-import/types";
import OpenAI from "openai";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:products:import:image-extract");
interface EasyOCRWord {
  text?: unknown;
  score?: unknown;
}

interface EasyOCRResponse {
  request_id?: string;
  message?: string;
  user?: string;
  remaining_quota?: number;
  elapsed_seconds?: number;
  result_summary?: string;
  words?: EasyOCRWord[];
  text?: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("product", "create");
    const storeId = user.storeId || "store-main";
    const formData = await req.formData();
    
    const imageFiles: File[] = [];
    for (let i = 0; i < 6; i++) {
      const file = formData.get(`image_${i}`);
      if (file && file instanceof Blob) {
        imageFiles.push(file as File);
      }
    }

    if (imageFiles.length === 0) {
      return NextResponse.json({ message: "No images provided" }, { status: 422 });
    }

    if (imageFiles.length > 5) {
      return NextResponse.json({ message: "Maximum 5 images allowed" }, { status: 422 });
    }

    // Validate file types
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    for (const file of imageFiles) {
      if (!validTypes.includes(file.type)) {
        return NextResponse.json(
          { message: `Invalid file type ${file.type}. Only JPG, PNG, and WebP are allowed.` },
          { status: 415 }
        );
      }
    }

    // Tier 1: EasyOCR
    try {
      const ocrResults = await Promise.all(
        imageFiles.map(async (file) => {
          const buffer = Buffer.from(await file.arrayBuffer());
          return callEasyOCR(buffer, file.type);
        })
      );
      
      const allText = ocrResults.map(extractTextFromEasyOCRResponse).join("\n");
      
      if (allText.trim().length > 10) {
        const products = parseOCRTextToProducts(allText);
        if (products.length > 0) {
          return NextResponse.json(await buildImageExtractResponse("easyocr", products, imageFiles.length, storeId));
        }
      }
    } catch (error) {
      log.warn("EasyOCR failed, falling back to Vision LLM:", error);
    }

    // Tier 2: Nebius Vision LLM
    try {
      const products = await callNebiusVision(imageFiles);
      return NextResponse.json(await buildImageExtractResponse("nebius-vision", products, imageFiles.length, storeId));
    } catch (error: any) {
      log.error("Nebius Vision failed:", error);
      return NextResponse.json(
        { message: "AI extraction failed" },
        { status: 502 }
      );
    }

  } catch (error: any) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Image extract error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

async function buildImageExtractResponse(
  source: "easyocr" | "nebius-vision",
  products: ExtractedProduct[],
  imageCount: number,
  storeId: string,
) {
  const skus = Array.from(new Set(products.map((product) => product.sku).filter(Boolean)));
  const [existingProducts, categories] = await Promise.all([
    skus.length > 0
      ? db.product.findMany({
          where: { storeId, sku: { in: skus } },
          select: { id: true, sku: true, name: true },
        })
      : Promise.resolve([]),
    db.category.findMany({ select: { name: true } }),
  ]);
  const existingBySku = new Map(existingProducts.map((product) => [product.sku, product]));
  const existingSkuMatches = existingProducts.map((product) => ({
    sku: product.sku,
    productId: product.id,
    name: product.name,
  }));
  const categoryNames = new Set(categories.map((category) => category.name.toLowerCase()));
  const missingCategories = new Set<string>();

  const rows = mapExtractedToImportRows(products).map((row) => {
    const existingProduct = existingBySku.get(row.sku);
    const rowWarnings = [...row.warnings];
    const missingCategory = Boolean(row.category && !categoryNames.has(row.category.toLowerCase()));

    if (existingProduct) {
      rowWarnings.push("SKU already exists. Choose update or skip before commit.");
    }
    if (missingCategory) {
      rowWarnings.push("Category will be created on commit.");
      missingCategories.add(row.category);
    }

    return {
      ...row,
      existingProductId: existingProduct?.id,
      existingProductName: existingProduct?.name,
      missingCategory,
      warnings: rowWarnings,
    };
  });

  return {
    source,
    extractedProducts: products,
    rows,
    warnings: rows.flatMap((row) => row.warnings.map((warning) => `Row ${row.rowNumber}: ${warning}`)),
    errors: rows.flatMap((row) => row.errors.map((error) => `Row ${row.rowNumber}: ${error}`)),
    existingSkuMatches,
    missingCategories: Array.from(missingCategories),
    unknownColumns: [],
    missingColumns: [],
    imageCount,
    processingTimeMs: 0,
  };
}

function extractTextFromEasyOCRResponse(payload: EasyOCRResponse): string {
  if (Array.isArray(payload.words)) {
    return payload.words
      .map((word) => (typeof word.text === "string" ? word.text.trim() : ""))
      .filter(Boolean)
      .join(" ");
  }

  return typeof payload.text === "string" ? payload.text : "";
}

function filenameForEasyOCRMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "image.png";
    case "image/webp":
      return "image.webp";
    default:
      return "image.jpg";
  }
}

async function callEasyOCR(buffer: Buffer, mimeType: string): Promise<EasyOCRResponse> {
  const apiKey = process.env.EASYOCR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("EASYOCR_API_KEY is not configured");
  }

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filenameForEasyOCRMimeType(mimeType));

  const response = await fetch("https://console.easyocr.org/api/ocr", {
    method: "POST",
    headers: {
      "X-Access-Key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`EasyOCR returned ${response.status}`);
  }
  return await response.json();
}

async function callNebiusVision(files: File[]): Promise<ExtractedProduct[]> {
  const apiKey = process.env.NEBIUS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("NEBIUS_API_KEY is not configured. Add it to apps/web/.env.local and restart the dev server.");
  }

  const client = new OpenAI({
    baseURL: "https://api.tokenfactory.nebius.com/v1/",
    apiKey,
  });

  const imageContents = await Promise.all(
    files.map(async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return {
        type: "image_url",
        image_url: { url: `data:${file.type};base64,${base64}` },
      };
    })
  );

  const response = await client.chat.completions.create({
    model: "Qwen/Qwen2.5-VL-72B-Instruct",
    messages: [
      { role: "system", content: IMAGE_EXTRACT_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract all products from these images." },
          ...(imageContents as any[]),
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "product_extraction",
        strict: true,
        schema: PRODUCT_EXTRACTION_SCHEMA,
      },
    },
    temperature: 0.1,
    max_tokens: 8192,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from Vision model");
  
  const parsed = JSON.parse(content);
  return parsed.products || [];
}

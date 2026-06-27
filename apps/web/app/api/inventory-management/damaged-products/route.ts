import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const damagedProductSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  proofUrl: z.string().url(),
  note: z.string().trim().max(500).optional().nullable(),
});

function isPrntScUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "prnt.sc" || parsed.hostname === "www.prnt.sc")
    );
  } catch {
    return false;
  }
}

async function resolvePrntScImage(requestUrl: string, proofUrl: string) {
  const origin = new URL(requestUrl).origin;
  const response = await fetch(
    `${origin}/api/prntsc?url=${encodeURIComponent(proofUrl)}&json=true`,
    { cache: "no-store" },
  );

  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as {
    imageUrl?: string;
  } | null;
  return payload?.imageUrl ?? null;
}

function buildDamageNote(input: {
  note: string | null;
  proofUrl: string;
  resolvedProofImageUrl: string;
}) {
  const lines = [
    input.note,
    `Proof URL: ${input.proofUrl}`,
    `Resolved proof: ${input.resolvedProofImageUrl}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const body = await request.json();
    const input = damagedProductSchema.parse(body);
    if (!user.storeId) {
      return NextResponse.json(
        { message: "Inventory workflow requires a store-scoped user" },
        { status: 403 },
      );
    }
    const storeId = user.storeId;

    if (!isPrntScUrl(input.proofUrl)) {
      return NextResponse.json(
        { message: "Proof URL must be a prnt.sc URL" },
        { status: 422 },
      );
    }

    const resolvedProofImageUrl = await resolvePrntScImage(
      request.url,
      input.proofUrl,
    );
    if (!resolvedProofImageUrl) {
      return NextResponse.json(
        { message: "Proof image could not be resolved" },
        { status: 422 },
      );
    }

    const product = await db.product.findFirst({
      where: { id: input.productId, storeId },
      select: { id: true, stock: true, costPrice: true },
    });
    if (!product) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 });
    }
    if (input.quantity > product.stock) {
      return NextResponse.json(
        {
          message: "Quantity exceeds available stock",
          available: product.stock,
          requested: input.quantity,
        },
        { status: 422 },
      );
    }

    const unitCost =
      product.costPrice === null
        ? null
        : Number(product.costPrice.toString());

    const log = await db.inventoryLog.create({
      data: {
        productId: input.productId,
        type: "OUT",
        reason: "WASTE",
        quantity: input.quantity,
        unitCost,
        note: buildDamageNote({
          note: input.note?.trim() || null,
          proofUrl: input.proofUrl,
          resolvedProofImageUrl,
        }),
        createdBy: user.id,
        person: user.name,
        status: "PENDING",
        approvedBy: null,
        approverName: null,
        decidedAt: null,
      },
    });

    return NextResponse.json({ data: log }, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { message: "Failed to report damaged product" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { jakartaWeekKey } from "@/features/inventory-management/helpers/inventory-management-rules";

const proofSchema = z.object({
  proofUrl: z.string().url(),
  note: z.string().trim().max(500).optional().nullable(),
  now: z.string().datetime().optional(),
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

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const body = await request.json();
    const input = proofSchema.parse(body);
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

    const submittedAt = input.now ? new Date(input.now) : new Date();
    const periodKey = jakartaWeekKey(submittedAt);
    const note = input.note?.trim() || null;

    const task = await db.inventoryTask.upsert({
      where: {
        storeId_type_periodKey: {
          storeId,
          type: "WEEKLY_CLEANING_PROOF",
          periodKey,
        },
      },
      create: {
        storeId,
        type: "WEEKLY_CLEANING_PROOF",
        periodType: "WEEKLY",
        periodKey,
        status: "SUBMITTED",
        proofUrl: input.proofUrl,
        resolvedProofImageUrl,
        note,
        submittedBy: user.id,
        submittedAt,
      },
      update: {
        status: "SUBMITTED",
        proofUrl: input.proofUrl,
        resolvedProofImageUrl,
        note,
        submittedBy: user.id,
        submittedAt,
      },
    });

    return NextResponse.json({ data: task });
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
      { message: "Failed to submit weekly cleaning proof" },
      { status: 500 },
    );
  }
}

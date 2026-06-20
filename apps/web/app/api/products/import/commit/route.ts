import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  commitProductImportInChunks,
  productImportCommitSchema,
} from "@/features/product-import/services/product-import-commit-service";
import { productImportCommitErrorResponse } from "./errors";

const logger = getLogger("api:products:import:commit");

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const user = await requirePermission("product", "create");
    const input = productImportCommitSchema.parse(await request.json());

    logger.info("product.import.commit.started", {
      userId: user.id,
      storeId: user.storeId || "store-main",
      rowCount: input.rows.length,
      decisionCount: Object.keys(input.decisions).length,
      createMissingCategories: input.createMissingCategories,
    });

    if (input.rows.length === 0) {
      return NextResponse.json({ message: "No rows to import" }, { status: 422 });
    }

    const result = await commitProductImportInChunks(input, user);

    logger.info("product.import.commit.completed", {
      userId: user.id,
      storeId: user.storeId || "store-main",
      rowCount: input.rows.length,
      batchOperationId: result.batchOperationId,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 },
      );
    }
    if (error instanceof Error) {
      const known = productImportCommitErrorResponse(error);
      if (known) return known;
    }

    logger.error("product.import.commit.failed", {
      error,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { message: "Failed to commit product import" },
      { status: 500 },
    );
  }
}

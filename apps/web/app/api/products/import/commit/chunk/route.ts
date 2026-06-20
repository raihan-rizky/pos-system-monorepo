import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  commitProductImportChunk,
  productImportChunkSchema,
} from "@/features/product-import/services/product-import-commit-service";
import { productImportCommitErrorResponse } from "../errors";

const logger = getLogger("api:products:import:commit:chunk");

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "create");
    const input = productImportChunkSchema.parse(await request.json());

    const result = await commitProductImportChunk(input, user);
    logger.info("product.import.commit.chunk.completed", {
      userId: user.id,
      storeId: user.storeId || "store-main",
      batchOperationId: result.batchOperationId,
      processedRows: result.processedRows,
      nextCursor: result.nextCursor,
      done: result.done,
    });
    return NextResponse.json(result);
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
    logger.error("product.import.commit.chunk.failed", { error });
    return NextResponse.json({ message: "Failed to commit product import chunk" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  productImportStartSchema,
  startProductImportCommit,
} from "@/features/product-import/services/product-import-commit-service";
import { productImportCommitErrorResponse } from "../errors";

const logger = getLogger("api:products:import:commit:start");

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "create");
    const input = productImportStartSchema.parse(await request.json());
    if (input.rows.length === 0) {
      return NextResponse.json({ message: "No rows to import" }, { status: 422 });
    }

    const result = await startProductImportCommit(input, user);
    logger.info("product.import.commit.start.completed", {
      userId: user.id,
      storeId: user.storeId || "store-main",
      rowCount: input.rows.length,
      batchOperationId: result.batchOperationId,
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
    logger.error("product.import.commit.start.failed", { error });
    return NextResponse.json({ message: "Failed to start product import" }, { status: 500 });
  }
}

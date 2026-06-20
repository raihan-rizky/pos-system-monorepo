import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  finishProductImportCommit,
  productImportFinishSchema,
} from "@/features/product-import/services/product-import-commit-service";
import { productImportCommitErrorResponse } from "../errors";

const logger = getLogger("api:products:import:commit:finish");

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "create");
    const input = productImportFinishSchema.parse(await request.json());
    const result = await finishProductImportCommit(input, user);
    logger.info("product.import.commit.finish.completed", {
      userId: user.id,
      storeId: user.storeId || "store-main",
      batchOperationId: result.batchOperationId,
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
    logger.error("product.import.commit.finish.failed", { error });
    return NextResponse.json({ message: "Failed to finish product import" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  createProductImportJob,
  productImportJobCreateSchema,
} from "@/features/product-import/services/product-import-job-service";
import { productImportCommitErrorResponse } from "../commit/errors";

const logger = getLogger("api:products:import:jobs");

export const dynamic = "force-dynamic";

function jobErrorResponse(error: Error) {
  if (error.message.startsWith("ACTIVE_PRODUCT_IMPORT_JOB:")) {
    const [, jobId, status] = error.message.split(":");
    return NextResponse.json(
      {
        message: "A product import job is already active for this store",
        jobId,
        status,
      },
      { status: 409 },
    );
  }
  return productImportCommitErrorResponse(error);
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "create");
    const input = productImportJobCreateSchema.parse(await request.json());
    if (input.rows.length === 0) {
      return NextResponse.json({ message: "No rows to import" }, { status: 422 });
    }

    const job = await createProductImportJob(input, user);
    return NextResponse.json(job, { status: 201 });
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
      const known = jobErrorResponse(error);
      if (known) return known;
    }
    logger.error("product.import.job.create.failed", { error });
    return NextResponse.json({ message: "Failed to create product import job" }, { status: 500 });
  }
}

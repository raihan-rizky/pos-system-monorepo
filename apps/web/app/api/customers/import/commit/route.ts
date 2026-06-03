import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import {
  MAX_CUSTOMER_IMPORT_ROWS,
  importRowCommitSchema,
} from "@/features/customer-import/helpers/import-core";
import { toDbCustomerType } from "@/lib/customers";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:customers:import:commit");

const commitSchema = z.object({
  rows: z.array(importRowCommitSchema).max(MAX_CUSTOMER_IMPORT_ROWS),
  decisions: z
    .record(z.string(), z.enum(["create", "update", "skip"]))
    .default({}),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const user = await requirePermission("customer", "create");
    const { rows, decisions } = commitSchema.parse(await request.json());
    const storeId = user.storeId || "store-main";

    log.info("customer.import.commit.started", {
      userId: user.id,
      storeId,
      rowCount: rows.length,
      decisionCount: Object.keys(decisions).length,
      requestedCreateCount: Object.values(decisions).filter((value) => value === "create").length,
      requestedUpdateCount: Object.values(decisions).filter((value) => value === "update").length,
      requestedSkipCount: Object.values(decisions).filter((value) => value === "skip").length,
    });

    if (rows.length === 0) {
      log.warn("customer.import.commit.empty_rows", {
        userId: user.id,
        storeId,
      });
      return apiError("No rows to import", 422, {
        code: "ValidationError",
        errors: { rows: ["At least one row is required"] },
      });
    }

    const activeRows = rows.filter((row) => {
      const fallback =
        !row.existingCustomerId && !row.duplicateInFile ? "create" : undefined;
      const decision = decisions[String(row.rowNumber)] ?? fallback;
      return decision !== "skip";
    });

    const duplicatePhones = Array.from(
      activeRows.reduce((counts, row) => {
        if (!row.phone) return counts;
        counts.set(row.phone, (counts.get(row.phone) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
    )
      .filter(([, count]) => count > 1)
      .map(([phone]) => phone);

    if (duplicatePhones.length > 0) {
      log.warn("customer.import.commit.duplicate_phones", {
        userId: user.id,
        storeId,
        duplicatePhoneCount: duplicatePhones.length,
        duplicateRowCount: activeRows.filter((row) => row.phone && duplicatePhones.includes(row.phone)).length,
        durationMs: Date.now() - startedAt,
      });
      return apiError("Import contains duplicate phone numbers. Mark extra rows as skip.", 409, {
        code: "Conflict",
        extra: { duplicatePhones },
      });
    }

    const result = await db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const phones = Array.from(
          new Set(rows.map((row) => row.phone).filter(Boolean)),
        ) as string[];
        const existingCustomers = await tx.customer.findMany({
          where: { storeId, phone: { in: phones } },
        });
        const existingByPhone = new Map(
          existingCustomers
            .filter((customer) => Boolean(customer.phone))
            .map((customer) => [customer.phone as string, customer]),
        );

        let createdCustomerCount = 0;
        let updatedCustomerCount = 0;
        let skippedRowCount = 0;
          const failedRowCount = 0;

        for (const row of rows) {
          const existing = row.phone ? existingByPhone.get(row.phone) : undefined;
          const fallback =
            !row.existingCustomerId && !row.duplicateInFile ? "create" : undefined;
          const decision = decisions[String(row.rowNumber)] ?? fallback;

          if (!decision) {
            throw new Error(`ROW_DECISION_REQUIRED:${row.rowNumber}`);
          }

          if (decision === "skip") {
            skippedRowCount += 1;
            continue;
          }

          if (existing && decision !== "update") {
            throw new Error(`INVALID_ROW_DECISION:${row.rowNumber}`);
          }

          if (!existing && decision !== "create") {
            throw new Error(`INVALID_ROW_DECISION:${row.rowNumber}`);
          }

          const payload = {
            name: row.name,
            phone: row.phone ?? null,
            email: row.email ?? null,
            company: row.company ?? null,
            address: row.address ?? null,
            type: toDbCustomerType(row.type),
            notes: row.notes ?? null,
          };

          if (existing) {
            await tx.customer.update({
              where: { id: existing.id },
              data: payload,
            });
            updatedCustomerCount += 1;
          } else {
            await tx.customer.create({
              data: {
                ...payload,
                storeId,
              },
            });
            createdCustomerCount += 1;
          }
        }

        return {
          createdCustomerCount,
          updatedCustomerCount,
          skippedRowCount,
          failedRowCount,
        };
      },
      {
        maxWait: 15000,
        timeout: 180000,
      },
    );

    log.info("customer.import.commit.completed", {
      userId: user.id,
      storeId,
      rowCount: rows.length,
      ...result,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      log.warn("customer.import.commit.validation_failed", {
        errors: error.flatten().fieldErrors,
        durationMs: Date.now() - startedAt,
      });
      return apiValidationError(error);
    }

    if (error instanceof Error) {
      if (error.message.startsWith("ROW_DECISION_REQUIRED:")) {
        const rowNumber = Number(
          error.message.replace("ROW_DECISION_REQUIRED:", ""),
        );
        log.warn("customer.import.commit.row_decision_required", {
          rowNumber,
          durationMs: Date.now() - startedAt,
        });
        return apiError("Some rows still require an import decision", 409, {
          code: "Conflict",
          extra: { rowNumber },
        });
      }

      if (error.message.startsWith("INVALID_ROW_DECISION:")) {
        const rowNumber = Number(
          error.message.replace("INVALID_ROW_DECISION:", ""),
        );
        log.warn("customer.import.commit.invalid_row_decision", {
          rowNumber,
          durationMs: Date.now() - startedAt,
        });
        return apiError("Invalid decision for one of the preview rows", 409, {
          code: "Conflict",
          extra: { rowNumber },
        });
      }
    }

    log.error("customer.import.commit.failed", {
      error,
      durationMs: Date.now() - startedAt,
    });
    return apiError("Failed to commit customer import", 500, { code: "InternalError" });
  }
}

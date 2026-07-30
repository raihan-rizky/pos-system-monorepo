import { createClient } from "@supabase/supabase-js";
import { db, Prisma } from "@pos/db";
import {
  parseStorageReferenceNormalizationOptions,
  planMissingStorageReferenceClears,
} from "../features/upload/helpers/storage-reference-normalization-core";
import { listStorageFiles } from "../features/upload/helpers/storage-migration-core.mjs";

function requireEnvironment(names: string[]) {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Environment belum lengkap: ${missing.join(", ")}`);
  }
}

async function main() {
  const options = parseStorageReferenceNormalizationOptions(
    process.argv.slice(2),
  );
  requireEnvironment([
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
  ]);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const bucketName = "pos-media";
  const sourceBaseUrl =
    `${supabaseUrl}/storage/v1/object/public/${bucketName}`;
  const supabase = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const files = await listStorageFiles(
    async (prefix: string, offset: number, limit: number) => {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .list(prefix, {
          limit,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
      if (error) throw error;
      return data;
    },
  );
  const rows = await db.product.findMany({
    where: { imageUrl: { startsWith: `${sourceBaseUrl}/` } },
    select: { id: true, imageUrl: true },
  });
  const plan = planMissingStorageReferenceClears({
    rows,
    availableObjectKeys: new Set(
      files.map((file) => file.objectKey as string),
    ),
    sourceBaseUrl,
  });
  const uniqueLegacyUrls = [...new Set(plan.clears.map((row) => row.before))];
  const statusCounts: Record<string, number> = {};
  for (const url of uniqueLegacyUrls) {
    let status = 0;
    try {
      status = (await fetch(url, { method: "HEAD" })).status;
    } catch {
      status = 0;
    }
    statusCounts[String(status)] = (statusCounts[String(status)] ?? 0) + 1;
    if (![400, 404, 410].includes(status)) {
      throw new Error(
        `Source URL tidak aman untuk di-clear karena HTTP status=${status}.`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? "apply" : "dry-run",
        sourceRows: rows.length,
        plannedClears: plan.clears.length,
        uniqueMissingUrls: uniqueLegacyUrls.length,
        sourceStatusCounts: statusCounts,
        skippedExistingObject: plan.skippedExistingObject,
        skippedInvalidUrl: plan.skippedInvalidUrl,
      },
      null,
      2,
    ),
  );

  if (!options.apply) {
    console.log(
      `Dry-run selesai. Apply hanya dengan --apply --expected-count=${plan.clears.length}.`,
    );
    return;
  }
  if (plan.clears.length !== options.expectedCount) {
    throw new Error(
      `Jumlah candidate berubah: expected=${options.expectedCount}, actual=${plan.clears.length}. Jalankan dry-run ulang.`,
    );
  }

  const clearedRows = await db.$transaction(
    async (transaction) => {
      let count = 0;
      for (const clear of plan.clears) {
        const result = await transaction.product.updateMany({
          where: { id: clear.id, imageUrl: clear.before },
          data: { imageUrl: null },
        });
        if (result.count !== 1) {
          throw new Error(
            `Reference produk berubah saat cleanup: ${clear.id}. Transaction dibatalkan.`,
          );
        }
        count += result.count;
      }
      return count;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );

  console.log(JSON.stringify({ result: { clearedRows } }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });

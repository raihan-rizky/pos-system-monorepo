import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { db, Prisma } from "@pos/db";
import {
  parseStorageReferenceNormalizationOptions,
  planNormalizedStorageReferenceUpdates,
} from "../features/upload/helpers/storage-reference-normalization-core";
import {
  chunkItems,
  listStorageFiles,
} from "../features/upload/helpers/storage-migration-core.mjs";

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
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_ENDPOINT",
    "R2_PUBLIC_BASE_URL",
  ]);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const bucketName = "pos-media";
  const sourceBaseUrl =
    `${supabaseUrl}/storage/v1/object/public/${bucketName}`;
  const targetBaseUrl = process.env.R2_PUBLIC_BASE_URL!;
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
  const filesByObjectKey = new Map(
    files.map((file) => [file.objectKey, file] as const),
  );
  const rows = await db.product.findMany({
    where: { imageUrl: { startsWith: `${sourceBaseUrl}/` } },
    select: { id: true, imageUrl: true },
  });
  const plan = planNormalizedStorageReferenceUpdates({
    rows,
    availableObjectKeys: new Set(filesByObjectKey.keys()),
    sourceBaseUrl,
    targetBaseUrl,
  });
  const uniqueObjectKeys = [...new Set(plan.updates.map((row) => row.objectKey))];

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? "apply" : "dry-run",
        sourceRows: rows.length,
        plannedUpdates: plan.updates.length,
        uniqueObjectsToVerify: uniqueObjectKeys.length,
        skippedMissingObject: plan.skippedMissingObject,
        skippedInvalidUrl: plan.skippedInvalidUrl,
        sourceDeleted: false,
      },
      null,
      2,
    ),
  );

  if (!options.apply) {
    console.log(
      `Dry-run selesai. Apply hanya dengan --apply --expected-count=${plan.updates.length}.`,
    );
    return;
  }
  if (plan.updates.length !== options.expectedCount) {
    throw new Error(
      `Jumlah candidate berubah: expected=${options.expectedCount}, actual=${plan.updates.length}. Jalankan dry-run ulang.`,
    );
  }

  const r2 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  for (const batch of chunkItems(uniqueObjectKeys, 12)) {
    await Promise.all(
      batch.map(async (objectKey: string) => {
        const sourceFile = filesByObjectKey.get(objectKey);
        if (!sourceFile || sourceFile.size <= 0) {
          throw new Error(`Ukuran source tidak valid untuk object: ${objectKey}`);
        }
        const destination = await r2.send(
          new HeadObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: objectKey,
          }),
        );
        if (destination.ContentLength !== sourceFile.size) {
          throw new Error(
            `Ukuran R2 tidak cocok untuk ${objectKey}: source=${sourceFile.size}, r2=${destination.ContentLength ?? "unknown"}`,
          );
        }
      }),
    );
  }

  const updatedRows = await db.$transaction(
    async (transaction) => {
      let count = 0;
      for (const update of plan.updates) {
        const result = await transaction.product.updateMany({
          where: { id: update.id, imageUrl: update.before },
          data: { imageUrl: update.after },
        });
        if (result.count !== 1) {
          throw new Error(
            `Reference produk berubah saat migrasi: ${update.id}. Transaction dibatalkan.`,
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

  console.log(
    JSON.stringify(
      {
        result: {
          verifiedR2Objects: uniqueObjectKeys.length,
          updatedRows,
          sourceDeleted: false,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });

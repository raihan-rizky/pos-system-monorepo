import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { db } from "@pos/db";
import {
  parseStorageSourceCleanupOptions,
  selectLargestStorageObjectsForTarget,
} from "../features/upload/helpers/storage-source-cleanup-core";
import {
  buildPublicObjectUrl,
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
  const options = parseStorageSourceCleanupOptions(process.argv.slice(2));
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
  const supabase = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const listSourceFiles = () =>
    listStorageFiles(
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

  const sourceFiles = await listSourceFiles();
  const plan = selectLargestStorageObjectsForTarget(
    sourceFiles.map((file) => ({
      objectKey: file.objectKey as string,
      size: file.size as number,
    })),
    options.targetBytes,
  );
  if (plan.selectedBytes < options.targetBytes) {
    throw new Error(
      `Source hanya memiliki ${plan.selectedBytes} byte, kurang dari target ${options.targetBytes}.`,
    );
  }

  const [
    productReferences,
    storeLogoReferences,
    settingsLogoReferences,
    inventoryProofReferences,
    inventoryResolvedProofReferences,
    expenseAttachmentReferences,
  ] = await Promise.all([
    db.product.count({
      where: { imageUrl: { startsWith: `${sourceBaseUrl}/` } },
    }),
    db.store.count({
      where: { logoUrl: { startsWith: `${sourceBaseUrl}/` } },
    }),
    db.storeSettings.count({
      where: { logoUrl: { startsWith: `${sourceBaseUrl}/` } },
    }),
    db.inventoryTask.count({
      where: { proofUrl: { startsWith: `${sourceBaseUrl}/` } },
    }),
    db.inventoryTask.count({
      where: { resolvedProofImageUrl: { startsWith: `${sourceBaseUrl}/` } },
    }),
    db.expense.count({
      where: { attachmentUrl: { startsWith: `${sourceBaseUrl}/` } },
    }),
  ]);
  const activeReferences =
    productReferences +
    storeLogoReferences +
    settingsLogoReferences +
    inventoryProofReferences +
    inventoryResolvedProofReferences +
    expenseAttachmentReferences;
  if (activeReferences !== 0) {
    throw new Error(
      `Cleanup dibatalkan: masih ada ${activeReferences} reference Supabase aktif.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? "apply" : "dry-run",
        targetBytes: options.targetBytes,
        selectedFiles: plan.selected.length,
        selectedBytes: plan.selectedBytes,
        sourceFilesBefore: sourceFiles.length,
        sourceBytesBefore: sourceFiles.reduce(
          (total, file) => total + file.size,
          0,
        ),
        activeDatabaseReferences: activeReferences,
        selection: plan.selected,
      },
      null,
      2,
    ),
  );

  if (!options.apply) {
    console.log(
      `Dry-run selesai. Apply hanya dengan --apply --expected-files=${plan.selected.length} --expected-bytes=${plan.selectedBytes}.`,
    );
    return;
  }
  if (
    options.expectedFiles !== plan.selected.length ||
    options.expectedBytes !== plan.selectedBytes
  ) {
    throw new Error(
      `Selection berubah: expectedFiles=${options.expectedFiles}, actualFiles=${plan.selected.length}, expectedBytes=${options.expectedBytes}, actualBytes=${plan.selectedBytes}. Jalankan dry-run ulang.`,
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
  for (const batch of chunkItems(plan.selected, 12)) {
    await Promise.all(
      batch.map(async (file: { objectKey: string; size: number }) => {
        const destination = await r2.send(
          new HeadObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: file.objectKey,
          }),
        );
        if (destination.ContentLength !== file.size) {
          throw new Error(
            `Ukuran R2 tidak cocok untuk ${file.objectKey}: source=${file.size}, r2=${destination.ContentLength ?? "unknown"}`,
          );
        }
        const publicUrl = buildPublicObjectUrl(
          process.env.R2_PUBLIC_BASE_URL!,
          file.objectKey,
        );
        const response = await fetch(publicUrl, { method: "HEAD" });
        if (response.status !== 200) {
          throw new Error(
            `Public R2 belum siap untuk ${file.objectKey}: HTTP ${response.status}.`,
          );
        }
      }),
    );
  }

  let deletedFiles = 0;
  for (const batch of chunkItems(plan.selected, 25)) {
    const objectKeys = batch.map(
      (file: { objectKey: string }) => file.objectKey,
    );
    const { data, error } = await supabase.storage
      .from(bucketName)
      .remove(objectKeys);
    if (error) throw error;
    if (data.length !== objectKeys.length) {
      throw new Error(
        `Delete batch tidak lengkap: requested=${objectKeys.length}, deleted=${data.length}.`,
      );
    }
    deletedFiles += data.length;
  }

  const remainingFiles = await listSourceFiles();
  const remainingObjectKeys = new Set(
    remainingFiles.map((file) => file.objectKey),
  );
  const selectedStillPresent = plan.selected.filter((file) =>
    remainingObjectKeys.has(file.objectKey),
  );
  if (selectedStillPresent.length > 0) {
    throw new Error(
      `Verifikasi delete gagal: ${selectedStillPresent.length} object masih ada di source.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        result: {
          deletedFiles,
          deletedBytes: plan.selectedBytes,
          sourceFilesAfter: remainingFiles.length,
          sourceBytesAfter: remainingFiles.reduce(
            (total, file) => total + file.size,
            0,
          ),
          r2Deleted: false,
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

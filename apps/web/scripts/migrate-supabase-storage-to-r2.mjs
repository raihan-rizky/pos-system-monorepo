import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import {
  buildDestinationObjectKey,
  buildPublicObjectUrl,
  chunkItems,
  formatMigrationError,
  listStorageFiles,
  parseMigrationOptions,
  referenceTargetsForStorageObject,
  shouldReuseExistingObject,
} from "../features/upload/helpers/storage-migration-core.mjs";

function requireEnvironment(names) {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Environment belum lengkap: ${missing.join(", ")}`);
  }
}

async function main() {
  const options = parseMigrationOptions(process.argv.slice(2));
  requireEnvironment(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_KEY"]);
  if (options.apply) {
    requireEnvironment([
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_ENDPOINT",
      "R2_PUBLIC_BASE_URL",
    ]);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const storageObjects = [];
  for (const bucketName of options.bucketNames) {
    const files = await listStorageFiles(async (prefix, offset, limit) => {
      const { data, error } = await supabase.storage.from(bucketName).list(prefix, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      return data;
    });
    storageObjects.push(
      ...files.map((file) => ({
        ...file,
        bucketName,
        destinationObjectKey: buildDestinationObjectKey(
          bucketName,
          file.objectKey,
        ),
      })),
    );
  }

  const totalBytes = storageObjects.reduce((sum, file) => sum + file.size, 0);
  const prefixSummary = Object.entries(
    storageObjects.reduce((summary, file) => {
      const prefix = `${file.bucketName}/${file.objectKey.split("/")[0] || "(root)"}`;
      const current = summary[prefix] ?? { files: 0, bytes: 0 };
      current.files += 1;
      current.bytes += file.size;
      summary[prefix] = current;
      return summary;
    }, {}),
  ).sort(([left], [right]) => left.localeCompare(right));

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? "apply" : "dry-run",
        deleteSource: options.deleteSource,
        buckets: options.bucketNames,
        files: storageObjects.length,
        bytes: totalBytes,
        prefixes: Object.fromEntries(prefixSummary),
      },
      null,
      2,
    ),
  );

  if (!options.apply) {
    console.log(
      "Dry-run selesai. Tambahkan --apply untuk menyalin, lalu --delete-source jika source Supabase juga ingin dihapus.",
    );
    return;
  }

  const r2 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const r2Bucket = process.env.R2_BUCKET_NAME;
  const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  const stats = {
    copied: 0,
    reused: 0,
    deleted: 0,
    databaseReferencesUpdated: 0,
    sourceDeletesSkipped: 0,
    failed: 0,
  };

  const databaseTargets = [
    ...new Map(
      storageObjects
        .flatMap((file) =>
          referenceTargetsForStorageObject(file.bucketName, file.objectKey),
        )
        .map((target) => [`${target.table}.${target.column}`, target]),
    ).values(),
  ];
  for (const target of databaseTargets) {
    const { error } = await supabase
      .from(target.table)
      .select(target.column)
      .limit(1);
    if (error) {
      throw new Error(
        `Preflight database gagal untuk ${target.table}.${target.column}: ${formatMigrationError(error)}`,
      );
    }
  }

  const indexedObjects = storageObjects.map((file, index) => ({ file, index }));
  for (const batch of chunkItems(indexedObjects, 6)) {
    await Promise.all(batch.map(async ({ file, index }) => {
      const progress = `[${index + 1}/${storageObjects.length}] ${file.bucketName}/${file.objectKey} -> ${file.destinationObjectKey}`;
      let stage = "cek object R2";
      try {
      let existingLength;
      try {
        const existingHead = await r2.send(
          new HeadObjectCommand({
            Bucket: r2Bucket,
            Key: file.destinationObjectKey,
          }),
        );
        existingLength = existingHead.ContentLength;
      } catch {
        existingLength = undefined;
      }

      if (shouldReuseExistingObject(file.size, existingLength)) {
        stats.reused += 1;
      } else {
        stage = "download Supabase";
        const { data, error } = await supabase.storage
          .from(file.bucketName)
          .download(file.objectKey);
        if (error) throw error;

        const body = Buffer.from(await data.arrayBuffer());
        stage = "upload R2";
        await r2.send(
          new PutObjectCommand({
            Bucket: r2Bucket,
            Key: file.destinationObjectKey,
            Body: body,
            ContentType: data.type || file.contentType,
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
        stage = "verifikasi R2";
        const head = await r2.send(
          new HeadObjectCommand({
            Bucket: r2Bucket,
            Key: file.destinationObjectKey,
          }),
        );
        if (head.ContentLength !== body.byteLength) {
          throw new Error(
            `Verifikasi ukuran gagal: source=${body.byteLength}, R2=${head.ContentLength ?? "unknown"}`,
          );
        }
      }

      stage = "update database";
      const oldUrl = supabase.storage
        .from(file.bucketName)
        .getPublicUrl(file.objectKey).data.publicUrl;
      const fallbackOldUrl = buildPublicObjectUrl(
        `${supabaseUrl}/storage/v1/object/public/${file.bucketName}`,
        file.objectKey,
      );
      const newUrl = buildPublicObjectUrl(
        r2PublicBaseUrl,
        file.destinationObjectKey,
      );
      const targets = referenceTargetsForStorageObject(
        file.bucketName,
        file.objectKey,
      );

      for (const target of targets) {
        for (const sourceUrl of new Set([oldUrl, fallbackOldUrl])) {
          const { data: updatedRows, error: updateError } = await supabase
            .from(target.table)
            .update({ [target.column]: newUrl })
            .eq(target.column, sourceUrl)
            .select(target.column);
          if (updateError) throw updateError;
          stats.databaseReferencesUpdated += updatedRows?.length ?? 0;
        }
      }

      stats.copied += 1;

      if (options.deleteSource) {
        if (targets.length === 0) {
          stats.sourceDeletesSkipped += 1;
          console.warn(`${progress} copied; source dipertahankan karena namespace belum dipetakan.`);
          return;
        }

        stage = "hapus source Supabase";
        const { error: deleteError } = await supabase.storage
          .from(file.bucketName)
          .remove([file.objectKey]);
        if (deleteError) throw deleteError;
        stats.deleted += 1;
      }

      console.log(`${progress} selesai.`);
      } catch (error) {
        stats.failed += 1;
        console.error(
          `${progress} gagal pada ${stage}: ${formatMigrationError(error)}`,
        );
      }
    }));
  }

  console.log(JSON.stringify({ result: stats }, null, 2));
  if (stats.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

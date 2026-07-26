const PAGE_SIZE = 1_000;

export function chunkItems(items, chunkSize) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("Ukuran batch harus lebih besar dari 0.");
  }

  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export function parseMigrationOptions(args) {
  const apply = args.includes("--apply");
  const deleteSource = args.includes("--delete-source");
  const requestedBuckets = args
    .filter((arg) => arg.startsWith("--bucket="))
    .map((arg) => arg.slice("--bucket=".length).trim())
    .filter(Boolean);
  const bucketNames =
    requestedBuckets.length > 0
      ? [...new Set(requestedBuckets)]
      : ["product-images", "pos-media"];

  if (deleteSource && !apply) {
    throw new Error("--delete-source hanya boleh dipakai bersama --apply.");
  }

  return { apply, deleteSource, bucketNames };
}

export function buildPublicObjectUrl(publicBaseUrl, objectKey) {
  const encodedKey = objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${publicBaseUrl.replace(/\/+$/, "")}/${encodedKey}`;
}

export function formatMigrationError(error) {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error);

  const code =
    typeof error.code === "string" && error.code ? `${error.code}: ` : "";
  const message =
    typeof error.message === "string" && error.message
      ? error.message
      : JSON.stringify(error);
  const hint =
    typeof error.hint === "string" && error.hint
      ? ` (hint: ${error.hint})`
      : "";
  return `${code}${message}${hint}`;
}

export function shouldReuseExistingObject(sourceSize, destinationSize) {
  return sourceSize > 0 && sourceSize === destinationSize;
}

export function buildDestinationObjectKey(bucketName, objectKey) {
  if (bucketName === "product-images") {
    return `products/legacy/${objectKey}`;
  }

  return objectKey;
}

export function referenceTargetsForStorageObject(bucketName, objectKey) {
  if (
    bucketName === "product-images" ||
    (bucketName === "pos-media" && objectKey.startsWith("products/"))
  ) {
    return [
      { table: "pos_products", column: "imageUrl" },
      { table: "StoreSettings", column: "logoUrl" },
    ];
  }

  if (bucketName === "pos-media" && objectKey.startsWith("expenses/")) {
    return [{ table: "pos_expenses", column: "attachmentUrl" }];
  }

  return [];
}

export async function listStorageFiles(listPage) {
  const files = [];

  async function walk(prefix) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const entries = await listPage(prefix, offset, PAGE_SIZE);
      for (const entry of entries) {
        const objectKey = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) {
          await walk(objectKey);
          continue;
        }

        files.push({
          objectKey,
          size: Number(entry.metadata?.size ?? 0),
          contentType:
            entry.metadata?.mimetype ??
            entry.metadata?.contentType ??
            "application/octet-stream",
        });
      }

      if (entries.length < PAGE_SIZE) break;
    }
  }

  await walk("");
  return files.sort((left, right) =>
    left.objectKey.localeCompare(right.objectKey),
  );
}

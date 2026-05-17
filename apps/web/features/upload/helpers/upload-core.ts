export const POS_MEDIA_BUCKET = "pos-media";

type StorageErrorLike = {
  message?: unknown;
  statusCode?: unknown;
  status?: unknown;
  namespace?: unknown;
};

export function isMissingStorageBucketError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const storageError = error as StorageErrorLike;
  const message = typeof storageError.message === "string" ? storageError.message : "";
  const statusCode = String(storageError.statusCode ?? storageError.status ?? "");

  return (
    message.toLowerCase().includes("bucket not found") ||
    (storageError.namespace === "storage" && statusCode === "404")
  );
}

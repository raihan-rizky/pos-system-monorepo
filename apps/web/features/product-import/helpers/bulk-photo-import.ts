const IMAGE_EXTS = /\.(jpe?g|png|webp|gif|avif)$/i;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

/** Strip extension and lowercase — used to derive SKU from filename. */
export function skuFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").toLowerCase().trim();
}

/** Return only image files from a FileList. */
export function filterImageFiles(files: FileList | null): File[] {
  if (!files) return [];
  return Array.from(files).filter(
    (f) => IMAGE_EXTS.test(f.name) && ALLOWED_MIME.has(f.type),
  );
}

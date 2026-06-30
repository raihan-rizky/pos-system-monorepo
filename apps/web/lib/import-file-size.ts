export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export const IMPORT_FILE_TOO_LARGE_MESSAGE =
  "Ukuran file import terlalu besar. Maksimal 5 MB.";

export function isImportFileTooLarge(file: { size: number }): boolean {
  return file.size > MAX_IMPORT_FILE_SIZE_BYTES;
}

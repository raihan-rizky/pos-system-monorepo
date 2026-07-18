import { isPrntScUrl } from "@/lib/prntsc";
import {
  deleteProofFromR2,
  isInvalidProofObjectError,
} from "./r2-proof-storage";

export class UnknownProofReferenceError extends Error {
  constructor() {
    super("Tautan bukti tidak dikenali dan tidak dapat dihapus.");
    this.name = "UnknownProofReferenceError";
  }
}

export function isUnknownProofReferenceError(error: unknown) {
  return error instanceof UnknownProofReferenceError;
}

export async function removeStoredProofAsset(
  url: string,
  deleteR2: typeof deleteProofFromR2 = deleteProofFromR2,
) {
  if (isPrntScUrl(url)) return { storage: "legacy" as const };

  try {
    const result = await deleteR2(url);
    return { storage: "r2" as const, objectKey: result.objectKey };
  } catch (error) {
    if (
      isInvalidProofObjectError(error) ||
      (error instanceof Error && error.name === "InvalidProofObjectError")
    ) {
      throw new UnknownProofReferenceError();
    }
    throw error;
  }
}

import { isPrntScUrl } from "@/lib/prntsc";
import { getR2ProofObjectKey } from "@/features/proof-upload/server/r2-proof-storage";

export function isAllowedManualTransferProof(value: unknown, storeId: string) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string") return false;
  if (isPrntScUrl(value)) return true;
  try {
    const key = getR2ProofObjectKey(value, process.env.R2_PUBLIC_BASE_URL ?? "");
    const scope = storeId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const parts = key.split("/");
    return parts.length === 4 && parts[0] === "proofs" && ["manual-transfers", "expenses"].includes(parts[1]) && parts[2] === scope;
  } catch { return false; }
}

import { isPrntScUrl, resolvePrntScImageUrl } from "@/lib/prntsc";
import { isConfiguredR2PublicUrl } from "../helpers/proof-upload-core";

export async function resolveSubmittedProofImageUrl(rawUrl: string) {
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (publicBaseUrl && isConfiguredR2PublicUrl(rawUrl, publicBaseUrl)) {
    return rawUrl;
  }

  if (isPrntScUrl(rawUrl)) {
    return resolvePrntScImageUrl(rawUrl);
  }

  return null;
}

const PRNTSC_HOSTS = new Set(["prnt.sc", "www.prnt.sc"]);
const ALLOWED_IMAGE_HOSTS = new Set([
  "image.prntscr.com",
  "prnt.sc",
  "www.prnt.sc",
  "img.lightshot.app",
]);

export const PRNTSC_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const PRNTSC_REQUEST_TIMEOUT_MS = 8_000;

export function parseAllowedHttpsUrl(
  rawUrl: string | null,
  allowedHosts: Set<string>,
) {
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return null;
    if (!allowedHosts.has(parsed.hostname.toLowerCase())) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parsePrntScPageUrl(rawUrl: string | null) {
  return parseAllowedHttpsUrl(rawUrl, PRNTSC_HOSTS);
}

export function parsePrntScImageUrl(rawUrl: string | null) {
  return parseAllowedHttpsUrl(rawUrl, ALLOWED_IMAGE_HOSTS);
}

export function isPrntScUrl(rawUrl: string) {
  return Boolean(parsePrntScPageUrl(rawUrl));
}

export function getPrntScProxyUrl(rawUrl: string) {
  const parsed = parsePrntScPageUrl(rawUrl);
  if (!parsed) return null;
  return `/api/prntsc?url=${encodeURIComponent(parsed.toString())}`;
}

export function extractPrntScImageUrl(html: string) {
  const match =
    html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
    html.match(/<meta\s+name="twitter:image:src"\s+content="([^"]+)"/i);
  return match?.[1] ?? null;
}

export async function fetchWithPrntScTimeout(
  url: string,
  init?: RequestInit,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRNTSC_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolvePrntScImageUrl(rawUrl: string) {
  const prntScUrl = parsePrntScPageUrl(rawUrl);
  if (!prntScUrl) return null;

  const response = await fetchWithPrntScTimeout(prntScUrl.toString(), {
    cache: "no-store",
    headers: {
      "User-Agent": PRNTSC_USER_AGENT,
    },
  });

  if (!response.ok) return null;

  const imageUrl = parsePrntScImageUrl(
    extractPrntScImageUrl(await response.text()),
  );
  return imageUrl?.toString() ?? null;
}

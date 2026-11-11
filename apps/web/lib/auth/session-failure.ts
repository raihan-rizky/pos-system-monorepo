export type SessionFailureKind = "transient" | "unauthenticated" | "forbidden" | "invalid";

export const SESSION_VERIFICATION_UNAVAILABLE = "Sesi belum dapat diverifikasi. Silakan coba lagi.";
export const WAIT_FOR_SESSION_RECOVERY = "Tunggu hingga koneksi pulih, lalu coba lagi.";

export function isTransientAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, status, code } = error as { name?: string; status?: number; code?: string };
  return name === "AuthRetryableFetchError"
    || (status === 409 && code === "conflict")
    || status === 429 || status === 502 || status === 503 || status === 504
    || (name === "AuthApiError" && status !== undefined && status >= 500 && status <= 599);
}

export function parseRetryAfter(header: string | null): number {
  if (!header) return 0;
  const ms = /^\d+$/.test(header) ? Number(header) * 1_000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) ? Math.min(2_147_483_647, Math.max(0, ms)) : 0;
}

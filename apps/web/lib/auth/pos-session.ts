import { invalidateOfflineAccess } from "@/public/offline-vault.mjs";

export const POS_IDENTITY_COOKIE_NAMES = [
  "x-pos-role",
  "x-pos-user-id",
  "x-pos-user-name",
  "x-pos-store-id",
] as const;
export const POS_SESSION_ENDED_EVENT = "pos:session-ended";

export function isSupabaseAuthCookieName(name: string): boolean {
  return (
    name === "supabase.auth.token" ||
    (name.startsWith("sb-") && name.includes("auth-token"))
  );
}

export function isSupabaseAuthStorageKey(key: string): boolean {
  return isSupabaseAuthCookieName(key);
}

export function clearClientPosIdentityCookies() {
  if (typeof document === "undefined") return;

  for (const name of POS_IDENTITY_COOKIE_NAMES) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

export function clearClientSupabaseAuthArtifacts() {
  if (typeof document !== "undefined") {
    const cookieNames = document.cookie
      .split(";")
      .map((cookie) => cookie.split("=")[0]?.trim())
      .filter((name): name is string => Boolean(name));

    for (const name of cookieNames) {
      if (isSupabaseAuthCookieName(name)) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    }
  }

  for (const key of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = globalThis[key];
      if (!storage) continue;
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key && isSupabaseAuthStorageKey(key)) {
          storage.removeItem(key);
        }
      }
    } catch {
      // Storage can be unavailable in private mode or blocked contexts.
    }
  }
}

export function clearClientAuthState() {
  if (typeof document !== "undefined") {
    try {
      const cookies = new Map(document.cookie.split(";").map(part => {
        const separator = part.indexOf("=");
        return [part.slice(0, separator).trim(), part.slice(separator + 1)];
      }));
      const cashierId = cookies.get("x-pos-user-id");
      const storeId = cookies.get("x-pos-store-id") || "store-main";
      if (cashierId) {
        void invalidateOfflineAccess(cashierId, storeId).catch(() => undefined);
      }
    } catch { /* Logout should still clear the session when local storage is unavailable. */ }
  }
  clearClientPosIdentityCookies();
  clearClientSupabaseAuthArtifacts();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(POS_SESSION_ENDED_EVENT));
    try {
      // Tabs on this origin share the same cookie session.
      window.localStorage.setItem(POS_SESSION_ENDED_EVENT, String(Date.now()));
    } catch { /* The current tab was already notified. */ }
  }
}

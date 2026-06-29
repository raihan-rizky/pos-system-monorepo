export const POS_IDENTITY_COOKIE_NAMES = [
  "x-pos-role",
  "x-pos-user-id",
  "x-pos-user-name",
  "x-pos-store-id",
] as const;

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

  for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
    if (!storage) continue;

    try {
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
  clearClientPosIdentityCookies();
  clearClientSupabaseAuthArtifacts();
}

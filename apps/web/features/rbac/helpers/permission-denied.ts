/** Revalidate the current role snapshot after an authenticated request loses access. */
export function notifyPermissionDenied(status: number): void {
  if ((status === 401 || status === 403) && typeof window !== "undefined") {
    window.dispatchEvent(new Event("pos:permissions-changed"));
  }
}

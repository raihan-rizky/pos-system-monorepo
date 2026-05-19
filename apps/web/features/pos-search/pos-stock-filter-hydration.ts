/**
 * SSR-safe baseline for the "hide out of stock" toggle.
 *
 * The persisted preference lives in localStorage, which is unavailable during
 * SSR. Reading it inside a useState initializer makes the server render
 * `false` and the client render whatever was saved — a guaranteed React
 * hydration mismatch. This helper returns the same value in both
 * environments; consumers should hydrate the persisted value in a useEffect
 * after mount.
 */
export function getInitialHideOutOfStock(): boolean {
  return false;
}

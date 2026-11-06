const MAX_OFFLINE_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type OfflineSessionHandoff = {
  cashierId: string;
  storeId: string;
  preparedAt: string;
  nonce: string;
};

export function isOfflineSessionUsable(
  session: OfflineSessionHandoff | null | undefined,
  identity: { userId: string | null; storeId: string | null },
  now = new Date(),
) {
  if (!session?.cashierId || !session.storeId || !session.nonce ||
      session.cashierId !== identity.userId || session.storeId !== identity.storeId) return false;
  const age = now.getTime() - Date.parse(session.preparedAt);
  return Number.isFinite(age) && age >= -CLOCK_SKEW_MS && age <= MAX_OFFLINE_SESSION_AGE_MS;
}

export function isOfflinePathAllowed(path: string) {
  return path === "/pos" || path === "/pos/";
}

export function isOfflineActionAllowed(role: string, resource: string, action: string) {
  const transactionResource = role === "SALES" ? "transaction.request" : "transaction";
  return (resource === transactionResource && action === "create") ||
    (resource === "shift" && (action === "create" || action === "read"));
}

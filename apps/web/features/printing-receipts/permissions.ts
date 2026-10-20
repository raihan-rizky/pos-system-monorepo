type WriteAction = "create" | "update" | "delete";

export function getPrintingReceiptWritePermissions(role: string | null, canPerform: (resource: string, action: WriteAction) => boolean) {
  const resource = role === "SALES" ? "transaction.request" : "transaction";
  return { canCreate: canPerform(resource, "create"), canUpdate: canPerform(resource, "update"), canDelete: canPerform("transaction", "delete") };
}

export function getPrintingReceiptScopeKey(scope: { userId: string | null; storeId: string | null; authorizationFingerprint: string | null }) {
  return JSON.stringify([scope.userId, scope.storeId, scope.authorizationFingerprint]);
}

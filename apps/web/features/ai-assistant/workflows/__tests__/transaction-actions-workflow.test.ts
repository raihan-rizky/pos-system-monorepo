import { describe, expect, it } from "vitest";

import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { matchAssistantWorkflow } from "../assistant-workflow-matcher";

describe("transaction actions workflow", () => {
  const permissions = buildDefaultRolePermissions();

  it.each([
    "cara hapus transaksi dengan surat jalan",
    "cara void nota percetakan",
    "cara hapus nota penawaran dengan peringatan stok",
  ])("routes %s to transaction actions instead of printing or delivery creation", (message) => {
    expect(matchAssistantWorkflow({ message, role: "OWNER", permissions }))
      .toMatchObject({
        kind: "matched",
        workflow: { id: "faq-q51-transaction-actions", route: "/history" },
      });
  });

  it("keeps action guidance available to a history reader without approval permission", () => {
    const restricted = buildDefaultRolePermissions();
    restricted.ADMIN.resources["transaction.approve"].update = false;

    expect(matchAssistantWorkflow({
      message: "cara hapus transaksi dengan surat jalan",
      role: "ADMIN",
      permissions: restricted,
    })).toMatchObject({ kind: "matched", workflow: { id: "faq-q51-transaction-actions" } });
  });

  it.each(["ADMIN", "CASHIER", "SALES"] as const)("offers the action guide to %s with explicitly granted transaction permissions", (role) => {
    const granted = buildDefaultRolePermissions();
    granted[role].resources.transaction.read = true;
    granted[role].resources.transaction.update = true;
    granted[role].resources.transaction.delete = true;
    granted[role].resources["transaction.approve"].update = false;

    expect(matchAssistantWorkflow({
      message: "cara void transaksi dengan surat jalan",
      role,
      permissions: granted,
    })).toMatchObject({ kind: "matched", workflow: { id: "faq-q51-transaction-actions" } });
  });

  it("denies the action guide when transaction reading is not permitted", () => {
    const restricted = buildDefaultRolePermissions();
    restricted.ADMIN.resources.transaction.read = false;

    expect(matchAssistantWorkflow({
      message: "cara hapus transaksi dengan surat jalan",
      role: "ADMIN",
      permissions: restricted,
    })).toMatchObject({
      kind: "denied",
      workflow: { id: "faq-q51-transaction-actions" },
      missingRequirements: ["resource:transaction.read"],
    });
  });
});

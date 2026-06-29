import { describe, expect, it } from "vitest";

import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { matchAssistantWorkflow } from "../assistant-workflow-matcher";

describe("assistant workflow matcher", () => {
  const permissions = buildDefaultRolePermissions();

  it("matches a canonical FAQ question to a permitted workflow", () => {
    const result = matchAssistantWorkflow({
      message: "Bagaimana cara menambahkan produk baru ke katalog toko?",
      role: "ADMIN",
      permissions,
    });

    expect(result).toMatchObject({
      kind: "matched",
      workflow: {
        id: "faq-q01-add-product",
        route: "/products",
      },
    });
  });

  it("returns an access denial instead of exposing a restricted workflow as a provider candidate", () => {
    const result = matchAssistantWorkflow({
      message: "cara tambah produk baru",
      role: "CASHIER",
      permissions,
    });

    expect(result).toMatchObject({
      kind: "denied",
      workflow: {
        id: "faq-q01-add-product",
      },
    });
  });

  it("keeps owner-only RBAC workflows out of non-owner candidate sets", () => {
    const result = matchAssistantWorkflow({
      message: "cara mengatur hak akses kasir dan admin di RBAC",
      role: "ADMIN",
      permissions,
    });

    expect(result).toMatchObject({
      kind: "denied",
      workflow: {
        id: "faq-q22-manage-rbac",
      },
    });
  });
});

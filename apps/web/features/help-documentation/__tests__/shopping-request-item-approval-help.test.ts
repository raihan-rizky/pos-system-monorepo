import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Bantuan approval item Permohonan Belanja", () => {
  it("explains edit, quantity preparation, individual approval, and RBAC", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "features/help-documentation/components/HelpContent.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("Isi Jumlah yang Di-ACC");
    expect(source).toContain("Setujui Item");
    expect(source).toContain("Tidak Disetujui");
    expect(source).toContain("supplier.shopping_request.edit");
    expect(source).toContain("supplier.shopping_request.set_approved_qty");
  });
});

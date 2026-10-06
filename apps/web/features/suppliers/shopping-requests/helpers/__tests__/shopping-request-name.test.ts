import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isShoppingRequestNameUniqueConflict,
  resolveShoppingRequestName,
} from "../shopping-request-name";

describe("resolveShoppingRequestName", () => {
  it("uses the document number by default and normalizes custom names", () => {
    expect(resolveShoppingRequestName(undefined, "DPB-202610-001")).toEqual({
      name: "DPB-202610-001",
      normalizedName: "dpb-202610-001",
    });
    expect(
      resolveShoppingRequestName("  Belanja Oktober  ", "DPB-202610-001"),
    ).toEqual({ name: "Belanja Oktober", normalizedName: "belanja oktober" });
  });

  it("recognizes only uniqueness conflicts for the normalized name column", () => {
    expect(
      isShoppingRequestNameUniqueConflict({
        code: "P2002",
        meta: { target: ["storeId", "normalizedName"] },
      }),
    ).toBe(true);
    expect(
      isShoppingRequestNameUniqueConflict({
        code: "P2002",
        meta: { target: ["storeId", "number"] },
      }),
    ).toBe(false);
    expect(isShoppingRequestNameUniqueConflict(new Error("database error"))).toBe(
      false,
    );
  });
});

it("lets users search daftar belanja by its custom name or document number", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "features/suppliers/shopping-requests/components/ShoppingRequestList.tsx",
    ),
    "utf8",
  );

  expect(source).toContain("q: searchQuery.trim() || undefined");
  expect(source).toContain('placeholder="Cari nama atau nomor Daftar Belanja"');
  expect(source).toContain("{row.name}");
  expect(source).toContain("Nomor: {row.number}");
});

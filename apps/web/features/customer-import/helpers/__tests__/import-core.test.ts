import { describe, expect, it } from "vitest";
import { normalizeImportRows } from "../import-core";

describe("customer import normalizeImportRows", () => {
  it("flags duplicate phones and existing matches", () => {
    const result = normalizeImportRows(
      [
        { name: "PT Maju", phone: "0811", type: "industri" },
        { name: "PT Maju 2", phone: "0811", type: "invalid-type" },
      ],
      new Map([["0811", { id: "cust-1", name: "PT Maju Lama" }]]),
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.duplicateInFile).toBe(true);
    expect(result.rows[0]?.existingCustomerId).toBe("cust-1");
    expect(result.rows[0]?.type).toBe("INDUSTRI");
    expect(result.rows[1]?.type).toBe("UMUM");
    expect(result.rows[1]?.warnings).toContain(
      'Unknown customer type "INVALID-TYPE" was replaced with UMUM.',
    );
  });

  it("drops invalid email and allows rows without phone", () => {
    const result = normalizeImportRows(
      [{ name: "Budi", email: "not-an-email", phone: "" }],
      new Map(),
    );

    expect(result.rows[0]?.phone).toBeNull();
    expect(result.rows[0]?.email).toBeNull();
    expect(result.rows[0]?.warnings).toContain(
      "Email was not valid and will be imported as empty.",
    );
  });

  it("marks missing names as blocking errors", () => {
    const result = normalizeImportRows([{ phone: "0812" }], new Map());

    expect(result.rows[0]?.errors).toContain("Name is required.");
    expect(result.errors).toContain("Row 2: Name is required.");
  });
});

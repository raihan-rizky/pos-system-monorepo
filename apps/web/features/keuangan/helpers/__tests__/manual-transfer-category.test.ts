import { describe, expect, it } from "vitest";
import { validateManualTransfer } from "../manual-finance";

const now = new Date("2026-11-16T03:00:00Z");
const input = { applicantName: "Pemasok", description: "Belanja", amount: 125.5, occurredAt: "2026-11-15" };

describe("manual transfer report category", () => {
  it.each(["CETAK_PLAT", "SPANDUK", "ATK", "SALARY"])("accepts and preserves %s", (reportCategory) => {
    expect(validateManualTransfer({ ...input, reportCategory }, now)).toMatchObject({ success: true, data: { reportCategory } });
  });

  it.each([undefined, null, "OTHER", "UNMAPPED", "atk"])("requires a valid category: %s", (reportCategory) => {
    expect(validateManualTransfer({ ...input, reportCategory }, now)).toMatchObject({ success: false, errors: { reportCategory: expect.any(Array) } });
  });
});

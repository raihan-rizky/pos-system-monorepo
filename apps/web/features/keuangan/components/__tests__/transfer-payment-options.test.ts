import { expect, it } from "vitest";
import { canCreatePaymentForPayable } from "../ManualTransferAllocations";

it("menawarkan pembayaran baru pada pelunasan otomatis hanya kepada pengguna berizin koreksi", () => {
  const automatic = { amount: 100, paid: 100, payments: [{ origin: "AUTO" }] };
  expect(canCreatePaymentForPayable(automatic, true, false)).toBe(false);
  expect(canCreatePaymentForPayable(automatic, true, true)).toBe(true);
  expect(canCreatePaymentForPayable({ amount: 100, paid: 50, payments: [] }, true, false)).toBe(true);
  expect(canCreatePaymentForPayable({ amount: 100, paid: 100, payments: [] }, true, true)).toBe(false);
  expect(canCreatePaymentForPayable(automatic, false, true)).toBe(false);
});

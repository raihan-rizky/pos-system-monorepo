import { describe, expect, it } from "vitest";
import {
  registerModalLayer,
  unregisterModalLayer,
} from "../../../../../../packages/ui/src/modal-stack";

describe("modal layer stack", () => {
  it("places a newly opened modal above the dialogs already open", () => {
    const incomeDialog = Symbol("income dialog");
    const receiptDialog = Symbol("receipt dialog");

    try {
      const incomeLayer = registerModalLayer(incomeDialog);
      const receiptLayer = registerModalLayer(receiptDialog);

      expect(receiptLayer).toBeGreaterThan(incomeLayer);
    } finally {
      unregisterModalLayer(receiptDialog);
      unregisterModalLayer(incomeDialog);
    }
  });
});

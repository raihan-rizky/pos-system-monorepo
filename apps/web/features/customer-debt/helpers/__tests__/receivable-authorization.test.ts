import { describe, expect, it } from "vitest";
import { assertReceivableChangeAllowed, effectiveReceivable } from "../receivable-authorization";

const invoice = { status: "DP", paymentMethod: "CASH", total: 100000, amountPaid: 25000, customerId: "c1", customerName: "Budi" };

describe("effective receivable authorization", () => {
  it("requires view and edit to change DP balances", () => {
    for (const [view, edit] of [[true, false], [false, true], [false, false]]) {
      expect(() => assertReceivableChangeAllowed(invoice, {...invoice, total: 120000}, view, edit)).toThrow(/izin/i);
    }
    expect(() => assertReceivableChangeAllowed(invoice, {...invoice, total: 120000}, true, true)).not.toThrow();
  });
  it("allows unchanged debt, cash invoices, and fully paid corrections", () => {
    expect(() => assertReceivableChangeAllowed(invoice, {...invoice}, false, false)).not.toThrow();
    const paid = {...invoice, status: "COMPLETED", amountPaid: 200000};
    expect(() => assertReceivableChangeAllowed(paid, {...paid, total: 120000}, false, false)).not.toThrow();
  });
  it("guards Tempo, status and method changes, including invoices without a linked profile", () => {
    const tempo = {...invoice, status: "COMPLETED", paymentMethod: "TEMPO", customerId: null};
    for (const after of [{...tempo, status: "VOIDED"}, {...tempo, paymentMethod: "CASH"}, {...tempo, total: 90000}]) {
      expect(() => assertReceivableChangeAllowed(tempo, after, true, false)).toThrow();
    }
    const unnamed = {...invoice, customerId: null, customerName: null};
    expect(effectiveReceivable(unnamed).amountCents).toBe(7500000);
    expect(() => assertReceivableChangeAllowed(unnamed, {...unnamed, status: "VOIDED"}, true, false)).toThrow();
  });
  it("guards customer attribution and normalizes legacy names", () => {
    expect(() => assertReceivableChangeAllowed(invoice, {...invoice, customerId: null}, true, false)).toThrow();
    const legacy = {...invoice, customerId: null};
    expect(() => assertReceivableChangeAllowed(legacy, {...legacy, customerName: "Agus"}, true, false)).toThrow();
    expect(() => assertReceivableChangeAllowed(legacy, {...legacy, customerName: "  BUDI  "}, false, false)).not.toThrow();
    expect(() => assertReceivableChangeAllowed(invoice, {...invoice, customerName: "Nama baru"}, false, false)).not.toThrow();
  });
  it("compares at cent precision and ignores attribution for zero balances", () => {
    expect(effectiveReceivable({...invoice, total: 100.105, amountPaid: 25.10}).amountCents).toBe(7501);
    const tiny = {...invoice, total: 100, amountPaid: 99.999};
    expect(effectiveReceivable(tiny)).toEqual({amountCents: 0, attribution: null});
    expect(() => assertReceivableChangeAllowed(tiny, {...tiny, customerId: "c2"}, false, false)).not.toThrow();
  });
});

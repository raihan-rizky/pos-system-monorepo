import { describe, expect, it } from "vitest";
import * as input from "../supplier-payable-input";

type Review = { payableId: string | null; payments: { amount: number; paidAt: string }[] };
type Parse = (body: unknown, today: string) => Review | null;
const parse = (input as unknown as { parseGiroReview?: Parse }).parseGiroReview ?? (() => undefined);
const today = "2026-11-01";

describe("reviewing historic giro payments", () => {
  it("accepts an explicit complete history with dated payments and a selected manual debt", () => {
    expect(parse({ historyComplete: true, payableId: "manual-1", payments: [
      { amount: "30.01", paidAt: "2026-10-20" },
      { amount: 20, paidAt: "2026-11-01" },
    ] }, today)).toEqual({ payableId: "manual-1", payments: [
      { amount: 30.01, paidAt: "2026-10-20" }, { amount: 20, paidAt: "2026-11-01" },
    ] });
  });

  it("allows confirmation that there have been no payments", () => {
    expect(parse({ historyComplete: true, payments: [] }, today)).toEqual({ payableId: null, payments: [] });
  });

  it("parses the displayed payment snapshot separately from newly entered payments", () => {
    expect(parse({ historyComplete: true, payableId: 'manual-1', payments: [{ amount: '30', paidAt: '2026-10-20' }],
      expectedPayments: [{ amount: '10.01', paidAt: '2026-10-15' }] }, today)).toEqual({
      payableId: 'manual-1', payments: [{ amount: 30, paidAt: '2026-10-20' }],
      expectedPayments: [{ amount: 10.01, paidAt: '2026-10-15' }],
    });
  });

  it.each([
    null, {}, [null], [{ amount: 0, paidAt: '2026-10-20' }],
    [{ amount: '1.001', paidAt: '2026-10-20' }],
    [{ amount: 1, paidAt: '2026-11-02' }], [{ amount: 1, paidAt: '2026-02-30' }],
  ])('rejects invalid displayed payment snapshots: %j', expectedPayments => {
    expect(parse({ historyComplete: true, payments: [], expectedPayments }, today)).toBeNull();
  });

  it.each([
    null,
    {},
    { historyComplete: false, payments: [] },
    { historyComplete: true, payableId: 123, payments: [] },
    { historyComplete: true, payments: [{ amount: 0, paidAt: "2026-10-20" }] },
    { historyComplete: true, payments: [{ amount: 1, paidAt: "2026-11-02" }] },
    { historyComplete: true, payments: [{ amount: 1, paidAt: "2026-02-30" }] },
  ])("rejects incomplete or invalid histories: %j", body => {
    expect(parse(body, today)).toBeNull();
  });
});

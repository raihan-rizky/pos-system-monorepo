import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  state: undefined as any,
  ref: undefined as { current: unknown } | undefined,
}));

vi.mock("react", () => ({
  useEffect: (effect: () => void) => harness.effects.push(effect),
  useReducer: (reducer: (state: any, action: any) => any, initialArg: unknown, initialize: (arg: unknown) => any) => {
    if (harness.state === undefined) harness.state = initialize(initialArg);
    return [harness.state, (action: unknown) => { harness.state = reducer(harness.state, action); }];
  },
  useRef: (initial: unknown) => {
    if (harness.ref === undefined) harness.ref = { current: initial };
    return harness.ref;
  },
}));

import { useInvoiceDateInputs } from "../useInvoiceDateInputs";

function useTestHook(open: boolean, now: Date) {
  const result = useInvoiceDateInputs(open, now, false, { preserveOnReopen: true });
  const effects = harness.effects.splice(0);
  effects.forEach(effect => effect());
  return result;
}

describe("useInvoiceDateInputs payment-form retention", () => {
  beforeEach(() => {
    harness.effects = [];
    harness.state = undefined;
    harness.ref = undefined;
  });

  it("preserves edited invoice date and time when the payment form is reopened", () => {
    const firstClock = new Date("2026-10-14T20:30:00Z");
    const firstRender = useTestHook(true, firstClock);
    firstRender.setInvoiceDate("2026-10-10");
    firstRender.setInvoiceTime("12:45");

    useTestHook(false, firstClock);
    useTestHook(true, new Date("2026-10-15T20:30:00Z"));

    expect(useTestHook(true, new Date("2026-10-15T20:30:00Z"))).toMatchObject({
      invoiceDate: "2026-10-10",
      invoiceTime: "12:45",
    });
  });
});

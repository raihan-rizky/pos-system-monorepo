import { describe, expect, it } from "vitest";
import { createInvoiceInputState, invoiceInputReducer } from "../invoice-input-state";

describe("invoice input defaults", () => {
  it("prefills both fields in WIB across a UTC day boundary", () => {
    expect(createInvoiceInputState(new Date("2026-10-14T20:30:00Z"))).toMatchObject({ date: "2026-10-15", time: "03:30" });
  });

  it("replaces the device estimate once synchronized server time arrives", () => {
    const initial = createInvoiceInputState(null);
    const state = invoiceInputReducer(initial, { type: "sync", now: new Date("2026-10-14T20:30:00Z") });
    expect(state).toMatchObject({ date: "2026-10-15", time: "03:30", synchronized: true });
  });

  it("preserves user edits when the initial server clock arrives", () => {
    let state = createInvoiceInputState(null);
    state = invoiceInputReducer(state, { type: "date", value: "2026-10-10" });
    state = invoiceInputReducer(state, { type: "time", value: "" });
    state = invoiceInputReducer(state, { type: "sync", now: new Date("2026-10-14T20:30:00Z") });
    expect(state).toMatchObject({ date: "2026-10-10", time: "" });
  });

  it("keeps the opening time when the live clock ticks", () => {
    const initial = createInvoiceInputState(new Date("2026-10-14T20:30:00Z"));
    expect(invoiceInputReducer(initial, { type: "sync", now: new Date("2026-10-14T20:35:00Z") })).toBe(initial);
  });

  it("takes a fresh snapshot when the form is reopened", () => {
    const initial = createInvoiceInputState(new Date("2026-10-14T20:30:00Z"));
    const state = invoiceInputReducer(initial, { type: "reset", now: new Date("2026-10-15T20:31:00Z") });
    expect(state).toMatchObject({ date: "2026-10-16", time: "03:31", dateEdited: false, timeEdited: false });
  });

  it("accepts a fresh server synchronization after reopening with an old clock snapshot", () => {
    const initial = createInvoiceInputState(new Date("2026-10-14T20:30:00Z"));
    const reopened = invoiceInputReducer(initial, { type: "reset", now: new Date("2026-10-14T20:30:00Z") });
    const synced = invoiceInputReducer(reopened, { type: "sync", now: new Date("2026-10-15T20:31:00Z") });
    expect(synced).toMatchObject({ date: "2026-10-16", time: "03:31" });
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOfflineSyncDecision } from "./offline-sync-core";

const basePayload = {
  clientMutationId: "offline-1",
  createdAt: "2026-05-08T00:00:00.000Z",
  items: [
    { productId: "paper", name: "Paper", price: 10000, quantity: 2 },
    { productId: "ink", name: "Ink", price: 20000, quantity: 1 },
  ],
  discount: 0,
  originalTotal: 40000,
};

test("syncs unchanged offline transaction as completed", () => {
  const decision = buildOfflineSyncDecision(basePayload, {
    now: new Date("2026-05-08T00:01:00.000Z"),
    stockByProductId: new Map([
      ["paper", 10],
      ["ink", 10],
    ]),
  });

  assert.equal(decision.resultStatus, "SYNCED");
  assert.equal(decision.transactionStatus, "COMPLETED");
  assert.equal(decision.total, 40000);
  assert.equal(decision.items.length, 2);
});

test("marks adjusted quantity sync as pending approval when total changes", () => {
  const decision = buildOfflineSyncDecision(basePayload, {
    now: new Date("2026-05-08T00:01:00.000Z"),
    stockByProductId: new Map([
      ["paper", 1],
      ["ink", 1],
    ]),
  });

  assert.equal(decision.resultStatus, "PENDING_APPROVAL");
  assert.equal(decision.transactionStatus, "PENDING_APPROVAL");
  assert.equal(decision.total, 30000);
  assert.deepEqual(
    decision.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    [
      { productId: "paper", quantity: 1 },
      { productId: "ink", quantity: 1 },
    ],
  );
});

test("marks expired offline transaction as pending approval", () => {
  const decision = buildOfflineSyncDecision(basePayload, {
    now: new Date("2026-05-16T00:00:00.000Z"),
    stockByProductId: new Map([
      ["paper", 10],
      ["ink", 10],
    ]),
  });

  assert.equal(decision.resultStatus, "PENDING_APPROVAL");
  assert.equal(decision.transactionStatus, "PENDING_APPROVAL");
  assert.equal(decision.reason, "EXPIRED");
});

test("fails final when stock adjustment removes every item", () => {
  const decision = buildOfflineSyncDecision(basePayload, {
    now: new Date("2026-05-08T00:01:00.000Z"),
    stockByProductId: new Map([
      ["paper", 0],
      ["ink", 0],
    ]),
  });

  assert.equal(decision.resultStatus, "FAILED_FINAL");
  assert.equal(decision.transactionStatus, null);
  assert.equal(decision.reason, "NO_ITEMS_AVAILABLE");
});

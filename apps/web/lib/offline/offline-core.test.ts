import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OFFLINE_QUEUE_LIMIT,
  applySyncResult,
  buildClientMutationId,
  calculateStockAdjustment,
  isExpiredOfflineTransaction,
} from "./offline-core";

test("marks offline transactions older than 7 days as expired", () => {
  const createdAt = "2026-05-01T00:00:00.000Z";
  const now = new Date("2026-05-08T00:00:01.000Z");

  assert.equal(isExpiredOfflineTransaction(createdAt, now), true);
});

test("does not mark offline transactions within 7 days as expired", () => {
  const createdAt = "2026-05-01T00:00:00.000Z";
  const now = new Date("2026-05-07T23:59:59.000Z");

  assert.equal(isExpiredOfflineTransaction(createdAt, now), false);
});

test("keeps offline queue limit at 500 transactions", () => {
  assert.equal(OFFLINE_QUEUE_LIMIT, 500);
});

test("creates one adjusted transaction when stock is partially available", () => {
  const result = calculateStockAdjustment(
    [
      { productId: "paper", name: "Paper", price: 10000, quantity: 3 },
      { productId: "ink", name: "Ink", price: 20000, quantity: 2 },
    ],
    new Map([
      ["paper", 1],
      ["ink", 2],
    ]),
  );

  assert.equal(result.status, "ADJUSTED");
  assert.equal(result.totalChanged, true);
  assert.deepEqual(
    result.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    [
      { productId: "paper", quantity: 1 },
      { productId: "ink", quantity: 2 },
    ],
  );
  assert.deepEqual(result.removedItems, [
    {
      productId: "paper",
      name: "Paper",
      requestedQuantity: 3,
      availableQuantity: 1,
      removedQuantity: 2,
    },
  ]);
});

test("rejects adjusted transaction when no line items remain", () => {
  const result = calculateStockAdjustment(
    [{ productId: "paper", name: "Paper", price: 10000, quantity: 3 }],
    new Map([["paper", 0]]),
  );

  assert.equal(result.status, "REJECTED_EMPTY");
  assert.equal(result.items.length, 0);
});

test("sync result reducer records pending approval details", () => {
  const next = applySyncResult(
    {
      clientMutationId: "offline-1",
      status: "PENDING_SYNC",
      retryCount: 0,
      createdAt: "2026-05-08T00:00:00.000Z",
    },
    {
      status: "PENDING_APPROVAL",
      serverTransactionId: "tx-1",
      message: "Adjusted quantities require approval",
    },
  );

  assert.equal(next.status, "PENDING_APPROVAL");
  assert.equal(next.serverTransactionId, "tx-1");
  assert.equal(next.lastError, null);
});

test("sync result reducer increments retry count for retryable failures", () => {
  const next = applySyncResult(
    {
      clientMutationId: "offline-1",
      status: "PENDING_SYNC",
      retryCount: 1,
      createdAt: "2026-05-08T00:00:00.000Z",
    },
    {
      status: "FAILED_RETRYABLE",
      message: "Network unavailable",
    },
  );

  assert.equal(next.status, "FAILED_RETRYABLE");
  assert.equal(next.retryCount, 2);
  assert.equal(next.lastError, "Network unavailable");
});

test("client mutation ids include timestamp and random parts", () => {
  const id = buildClientMutationId(new Date("2026-05-08T01:02:03.000Z"), () => "abc123");

  assert.equal(id, "offline-20260508010203000-abc123");
});

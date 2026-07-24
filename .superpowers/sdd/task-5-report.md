# Task 5 Report — Review Individual Penerimaan Barang Items

Date: 2026-07-24
Base: `b5338bb` (`fix: guard goods receipt legacy revisions`)

## Outcome

Implemented the item-level review lifecycle for submitted Goods Purchase
receipts:

- approve one item;
- edit one item and reset its review metadata to `PENDING`;
- remove one targeted item while keeping at least one item;
- reject the submitted receipt header with a mandatory reason.

The item routes use the exact required resources:

- approval:
  `inventory.inbound_receipt.approve` / `update`;
- edit and remove:
  `inventory.inbound_receipt.edit` / `update`;
- header rejection:
  `inventory.inbound_receipt.reject` / `update`.

## Locking and Store Scope

Every service mutation runs in one transaction and calls
`lockSubmittedReceipt` before validation or writes. The repository locks the
store-scoped `SUBMITTED` header with `SELECT ... FOR UPDATE`.

Line update/delete predicates additionally constrain:

- line ID;
- receipt ID;
- receipt store ID;
- receipt status `SUBMITTED`.

A missing or no-longer-submitted header returns the friendly `CONFLICT`
response:

```text
Penerimaan Barang sudah tidak menunggu persetujuan
```

## Item Review Behavior

Approval checks current approved quantities against the Goods Purchase ordered
quantity with `hasInboundQuantityConflict`. A stale/conflicting item cannot be
approved.

Edit intentionally behaves differently: the edited value is persisted even
when it is stale, and the response exposes `conflict: true`. Editing any item,
including an already approved item, clears:

```ts
{
  reviewStatus: "PENDING",
  approvedById: null,
  approvedByName: null,
  approvedAt: null,
}
```

Remove deletes only the requested line. A one-line receipt returns
`VALIDATION_ERROR` and remains unchanged.

## Task 6 Finalization Seam

The new item mutation contract is:

```ts
{
  data: { id, status },
  finalized: boolean,
  conflict?: boolean,
}
```

Task 5 item approval only updates line review metadata and returns
`finalized: false`. It does not:

- mutate Product stock;
- mutate Product Stock Group base stock;
- create Inventory Logs;
- create a Batch Operation bundle;
- mark the receipt header approved;
- update Goods Purchase fulfillment.

Task 6 can call `finalizeInboundReceiptIfReady` immediately after
`approveReceiptLine` in the same transaction and replace the current
non-finalized result.

Header rejection locks and atomically changes `SUBMITTED -> REJECTED`. It
returns `finalized: false` and has no inventory side effects.

## TDD Evidence

Initial RED:

```text
Test Files  4 failed (4)
Tests       7 failed | 33 passed (40)
```

The failures were the missing item service exports, missing item routes, and
the old reject mutation/response shape.

Lock-first hardening RED:

```text
Test Files  1 failed (1)
Tests       2 failed | 37 passed (39)
```

Both failures proved invalid edit and rejection inputs were validated before
the submitted header lock. Validation was moved inside the locked
transaction.

## Final Verification

Focused inbound service and all inbound receipt route tests:

```powershell
.\node_modules\.bin\vitest.cmd run features/inventory-management/services/__tests__/inbound-receipt-service.test.ts app/api/inventory-management/inbound-receipts
```

Result: `9 passed`, `58 passed`.

Targeted ESLint over the Task 5 service, repository, types, routes, and tests:

```text
Exit code: 0
No findings
```

Direct web TypeScript:

```powershell
.\node_modules\.bin\tsc.CMD --noEmit
```

Run from `apps/web`. Result: exit code `0`, no diagnostics.

`pnpm build` and `pnpm dev` were not run.

## Self-review

- Header row lock is the first repository operation in every mutation.
- Conflict calculation excludes the current receipt and counts only approved
  receipts.
- Conflicting edit is persisted; conflicting approval is refused.
- Item approval never calls legacy whole-receipt approval.
- Removal cannot delete the last line.
- Reject reason is trimmed and required.
- No Task 5 path writes stock, logs, bundles, expenses, or fulfillment.
- Legacy revision readability remains, while Task 4 guards still block Goods
  Purchase receipts from entering the old revision workflow.
- Unrelated `providers.tsx` and `number-input-guard*` changes were preserved
  and excluded from this task.

No known Task 5 blocker remains. Task 6 still owns atomic final receipt
approval and inventory finalization.

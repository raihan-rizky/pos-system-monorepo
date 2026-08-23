# Transaction-Owned Stock for New Surat Jalan

Date: 2026-08-23
Status: Approved design, pending written-spec review

## Summary

New transactions use the transaction lifecycle as the single source of stock deduction. Creating, approving, printing, or marking a Surat Jalan for those transactions never changes stock. Existing transactions keep the legacy Surat Jalan-managed stock behavior so the release does not reconcile or unexpectedly change historical stock balances.

Surat Jalan is confirmed immediately by default. A new RBAC capability, `surat_jalan.auto_approve` with the `create` action, lets each role be configured to create either `CONFIRMED` or `PENDING` Surat Jalan records.

## Goals

- Deduct stock exactly once for new transactions.
- Keep existing transaction approval semantics:
  - auto-approved `COMPLETED` and `DP` transactions deduct stock when saved;
  - `PENDING_APPROVAL` transactions do not deduct stock until transaction approval;
  - `DRAFT` transactions do not deduct stock until draft approval.
- Make Surat Jalan a delivery document and progress tracker for new transactions, not a second stock mutation trigger.
- Default new Surat Jalan records to `CONFIRMED` while allowing role-level approval requirements through RBAC.
- Preserve the current stock behavior for all transactions that existed before the migration.

## Non-Goals

- Recalculating or reconciling stock for historical transactions.
- Converting historical transactions to the new stock model.
- Changing transaction payment, transaction approval, draft approval, void, delete, or item-edit semantics beyond making their existing stock ownership explicit.
- Adding Surat Jalan cancellation or rejection workflows.
- Changing Surat Jalan marking statuses or the inventory day check-out blocker.

## Data Model

Add a Prisma enum:

```prisma
enum TransactionStockDeductionSource {
  TRANSACTION
  SURAT_JALAN
}
```

Add this required field to `Transaction`:

```prisma
stockDeductionSource TransactionStockDeductionSource @default(TRANSACTION)
```

The migration must preserve release boundaries explicitly:

1. Create `TransactionStockDeductionSource`.
2. Add `stockDeductionSource` as nullable without a default.
3. Set every transaction that exists at migration time to `SURAT_JALAN`.
4. Change the column to `NOT NULL` with database default `TRANSACTION`.

This sequence means every pre-release transaction stays on the legacy behavior, including an old transaction that has not created its first Surat Jalan yet. Every transaction created after migration defaults to transaction-owned stock.

The existing `stockManagedBySuratJalan` field remains temporarily as legacy state. It is only interpreted when `stockDeductionSource` is `SURAT_JALAN`:

- `false`: the old transaction has not yet transferred stock handling to its first Surat Jalan;
- `true`: the old transaction has already completed the invoice reversal and is managed by confirmed legacy deliveries.

For `TRANSACTION` records, `stockManagedBySuratJalan` is ignored and must never be changed by Surat Jalan endpoints.

## RBAC Design

Add `surat_jalan.auto_approve` to the RBAC resource targets. Like `transaction.auto_approve`, only its `create` action is meaningful in the settings matrix.

Default grants:

| Role | `surat_jalan.auto_approve:create` |
| --- | --- |
| OWNER | Allowed implicitly by owner rules |
| ADMIN | Allowed |
| CASHIER | Allowed |
| SALES | Allowed |
| INVENTORY | Not allowed |

The existing permissions retain their responsibilities:

- `surat_jalan:create`: may create a Surat Jalan;
- `surat_jalan:read`: may view Surat Jalan data;
- `surat_jalan:update`: may approve a pending Surat Jalan and perform marking;
- `surat_jalan:delete`: unchanged.

For a new `TRANSACTION`-owned transaction:

- creator has `surat_jalan.auto_approve:create`: create as `CONFIRMED`, set approver metadata to the creator, and set `confirmedAt`;
- creator lacks that capability: create as `PENDING`, leave approver metadata and `confirmedAt` empty.

Legacy `SURAT_JALAN` transactions retain the existing sequence-driven lifecycle because changing it could alter historical stock behavior:

- first Surat Jalan is confirmed and transfers stock ownership using the current reversal flow;
- later Surat Jalan records are pending and use the current stock-deducting approval flow.

## Transaction Stock Workflow

The existing transaction rules remain the authoritative stock workflow for new records.

### Auto-approved transaction

1. User saves the cart.
2. Transaction is stored as `COMPLETED` or `DP` with `stockDeductionSource = TRANSACTION`.
3. Product or stock-group quantities are deducted in the same database transaction.
4. Transaction inventory logs remain the stock audit trail.

### Transaction requiring approval

1. User without `transaction.auto_approve:create` saves the cart.
2. Transaction is stored as `PENDING_APPROVAL` with `stockDeductionSource = TRANSACTION`.
3. No stock is deducted at this point.
4. On transaction approval, stock is deducted exactly once and the transaction becomes `COMPLETED` or `DP`.

### Draft transaction

1. User saves a draft.
2. Transaction is stored as `DRAFT` and no stock changes.
3. Draft approval deducts stock exactly once.

### Follow-up transaction operations

- Editing items on `COMPLETED` or `DP` reconciles only the net quantity difference.
- Editing `PENDING_APPROVAL` or `DRAFT` items changes no stock.
- Voiding or deleting a stock-applied transaction restores the transaction quantities.
- Offline sync follows the same final-status rule: synced approved transactions deduct stock, while synced pending transactions do not.

## Surat Jalan Workflow for New Transactions

### Fetch bundle

The bundle API returns `transaction.stockDeductionSource` so the server planner and UI can branch explicitly. Existing progress fields remain available.

### Create

The create endpoint performs the following for `TRANSACTION` mode:

1. Require `surat_jalan:create`.
2. Validate transaction eligibility (`COMPLETED` or `DP`, product lines present, no printing-service lines, and not fully delivered).
3. Validate at least one positive quantity and ensure no selected quantity exceeds the remaining invoice quantity.
4. Resolve `CONFIRMED` or `PENDING` using `surat_jalan.auto_approve:create`.
5. Store the Surat Jalan and its item snapshots atomically.
6. Do not call product stock mutation helpers.
7. Do not create `SALE`, `SALE_RETURN`, `IN`, or `OUT` inventory logs.
8. Do not update `stockManagedBySuratJalan`.

Stock availability is not validated in this mode because the transaction already owns the stock movement. `stockBefore` and `stockAfter` on new Surat Jalan items are stored as `null` because they are legacy stock snapshots, not meaningful document values.

### Approve

For a pending Surat Jalan attached to a `TRANSACTION`-owned transaction:

1. Require `surat_jalan:update`.
2. Verify the record belongs to the user's store and is still `PENDING`.
3. Recheck that confirmed quantities plus this record's quantities do not exceed invoice quantities.
4. Set status to `CONFIRMED`, approver metadata, and `confirmedAt` atomically.
5. Do not validate current product stock.
6. Do not mutate stock or create inventory logs.

The legacy approval branch remains unchanged for `SURAT_JALAN` transactions.

### Marking

Marking stays independent from approval and stock. It updates only operational status, actor, timestamp, and exception notes. All `UNMARKED` records continue to count toward the inventory day check-out blocker.

## UI Behavior

The Surat Jalan bundle UI branches using `stockDeductionSource`.

### New `TRANSACTION` mode

- Header message: `Stok sudah dicatat saat transaksi disimpan atau disetujui.`
- Quantity table focuses on invoice quantity, confirmed delivery progress, selected delivery quantity, unit, and item notes.
- Hide current-stock and stock-after columns because they imply Surat Jalan controls inventory.
- Remove insufficient-stock validation from the form.
- Remove the stock-reduction confirmation warning.
- Primary confirmation text: `Simpan Surat Jalan`.
- Pending approval remains visible as document approval, not stock approval.

### Legacy `SURAT_JALAN` mode

- Keep the current stock preview, insufficient-stock validation, reversal preview, warning, and stock-oriented confirmation copy.
- Keep the existing first-confirmed/later-pending behavior.

Inventory wording must distinguish document approval from stock approval. Generic copy such as `Approve pengiriman stok keluar` must not describe new transaction-owned Surat Jalan records.

## Error Handling and Atomicity

- Invalid transaction status or unsupported item type returns the current eligibility conflict response.
- Empty quantities or quantities above the invoice remainder return a validation response.
- Missing `surat_jalan.auto_approve` is not an error; it produces a valid `PENDING` document.
- Approval of a non-pending document returns a conflict without side effects.
- Any create or approval failure rolls back the Surat Jalan write and metadata updates.
- Stock mutation errors remain possible only in the legacy `SURAT_JALAN` branch.
- Transaction stock behavior and its existing error responses remain unchanged.

## Test Strategy

Implementation follows test-driven development. Each behavior is introduced with a test that fails for the expected reason before production code changes.

### Data and RBAC tests

- Prisma schema exposes `TransactionStockDeductionSource` and defaults new transactions to `TRANSACTION`.
- Migration marks pre-existing rows as `SURAT_JALAN` before setting the new default.
- RBAC defaults grant `surat_jalan.auto_approve:create` to ADMIN, CASHIER, and SALES, while INVENTORY remains denied.
- RBAC settings render only the meaningful `create` toggle for `surat_jalan.auto_approve`.

### Planner and API tests

- Transaction-owned create with auto-approve produces `CONFIRMED` and no stock movements.
- Transaction-owned create without auto-approve produces `PENDING` and no stock movements.
- Transaction-owned approval confirms the document without stock checks, mutations, or inventory logs.
- Transaction-owned create never changes `stockManagedBySuratJalan`.
- Legacy first create still reverses the invoice and deducts selected delivery quantities.
- Legacy later create remains pending without immediate stock movement.
- Legacy approval still checks and deducts stock.
- Quantity and eligibility validation remains enforced in both modes.

### Transaction regression tests

- Auto-approved transaction save deducts stock.
- `PENDING_APPROVAL` transaction save does not deduct stock.
- Transaction approval deducts stock once.
- Draft save does not deduct stock and draft approval deducts once.
- Offline approved and pending sync paths retain equivalent behavior.
- Item edits and void/delete restoration remain correct for stock-applied statuses.

### UI and documentation tests

- Transaction-owned UI contains document-only wording and no stock-reduction action.
- Legacy UI retains stock warning and preview behavior.
- Help content explains that stock follows transaction save/approval for new transactions.
- AI Assistant help and the guided workflow catalog describe Surat Jalan approval as document approval for new transactions.

## Documentation Updates During Implementation

Because this changes a major existing workflow, implementation must update:

- the repository's required dated markdown feature documentation;
- `apps/web/features/help-documentation/components/HelpContent.tsx`;
- relevant AI Assistant help files;
- `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`.

## Acceptance Criteria

- A new auto-approved transaction deducts stock when saved, and every Surat Jalan action leaves that stock unchanged.
- A new pending transaction leaves stock unchanged until transaction approval, and every later Surat Jalan action leaves that stock unchanged.
- A role with Surat Jalan auto-approve creates a confirmed document; the same role with the permission disabled creates a pending document.
- Approving a pending new-mode Surat Jalan changes document status only.
- Every transaction existing before the migration continues using the current legacy Surat Jalan stock workflow.
- UI copy accurately communicates which workflow applies without implying that new Surat Jalan records reduce stock.

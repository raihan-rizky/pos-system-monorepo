# Batch Product Import and Bulk Stock Plan

## Goal

Speed up catalog migration and daily inventory operations for the POS Products Hub.

Version 1 covers:

- Product import from CSV and Excel `.xlsx`
- Preview and validation before commit
- Per-row duplicate SKU decisions
- Missing category auto-creation after confirmation
- Inventory logs for imported initial stock
- Bulk stock adjustment for selected products
- Undo for the last valid batch while affected products are unchanged

## Confirmed Scope

### Product Import

Supported files:

- `.csv`
- `.xlsx`

Limits:

- Maximum 500 rows per file
- OWNER and ADMIN only

Required columns:

- `name`
- `sku`
- `category`
- `price`
- `stock`
- `unit`

Optional columns:

- `costPrice`
- `minStock`
- `barcode`
- `description`
- `size`
- `material`
- `imageUrl`

Validation behavior:

- Reject the file before preview when required columns are missing.
- Return the exact missing columns to the UI.
- Show a blocking error popup/dialog for missing columns.
- Allow unknown extra columns as warnings.
- Detect duplicate SKUs in the file.
- Detect SKUs already present in the database.
- Require a row decision for each existing SKU: create, update, or skip.
- Revalidate all rows again at commit time.

Commit behavior:

- Create missing categories after preview confirmation.
- Create new products.
- Update existing products only when row decision is `update`.
- Skip rows only when row decision is `skip`.
- Create inventory logs for imported initial stock.
- Record a batch operation and per-product batch items.

### Bulk Stock Adjustment

Supported operations:

- Stock in
- Stock out
- Adjustment

Behavior:

- Starts from selected products in Products Hub.
- Requires preview before commit.
- Blocks negative stock.
- Requires a note or batch reason.
- Creates inventory logs for every affected product.
- Records a batch operation and per-product batch items.

### Undo

Undo is available only when:

- The operation has not already been undone.
- No later batch operation touched any affected product.
- No affected product was manually edited after the batch.
- Imported products have not been used in transaction items.

Undo behavior:

- Restores product data from stored snapshots where safe.
- Applies reversal stock changes through inventory logs.
- Does not delete historical inventory logs.
- Marks the original batch operation as undone.
- Blocks undo and reports affected products when unsafe.

## Proposed Data Model

Add `BatchOperation`:

- `id`
- `type`: `PRODUCT_IMPORT`, `BULK_STOCK_ADJUSTMENT`, `UNDO`
- `status`: `COMMITTED`, `UNDONE`, `UNDO_BLOCKED`
- `storeId`
- `createdBy`
- `summary` as JSON
- `createdAt`
- `undoneAt`
- `undoneBy`
- `undoOfBatchId`

Add `BatchOperationItem`:

- `id`
- `batchOperationId`
- `productId`
- `sku`
- `action`: `CREATE`, `UPDATE`, `SKIP`, `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`, `UNDO`
- `beforeSnapshot` as JSON
- `afterSnapshot` as JSON
- `inventoryLogId`
- `createdAt`

Indexes:

- `BatchOperation.storeId`
- `BatchOperation.createdAt`
- `BatchOperationItem.batchOperationId`
- `BatchOperationItem.productId`
- `BatchOperationItem.productId, createdAt`

## API Design

### Product Import Preview

`POST /api/products/import/preview`

Input:

- Multipart file upload

Output:

- `rows`
- `missingColumns`
- `unknownColumns`
- `warnings`
- `errors`
- `existingSkuMatches`
- `missingCategories`

Missing required columns response:

```json
{
  "code": "MISSING_REQUIRED_COLUMNS",
  "message": "Import file is missing required columns.",
  "missingColumns": ["sku", "price"],
  "requiredColumns": ["name", "sku", "category", "price", "stock", "unit"],
  "unknownColumns": ["supplier"],
  "suggestions": {
    "product_name": "name"
  }
}
```

### Product Import Commit

`POST /api/products/import/commit`

Input:

- Normalized preview rows
- Per-row duplicate decisions
- Confirmation to create missing categories

Output:

- Created product count
- Updated product count
- Skipped row count
- Created category count
- Inventory log count
- Batch operation id
- Undo availability

### Bulk Stock Preview

`POST /api/inventory/bulk/preview`

Input:

- Product ids
- Operation type
- Quantity per product
- Note

Output:

- Before and after stock per product
- Blocking errors
- Warnings

### Bulk Stock Commit

`POST /api/inventory/bulk/commit`

Input:

- Product ids
- Operation type
- Quantity per product
- Note

Output:

- Updated product count
- Inventory log count
- Batch operation id
- Undo availability

### Undo

`POST /api/batch-operations/[id]/undo`

Output:

- Success state
- Reversal inventory log count
- Blocked products when undo is unsafe

## UI Design

Use a data-dense operational dashboard style.

Requirements:

- Compact table-heavy layout
- Lucide icons, no emoji UI icons
- Visible focus states
- Labels for all form fields
- 44px minimum touch targets for primary controls
- Inline row errors near affected fields
- Blocking dialog for missing required columns
- Horizontal scroll only inside preview tables on mobile
- Responsive checks at 375px, 768px, 1024px, and 1440px
- Commit buttons disabled while pending
- Result screen with clear success, warning, and undo state

Product import flow:

1. Upload
2. Map Columns
3. Preview
4. Result

Preview filters:

- Ready
- Errors
- Warnings
- Duplicate SKU
- New Category

Bulk stock flow:

1. Select products in Products Hub
2. Open sticky bulk action bar
3. Configure operation in drawer
4. Preview stock impact
5. Commit result with undo availability

## Frontend Organization

Feature directories:

- `apps/web/features/product-import`
- `apps/web/features/bulk-stock-adjustment`
- `apps/web/features/batch-operations`

Each feature should own:

- `api`
- `components`
- `hooks`
- `types`
- `helpers`

Products page responsibilities:

- Show import entry point
- Manage drawer open/close state
- Pass selected products to bulk stock flow
- Avoid embedding parsing, validation, or mutation logic

Heavy components:

- Lazy-load import drawer
- Lazy-load bulk stock drawer
- Lazy-load large preview table

## Implementation Phases

### Phase 1: Backend Foundation

- Add Prisma models and migration for batch operations.
- Add shared product import row schemas.
- Add shared batch undo eligibility helper.
- Add tests for undo eligibility.

### Phase 2: Import Preview

- Add CSV parser.
- Add XLSX parser.
- Add header normalization.
- Add required-column validation.
- Add row validation.
- Add duplicate SKU and missing category detection.
- Return structured preview payload.

### Phase 3: Import Commit

- Revalidate rows.
- Create missing categories.
- Create/update/skip products transactionally.
- Create initial stock inventory logs.
- Record batch operation and items.
- Return commit summary.

### Phase 4: Bulk Stock Adjustment

- Add bulk stock preview endpoint.
- Add bulk stock commit endpoint.
- Block negative stock.
- Create inventory logs transactionally.
- Record batch operation and items.

### Phase 5: Undo

- Add undo endpoint.
- Block undo when later batch touched affected products.
- Block undo when manual product edits occurred after batch.
- Block unsafe product deletion when imported products have transaction items.
- Write reversal inventory logs.
- Mark batch undone.

### Phase 6: Frontend Import UI

- Add import action to Products Hub.
- Add import drawer.
- Add upload step.
- Add column mapping step.
- Add preview table with status filters.
- Add duplicate SKU row decisions.
- Add missing-column blocking dialog.
- Add commit result screen.

### Phase 7: Frontend Bulk Stock UI

- Add product table selection mode.
- Add sticky bulk action bar.
- Add bulk stock drawer.
- Add preview and commit result.
- Add undo state display.

### Phase 8: Verification

- Backend tests for preview, commit, and undo.
- Frontend tests for missing-column dialog and duplicate SKU decisions.
- Manual responsive QA.
- Type check.
- Build.

## Testing Checklist

Backend:

- Missing required columns reject preview.
- Missing-column response lists exact missing columns.
- CSV and XLSX produce equivalent normalized rows.
- Unknown columns warn but do not reject.
- Duplicate SKUs in file are detected.
- Existing SKUs require row decisions.
- Commit creates categories, products, inventory logs, batch operation, and items.
- Commit updates existing products only with `update`.
- Bulk stock blocks negative stock.
- Undo succeeds when no later changes exist.
- Undo fails when later batch touched the same products.
- Undo fails when manual product update occurred after batch.
- Undo blocks imported products already used in transactions.

Frontend:

- Upload accepts only `.csv` and `.xlsx`.
- Upload step shows required columns.
- Missing required columns open a blocking dialog.
- Preview filters work.
- Duplicate SKU rows require decisions.
- Commit disables while pending.
- Result screen shows summary and undo state.
- Bulk action bar appears only with selected products.
- Keyboard navigation follows visual order.
- Focus rings are visible.

## Non-Goals For Version 1

- Background import jobs
- Imports over 500 rows
- Raw file retention
- Marketplace/accounting integrations
- Offline batch import
- Arbitrary historical undo
- Fully configurable role permissions

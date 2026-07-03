# Bulk & Grup Stok Product-First Design - 2026-07-03

## Understanding Summary

- Improve the Inventory page transaction tab `Bulk & Grup Stok`.
- Change the workflow from stock-group search to product search.
- Allow users to select multiple products and configure each selected product independently.
- Each selected product has its own action, stock input, note, and stock mode.
- Supported actions are `IN`, `OUT`, and `ADJUSTMENT`.
- `ADJUSTMENT` means the new final stock for the selected product unit.
- All stock changes follow the existing approval flow before actual stock changes are applied.

## User-Facing Modes

Use these labels in the UI:

- `Stok Bersama`
- `Stok Produk Ini`

Add tooltips:

- `Stok Bersama`: Perubahan mengikuti stok grup dan akan ikut menghitung dampak ke varian lain dalam grup.
- `Stok Produk Ini`: Perubahan hanya dicatat untuk produk ini dan tidak mengubah stok grup.

The UI should not use the word `shared`.

## Behavioral Rules

### Product Selection

- The user searches and selects products.
- Selected products appear as editable rows.
- Each selected product row has its own stock input.
- Each selected product row has its own `Stok Bersama` or `Stok Produk Ini` option.
- Block duplicate exact products by product identity, name, SKU, and unit.
- Products with the same name but different units are allowed.

### Same Stock Group Conflict

- If two selected variants belong to the same stock group and both use `Stok Bersama`, block submit.
- Show a clear validation message such as: `Pilih satu produk saja per grup stok untuk mode Stok Bersama.`
- Different rows from the same group may coexist only when the conflict rule above is not violated.

### Stock Action Semantics

- `IN`: add the input quantity to current stock.
- `OUT`: subtract the input quantity from current stock.
- `ADJUSTMENT`: set the final stock to the input quantity.

### Stok Bersama

- For grouped products, calculate the new stock-group base stock from the selected product and its `unitMultiplierToBase`.
- Expand preview to every active variant in the stock group.
- Create stock logs for every affected variant.
- Bundle these logs in Stock Log using `BatchOperation` and `BatchOperationItem`.
- On approval, recompute from current stock, update `ProductStockGroup.baseStock`, update snapshots/log quantities as needed, then approve the affected logs.
- If stock changed while the request was pending, approval should use the latest stock state.

### Stok Produk Ini

- Create only one stock log for the selected product.
- Do not create a bundle in Stock Log.
- Do not update `ProductStockGroup.baseStock`.
- Append note metadata such as: `Mode: Stok Produk Ini - stok grup tidak diubah`.
- If the product is grouped, this mode is intentionally log-only for the stock-group base value.

## Recommended Architecture

Extend the existing stock-group bulk flow instead of creating a separate workflow.

Current relevant files:

- `apps/web/features/inventory-management/components/StockGroupBulkPanel.tsx`
- `apps/web/features/inventory-management/helpers/stock-group-bulk.ts`
- `apps/web/app/api/inventory-management/stock-group-bulk/route.ts`
- `apps/web/app/api/inventory-management/stock-group-bulk/[batchId]/approve/route.ts`
- `apps/web/features/product-stock-groups/stock-mutations.ts`
- `apps/web/app/(main)/inventory/StockLogsTab.tsx`

The request shape should become product-row based:

```ts
{
  action: "preview" | "submit";
  rows: Array<{
    productId: string;
    mode: "GROUP_STOCK" | "PRODUCT_ONLY";
    type: "IN" | "OUT" | "ADJUSTMENT";
    inputValue: number;
    note?: string | null;
  }>;
}
```

Use internal enum-like values such as `GROUP_STOCK` and `PRODUCT_ONLY`, while keeping the user-facing labels as `Stok Bersama` and `Stok Produk Ini`.

## UI Design

The panel should become a product-first multi-row workspace.

Left side:

- Product search/add control.
- Editable rows for selected products.
- Each row shows product name, SKU, unit, current stock, action type, stock input, stock mode, note, and remove button.
- Validation messages appear near the affected row and in a submit summary.

Right side:

- Real-time impact preview.
- One collapsible section per selected product.
- `Stok Bersama` sections show all affected variants.
- `Stok Produk Ini` sections show only the selected product and a clear note that stock-group stock is unchanged.

Submit is disabled when:

- Exact duplicate product exists.
- More than one selected row from the same stock group uses `Stok Bersama`.
- Required conversion needs review.
- Any result would make stock negative.
- No meaningful stock change exists.

## API Flow

### Preview

1. Validate row input.
2. Load products by store with stock group and active variants.
3. Check exact duplicates.
4. Check same-group `Stok Bersama` conflicts.
5. Build row previews.
6. Return grouped preview sections to the UI.

### Submit

1. Re-run the same validation and preview calculation.
2. Create one pending bundle for all `Stok Bersama` rows that need bundled logs.
3. Create `InventoryLog` plus `BatchOperationItem` rows for every affected bundled variant.
4. Create standalone pending `InventoryLog` rows for `Stok Produk Ini`.
5. Return bundle IDs and standalone log IDs for UI confirmation.

### Approval

- `Stok Bersama` approvals use the existing bundled approval surface.
- Approval recomputes impact from current stock group state.
- Approval updates `ProductStockGroup.baseStock` for each approved bundled row.
- `Stok Produk Ini` logs remain standalone and are approved through the normal individual stock-log approval flow.

## Testing Strategy

Follow the repository TDD rule during implementation.

Helper tests:

- `IN`, `OUT`, and `ADJUSTMENT` calculations.
- `Stok Bersama` variant expansion.
- `Stok Produk Ini` single-product preview.
- Exact duplicate product blocking.
- Same stock group plus multiple `Stok Bersama` rows blocked.
- Conversion-needs-review blocked.
- Negative stock blocked.

API tests:

- Preview returns product-row impact sections.
- Submit creates bundled logs for `Stok Bersama`.
- Submit creates standalone logs for `Stok Produk Ini`.
- Mixed submit creates both outputs correctly.
- Approval recomputes from current stock and updates snapshots/log quantities.

Component tests:

- Product search workflow renders.
- Selected rows have independent action, input, mode, and note controls.
- Tooltips for `Stok Bersama` and `Stok Produk Ini` render.
- Real-time preview updates when a row changes.
- Duplicate and same-group conflict messages render.

## Documentation Follow-Up

When implemented:

- Update the Bantuan inventory content in `apps/web/features/help-documentation/components/HelpContent.tsx`.
- Update or add any relevant markdown documentation in `markdown-files`.
- Update the AI Assistant workflow catalog only if a guided workflow is added or changed.

## Assumptions

- Normal application scale is sufficient; no special high-volume batch optimization is required for this feature.
- No new sensitive data is introduced.
- Existing inventory permissions and approval permissions remain the authorization model.
- Writes should remain transactional.
- `Stok Produk Ini` does not require schema changes because it records intent in the stock log note.
- The existing display model may still show grouped products from `ProductStockGroup.baseStock`; this is accepted for `Stok Produk Ini`.

## Risks

- `Stok Produk Ini` for grouped products can create a log whose intent differs from visible group-derived stock. This is an accepted product decision for now.
- Mixed bundled and standalone outputs from one submit require clear success messaging so users understand why some logs appear bundled and others do not.
- Approval must recompute from current stock to avoid stale preview values.
- Same-group `Stok Bersama` conflicts must be blocked before submit to avoid ambiguous final base stock.

## Decision Log

| Decision | Alternatives Considered | Reason |
| --- | --- | --- |
| Use product search first | Search stock group first | User wants selected products as the primary workflow. |
| Support multiple selected products | Single product/group only | User wants rows for multiple selected products. |
| Support `IN`, `OUT`, `ADJUSTMENT` | `OUT` and `ADJUSTMENT` only | User selected the broader stock action set. |
| `ADJUSTMENT` means final stock | Signed delta adjustment | Final stock matches user intent and current panel mental model. |
| Use `Stok Bersama` / `Stok Produk Ini` labels | Use `shared` wording | User explicitly rejected `shared` text. |
| Add tooltips for both modes | No explanations | Mode behavior is important and can otherwise be misunderstood. |
| Bundle `Stok Bersama` stock logs | Standalone logs for all rows | User wants group-stock changes bundled in Stock Log. |
| Keep `Stok Produk Ini` standalone | Bundle all logs together | User wants product-only changes not bundled. |
| Block exact duplicate products | Allow duplicate rows | Prevent duplicate/confusing operations. |
| Allow same name with different unit | Block by name only | Different units are valid variants. |
| Block same stock group with multiple `Stok Bersama` rows | Sequential or last-write-wins | One stock group has one `baseStock`, so multiple shared rows are ambiguous. |
| No schema change for `Stok Produk Ini` | Independent stock mode schema | User chose log-note behavior without changing group display model. |

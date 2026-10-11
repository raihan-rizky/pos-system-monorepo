# Optional product units: approved design

Date: 2026-10-11 (Asia/Jakarta)
Project: pos-system-monorepo
Status: design approved in conversation; written specification pending user review.

## Objective and approved decisions

On the Products page, a user creating a product can optionally add other selling units in the same form. The original unit may be smaller or larger than an added unit. Saving creates the product's unit variants together in one shared stock group.

The user approved a selling price for each additional unit, suggested from the conversion ratio and editable independently. The user approved the inline design and requested distinct badges for small and big units. Antislop applies during design and implementation. Conversation remains English; application labels, help, validation, and errors use friendly Indonesian.

## Existing behavior and scope

The Products page uses `apps/web/components/inventory/ProductFormModal.tsx`. An existing optional smallest-unit section becomes available only when `unitMultiplierToBase` exceeds one. The create API accepts a single `smallestUnitVariant` and creates two products in one stock group transaction. Local main, origin/main, and both registered Supplier worktrees already contain this partial feature.

Extend this creation flow rather than creating a second product editor. Preserve existing single-unit creation, product editing, and existing stock-group management. Preserve the legacy `smallestUnitVariant` API contract for current callers. Existing user changes, especially description support in the form, payload, hooks, help, and workflow catalog, must remain intact.

This feature covers the creation modal's unit rows and stock summary. It does not add a separate wizard, redesign product tables or POS cards, or change how existing groups are edited. No new dependencies or database schema migration are expected.

## Form interaction

1. Open the existing Tambah Produk modal. The main product fields remain familiar; the original unit defaults to `pcs`.
2. Always show `Tambah unit lain (opsional)` near the unit input. Additional units are absent by default and are never required.
3. Activating that button appends a removable unit row. Users may repeat this to enter several units, each related directly to the original unit.
4. Show the added unit's name, a plain conversion sentence, and its selling price. A direction selector lets the user choose whether the added unit is larger or smaller than the original unit.
5. Express conversions using a positive count: `1 dus = 12 pcs`. For a larger added unit, one added unit equals the count of original units. For a smaller added unit, one original unit equals the count of added units. The count is at least one; one means equal-sized units. Fractional counts above one are supported where meaningful.
6. Replace the creation form's technical standalone `Isi per Unit Terkecil` field with this explicit conversion interaction. A single unit uses a multiplier of one.
7. Automatically generate each added unit's SKU from the original SKU and unit name using existing repository conventions. Put editable SKU override, optional barcode, and optional HPP under `Detail tambahan`. Never overwrite a manually edited SKU when the unit name changes.
8. Removing every added row returns to ordinary single-unit creation without stale additional-unit payload data.

Keep fields in one column on narrow screens and use the app's existing input, button, modal, spacing, and focus conventions. Adding a row should focus its unit-name field. Removing a focused row should move focus to an appropriate remaining control. Save indicates pending state and prevents duplicate submission; failure retains all entered values.

## Unit badges

Determine badge roles from validated conversion ratios across the current form's units, never from unit-name heuristics.

- The smallest unit or units show `Unit kecil` with a subtle emerald treatment.
- Units larger than the smallest show `Unit besar` with a subtle violet treatment. With more than two sizes, this explicitly means larger than the smallest unit, not necessarily the largest overall.
- If all entered units are equal-sized, show `Unit setara` using neutral styling.
- Before a conversion is valid, use the neutral labels `Unit utama` and `Unit tambahan` rather than claiming a size relationship.
- A form containing only the original unit uses `Unit utama`.

Place compact badges beside the unit headings and in the stock summary. Text distinguishes roles without relying on color; verify contrast and mobile wrapping. Color serves quick comparison, not decoration. Preserve the established modal's visual language: ENERGY 1, RHYTHM 1, MOTION 1, with motion limited to existing hover/focus behavior.

## Suggested prices

Let the original unit's selling price be P and an added unit's quantity relative to one original unit be r. A larger added unit with count c has r = c; a smaller added unit has r = 1 / c. Suggest P * r, rounded to the nearest rupiah.

Update that suggestion when the original price or conversion changes only while the added price remains unedited. Once the user edits a row's price, preserve it, including an explicit zero. Reopening the modal for a new product resets this state. Do not silently derive customer-category prices for added units. Optional HPP remains independently editable and is not required.

Illustrative example: Rp 2,000 per pcs and `1 dus = 12 pcs` suggests Rp 24,000 per dus. The user may set Rp 22,000 per dus, and later changes to the original price must not overwrite that choice.

## Shared stock and server data flow

Enter initial stock once, in the original unit. Added rows never collect separate initial stock quantities, which would risk counting the same inventory twice.

Assign the original unit relative quantity one and derive each added unit's relative quantity from its conversion. Choose the smallest relative quantity as the stock group's base unit and normalize every unit multiplier against it. Compute shared base stock as original initial stock multiplied by the original unit's normalized multiplier. The summary displays equivalent quantities for every valid unit.

Illustrative examples: 24 pcs with `1 dus = 12 pcs` represents 24 pcs or 2 dus. Two dus with that same relationship represents 24 pcs. Both examples use one shared stock balance.

Add an optional list of additional unit variants to the create input and payload. Keep the list absent when unused. Server validation and normalization are authoritative; frontend calculations only provide feedback. When a list is present, create the stock group, original product, additional products, applicable price logs, and group activity atomically in one database transaction. Apply shared name, description, category, brand, image, material, and size to every unit variant.

Reuse existing stock-group keys, SKU conventions, permission checks, activity conventions, and stock display helpers. Preserve the old paired-variant path; reject requests that mix the new list and legacy paired input rather than choosing one silently. If a matching group already exists, preserve the existing conflict behavior and give a clear Indonesian message directing the user to manage that group. Do not attach to an existing group without its conversion and stock safeguards.

After success, invalidate product catalog, stock-group, inventory, price-log, and relevant dashboard queries using existing query keys so the group becomes visible without manual refresh. Return a response compatible with existing create-product callers.

## Validation and failure behavior

- Required added fields are a nonblank unit name, valid conversion, and nonnegative finite selling price.
- Reject duplicate unit names after trimming and case normalization, including duplicates of the original unit.
- Reject blank, zero, negative, or nonfinite conversions; enforce the conversion sentence's count of at least one.
- Validate generated or overridden SKUs for duplicates within the request and against existing products. Handle races with transaction rollback and an actionable conflict error.
- Reject invalid prices or optional HPP and avoid infinities in normalization, suggested prices, and stock calculations.
- Show row errors near the relevant fields and an appropriate form error for API conflicts. Retain form values on all failed saves.
- Do not leave a partially created group or subset of products after any transactional failure.

## Verification and implementation requirements

Follow the repository's test-driven development instructions: add meaningful failing tests and confirm failure before implementation. Cover single-unit behavior, optional row addition/removal, both conversion directions, multiple sizes, equal-size badges, derived badges changing with ratios, generated/manual SKUs, suggestions versus edited prices, shared stock, duplicate and invalid inputs, and atomic rollback.

Run focused helper, form, and API tests, then required type checking and broader regression checks appropriate to the final change. Do not use a production build. Browser verification covers narrow and desktop layouts, keyboard interaction, badge wrapping and contrast, independent prices, saving, and error recovery on a user-managed development server. Do not start or stop that server without authorization.

Refresh GitNexus before editing and run upstream impact analysis for every modified function, class, or method. Report callers, affected processes, and risk, including any HIGH or CRITICAL result. Run change detection before commits and stage only this feature's changes.

Update HelpContent.tsx and the AI Assistant products help. Update workflow-catalog.ts for the changed guided product-creation workflow. Preserve prior reconciled Help and workflow content.

## Workspace and documentation notes

Verified local main after Supplier integration is `939557f`. The preserved user WIP includes the product description changes and several unrelated features. The recorded full suite passed 2,432 tests with ten skipped; generated `.next-e2e` route validators have three previously recorded unrelated errors. These records are not substitutes for validation of this feature.

Repository instructions request documentation in `D:/main_project/pos-system-monorepo/markdown-files`. Drive D is unavailable in the current environment. This specification is saved in the available checkout at `C:/Projects/pos-system-monorepo/markdown-files/product-optional-units-design-2026-10-11.md`; report this location limitation rather than implying the D path was updated.

## Specification self-review

The scope is limited to optional product units during creation. Conversion direction, pricing edit preservation, badge semantics for multiple sizes and equal units, stock normalization, legacy API compatibility, transaction rollback, errors, and verification are specified. No unresolved placeholders remain. Written user review is the next brainstorming checkpoint before the implementation plan.

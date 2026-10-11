# Optional product units implementation

Date: 2026-10-11 (Asia/Jakarta)
Branch: `codex/product-optional-units`
Worktree: `C:/Users/Raihan Rizki/.codex/worktrees/product-optional-units/pos-system-monorepo`

## Delivered behavior

The Products creation form starts with one unit and always offers **Tambah unit lain (opsional)**. Additional units can be larger or smaller than the original unit. Each row shows an explicit conversion, an editable suggested selling price, and a removable unit badge. **Detail tambahan** holds SKU, barcode, and optional HPP.

Smallest units use an emerald **Unit kecil** badge, larger units a violet **Unit besar** badge. Equal-size units use **Unit setara**; incomplete conversions use neutral badges. Roles follow conversion quantities. The stock preview shows every equivalent quantity and badge. For example, 2 dus with 12 pcs per dus represents the same stock as 24 pcs.

Manual price changes, including zero, and manual SKUs survive changes to the original price or conversion. Validation rejects duplicate units/SKUs and invalid conversions, prices, or HPP. Failed saves retain inputs. Hidden HPP errors open the disclosure and focus the invalid field. Rapid submission is guarded.

The API normalizes stock into the smallest unit, then creates the group, products, price logs, and activity within one Prisma transaction. Initial stock is counted once. Existing editing and the legacy paired-unit request remain supported. Product counts, product list, stock-group detail, inventory summary, price history, and dashboard caches refresh after success.

## Verification

- TDD: initial integration tests failed before implementation; separate regression tests reproduced cache refresh, mixed legacy input, missing stock equivalents, hidden HPP validation, and placeholder contrast failures before their fixes.
- Focused helper/payload/API/form run: 65 tests passed. Cache regression passed; help/workflow regression run passed 35 tests.
- Final verification rerun: all 66 helper/payload/API/form/cache tests passed together; the browser regression passed again, source TypeScript passed, and `git diff --check` passed. No further production code changes were needed.
- Final full regression run: **2,472 passed, 10 skipped** across 448 files (446 passed, two skipped). Runtime: 810.01 seconds. A prior run caught the removed storage-help wording; that wording was restored and the affected help tests and full suite rerun successfully.
- Source TypeScript check passes using a temporary configuration that excludes generated Next output. `pnpm type-check --only` reports the same three pre-existing generated validator errors: empty stock-history route and synchronous route params in internal-stock-out approve/reject handlers. Other workspace type-check tasks pass from unchanged cached results.
- Browser regression uses real production React/UI components with in-memory mutation fixtures. It covers optional single-unit save, several units, both conversion directions, manual zero/SKU persistence, barcode/HPP payloads, stock equivalents, duplicate rejection, failed-save retention, retry, repeated-submit guarding, collapsed HPP errors, equal sizes, keyboard focus, and 390px/800px layouts. No store data is created by these tests.
- Live worktree app smoke check at `http://localhost:3004/products`: creation modal opens, optional action appears, addition focuses the unit name, removal restores focus and the original badge. Test inputs were discarded.
- Browser snapshots: `output/playwright/product-units/mobile-small-unit.png` and `desktop-small-unit.png`; both inspected visually. Browser fixture recorded no page errors.
- Read-only code review found two P2 UX issues; both fixes were reviewed and resolved. Database rollback tests simulate transaction commits; no real database mutation/rollback test was performed.
- Isolated GitNexus refresh completed with 9,055 nodes, 21,911 edges, and 300 flows. The first parse-worker startup attempt failed; a verbose single-worker diagnostic retry succeeded without source/tooling changes. FTS remains unavailable; exact symbol queries work. Headroom was used at session start, during large-output reviews, and before handoff.
- Final primary-checkout comparison: 46 of the 49 saved WIP files still match. Three help/catalog files have subsequent unrelated description/unit-badge guidance edits; those edits were preserved. The optional-unit implementation remains isolated and uncommitted because existing files also contain user WIP. No dependencies or database schema were changed; no production build or push was performed.
- Final GitNexus change detection covers the combined checkout, including copied unrelated WIP: 41 tracked files, 55 symbols, 17 flows, critical aggregate risk. This is not a feature-only risk estimate. Exact upstream impact for the new ProductUnitFields component is LOW: one caller, ProductFormModal, and no indexed processes. The feature-only patch is reviewed separately against the saved WIP baseline.
- Headroom tools were available and used earlier in this session, but are unavailable at the final verification checkpoint. Final command output is bounded instead.

## Workspace notes

The user authorized starting a worktree dev server during implementation. It runs on port 3004 with `.next-product-units` output, and remains running. Local environment settings were copied without exposing their contents. Generated output and temporary validation files are locally excluded from Git status.

Drive D is unavailable. Required Markdown documentation is stored in this worktree's `markdown-files` directory; the requested `D:/main_project/pos-system-monorepo/markdown-files` path was not updated. HelpContent, products help, FAQ, and the AI workflow catalog were updated together.

## Antislop delivery gate

Scope: the optional-unit form changes. Direction: the existing Indonesian product modal, ENERGY 1 / RHYTHM 1 / MOTION 1. Evidence: browser test, inspected mobile/desktop snapshots, live-app smoke check, and source review.

- R-02 PASS: new labels and help use ordinary punctuation; no em dash in added UI copy.
- R-03 PASS: 390px modal and fieldset scroll widths fit their containers; screenshot inspected.
- R-17 PASS: stock quantities come from entered values and normalized conversions; no marketing statistics.
- R-18 PASS: no testimonials or fictional profiles.
- R-23 PASS: no visual assets or navigation structures introduced.
- R-24 PASS: no new navigation links.
- R-25 PASS: measured badge contrast minimum 7.29:1 and placeholder contrast 4.76:1; other new text uses surface-600/700 on white.
- R-26 PASS: add, remove, direction, quantity, price, disclosure, SKU, barcode, HPP, and save are exercised in browser tests.
- R-27 PASS: single-unit empty state, mutation-disabled state, inline validation, and retained server-error inputs are implemented.
- R-28 PASS: FAQ instructions describe actual optional-unit product creation.
- R-32 PASS: Tab order, Enter disclosure, Escape handling, visible focus, new-row focus, and removal focus are exercised.
- R-33 PASS: implementation source edits use apply_patch; no runtime CSS/source rewrite scripts.
- R-34 PASS: no theme switch introduced; added UI follows the existing light modal.
- R-35 PASS: dev app runs, live form smoke check passes, and all added controls are exercised with real React components.
- R-36 PASS: no security, performance, compliance, or customer claims added.
- R-37 PASS: direction and dials were recorded in the approved specification before implementation.
- R-38 PASS: sample product data is explicitly an in-memory test fixture; product behavior is implemented and tested.
- R-01 PASS: no gradients or glows added to the unit controls.
- R-04 PASS: no decorative icons added.
- R-06 PASS: inherited readable form typography; no large monospace or tracked uppercase labels.
- R-07 PASS: no decorative background pattern.
- R-08 PASS: conversion equations convey quantities; no decorative arrows on buttons.
- R-09 PASS: compact badges convey conversion roles with text and semantic colors.
- R-10 PASS: unit rows use solid surfaces; existing modal backdrop retains its focus purpose.
- R-12 PASS: unit rows have borders without shadows; existing modal elevation is preserved.
- R-13 PASS: no simultaneous glow effects.
- R-14 PASS: repeated row layout represents the same unit schema; primary, optional details, and stock summary have distinct roles.
- R-19 PASS: no new template animation; focus moves support adding, correcting, and removing rows.
- R-22 PASS: no generic illustrations.
- Dials PASS: ENERGY 1 / RHYTHM 1 / MOTION 1 declared and used.
- Consistency PASS: restrained inherited form styling matches the declared dials.
- Focal point PASS: each unit row centers the unit/conversion pair, followed by its selling price.
- Whitespace PASS: row boundaries and disclosure spacing separate optional inputs and stock confirmation.
- Accent PASS: existing brand focus accent retained; requested emerald/violet colors encode size roles.
- Motif PASS: repeated labeled inputs, explicit equations, and size badges match the product-unit workflow.
- Design Read PASS: existing modal screenshot and approved design were reviewed before implementation.
- C-1 PASS: each input, equation, badge, and summary serves conversion, price, or stock confirmation.
- C-2 PASS: browser tests exercise every added interactive control.
- C-3 PASS: no decorative/template-only section.
- C-4 PASS: incomplete, valid, invalid, failed-save, narrow-layout, and keyboard states are verified.
- C-5 PASS: no fabricated testimonials, statistics, or product claims.
- R-05 PASS: composition follows the product form, optional rows, and stock confirmation.
- R-11 PASS: compact badges, rectangular disclosures, rounded inputs, and row borders have different roles/radii.
- R-15 PASS: actions name the concrete task: Tambah unit lain, Hapus unit, Simpan Produk.
- R-16 PASS: no marketing buzzwords added.
- R-20 PASS: conversion direction and shared-stock quantities are specific to this inventory workflow.
- R-21 PASS: existing light modal preserved; no forced dark mode or deferred theme requirement.
- R-29 PASS: surface/brand palette retained; emerald and violet have the user-requested semantic size purpose.
- R-30 PASS: no external product visual imitation.
- R-31 PASS: layout groups conversions, disclosures hide optional identifiers, colors distinguish size, and summary confirms shared stock.

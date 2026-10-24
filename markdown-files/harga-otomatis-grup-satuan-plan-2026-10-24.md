# Automatic Stock Group Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** All existing and new stock groups automatically derive follower cost and regular selling price from their reference product while preserving legacy selling prices as adjustment ratios.

**Architecture:** A pure exact decimal/rational calculator produces a complete group price projection. A transactional group pricing service persists projections and audit history under existing group locks. The group workspace exposes source, automatic/manual mode, percentage adjustments, server preview, conflicts, and review states; every existing product price writer participates.

**Tech Stack:** TypeScript, Next.js 15, React 19, Prisma 6, PostgreSQL, Vitest; use existing dependencies only.

**Spec:** `markdown-files/harga-otomatis-grup-satuan-design-2026-10-24.md` (approved by the user; continuation explicitly authorizes complete implementation).

## Global Constraints

- All new and legacy groups default to AUTO; source is an explicit member of the same store/group; source never follows itself.
- Legacy selling prices remain exact at initialization; store the adjustment as a precise numerator/denominator ratio. Final currency rounds half up to two decimal places.
- Follower HPP = source HPP × follower/source conversion; follower selling price = source price × conversion × factor.
- Existing price/HPP values are retained with a specific review reason whenever their calculation is unavailable; nullable HPP must never turn into zero.
- Mode is per follower; Manual freezes its own values; returning to Auto preserves selling price by deriving a factor and recalculates HPP.
- Every real price/HPP write path, import, conversion, source change, and membership change must maintain the invariant atomically and preserve transaction snapshots, member/special price semantics, and stock.
- Indonesian user-visible text. Preserve existing local edits. No production build, no start/stop/restart of development server. No new dependency. No production database mutation or deployment.
- TDD: capture focused RED before implementation and GREEN after. Run impact before modifying existing symbols; warn on HIGH/CRITICAL. GitNexus MCP is unavailable; use CLI against the original repository index with file disambiguation; record unavailable graph edges and source-based scope when necessary. Call Headroom start/end and compress large nonsensitive output.
- Work in the isolated worktree supplied by the controller. Do not spawn agents, push, merge, publish, or apply live database migrations. Controller owns review. Commit only task-owned changes after detect-changes; existing baseline changes are a separate snapshot.

## Task 1: Exact pricing domain, persistence, and legacy initialization

**Files:** create `apps/web/features/product-stock-groups/automatic-pricing.ts`, its `__tests__/automatic-pricing.test.ts`; modify `packages/db/prisma/schema.prisma`; create a timestamped SQL migration; create a dry-run/apply backfill script in `apps/web/scripts/` if migration alone cannot safely initialize the domain.

**Interfaces:** produce a serializable `GroupPricingConfig` with source product ID, revision, initialization version, member AUTO/MANUAL modes and precise ratios; pure `projectGroupPricing(...)` / `initializeGroupPricing(...)` accepting source/member IDs, store/group IDs, price, nullable HPP, multiplier, active/review flags. Projection returns config, member prices/HPP, and field-specific review reasons. Export testable types and exact arithmetic helpers for the service/UI. Prefer a single nullable `ProductStockGroup.pricingConfig` JSON field to redundant product columns; default absent config means legacy AUTO requiring initialization. Document concrete signatures in report.

- [x] Write tests with actual inputs, including Snowman 3000/2000, 12 pcs/pak, legacy 32400; expect factor 9/10, HPP 24000, new price 37800 when source is 3500.
- [x] Run `pnpm --filter @pos/web exec vitest run features/product-stock-groups/__tests__/automatic-pricing.test.ts` and capture RED.
- [x] Implement exact rational math without float factor rounding; test nonterminating factors, fractional conversions, zero/unknown cost, overflow, source ambiguity, and direct-from-source calculations.
- [x] Add schema/migration and idempotent initialization retaining exact old selling prices and review data. Schema/data backfill must support every store, single-product groups, inactive/ambiguous sources, and reruns; supply a no-write preview command. HPP changes require audit through the service/backfill, not silent SQL price rewriting.
- [x] Run GREEN and Prisma schema validation/generation without connecting to a live database. Report migration/backfill application order.
- [x] Self-review and commit task files; return report path, commit, RED/GREEN commands.

## Task 2: Transaction service and stock group APIs

**Files:** create `apps/web/features/product-stock-groups/group-pricing-service.ts` and focused tests; modify group GET, pricing, conversion and variants routes, service mapper/API types as required; add preview/source/config endpoint when needed.

**Interfaces:** consume Task 1's pure domain. Produce transactional initialization/synchronization helpers that operate on a passed Prisma transaction, lock group/products in existing deterministic order, initialize BEFORE a source update to preserve ratios, recompute AFTER, persist config/revision/results and price/group activity logs. Return a single group price snapshot including source, revision, member modes/factors/review reasons. Server preview must be write-free and apply must verify the version and expected projection.

- [x] Write RED tests for source price/HPP changes, manual followers, AUTO reactivation, conversion edits, legacy preimage initialization, cross-store denial and stale preview conflict.
- [x] Implement shared service and group routes. Existing clients may omit newly optional fields, but an explicit manual HPP edit of an AUTO follower must receive an Indonesian actionable validation error instead of silently bypassing the rule.
- [x] Versioned source replacement preserves currently displayed selling prices through new factors; source deletion/deactivation/move yields explicit review or a validated replacement. Variants default AUTO with factor 1.
- [x] Test atomic rollback/log writes, incomplete HPP independent of valid selling calculation, no stock mutation from prices, exact source validation, conflict and permission responses. Preserve existing route tests with realistic mocks.
- [x] Run focused GREEN, type check for changed types, self-review, and commit. Report exact service signatures and payloads for Tasks 3/4.

## Task 3: All product and import write paths

**Files:** `apps/web/app/api/products/route.ts`, `apps/web/app/api/products/[id]/route.ts`, `apps/web/features/product-import/services/product-import-commit-service.ts`, related preview helpers and tests; any other actual master-price writer found by bounded source audit, including assistant or receiving only if it changes master HPP.

**Interfaces:** use the same Task 2 transaction helpers. Product source mutations initialize the preimage then synchronize after the write; AUTO follower selling edits change its factor and HPP edits require Manual/source edits. Import groups rows before calculation, derives supplied follower selling adjustments, and reports contradictory follower HPP before commit. Preserve import queue accounting and per-store transactions.

- [x] Inventory every actual `price`/`costPrice` product create/update/upsert write, record coverage in the report. Exclude historical snapshot writes with evidence.
- [x] Add RED tests for ordinary source edits cascading to pack, follower factor edits, same-import source+pack in reversed row order, conflicting follower HPP preview/commit, moving/deactivating source, and stale/missing source retaining prior values.
- [x] Integrate the shared service, including initial grouped product creation and joins. Avoid repeated queries for every import row and acquire locks consistently.
- [x] Run focused GREEN plus product/import regression and types, self-review, commit. Report every writer and test coverage.

## Task 4: Group pricing UI and product edit integration

**Files:** `StockGroupWorkspace.tsx`, `WorkspacePanels.tsx`, `workspace-drafts.ts`, `api/stock-group-api.ts`, helper/UI tests; extract a focused pricing panel file rather than expanding the existing large workspace. Update ordinary product price editor when needed to reflect server rules.

**Interfaces:** consume the server snapshot/preview/apply payloads from Task 2; source edits, AUTO/MANUAL, no adjustment/discount/markup, preview and apply; all user strings Indonesian.

- [x] Run modern-web-guidance search/retrieve before frontend edits; use existing design and native labelled controls.
- [x] Write focused RED tests that render source identity, legacy mode/factor, read-only auto HPP/result, mode switching, stale preview handling, invalid-source repair, preview before saving, and single-group formula example.
- [x] Implement source selector with preview, source editable money fields, AUTO follower adjustment controls and calculated output, Manual fields, field-specific review states and meaningful formula text. Show before/after/margin across affected units before applying and refresh authoritative snapshot on success.
- [x] Integrate normal product editor to explain AUTO/source and allow an explicit Manual switch; preserve in-progress local edits.
- [x] Verify keyboard labels/live errors, disabled/read-only states, narrow-screen layout, focus retention after conflict, and browser interaction using the existing user-managed server if available. Do not start or stop a server.
- [x] Run GREEN/lint/types, self-review and commit, with browser evidence paths.

## Task 5: Help, workflow catalog, changelog, deployment notes, final verification

**Files:** `HelpContent.tsx`, `workflow-catalog.ts`, `apps/web/features/changelog/data/changelog.ts`, help tests, this design/plan and a dated implementation document under `markdown-files`.

- [x] Add behavior-focused documentation tests verifying source/mode/adjustment/review help and guided workflow coverage; capture RED.
- [x] Update help and assistant procedural workflow to match the implemented controls. Changelog entry uses actual WIB date, stable ID/revision, concise title/copy, route, exactly three real usage steps, highlight title <=40 chars and summary <=85 chars. Add a sanitized actual screenshot or accurate labelled visual.
- [x] Document migration/backfill dry run/apply commands and results, legacy initialization guarantees, review repair, rollback and schema/client deployment order. Record missing D: path and Headroom/GitNexus limits.
- [x] Run targeted full feature regression covering domain/service/group/product/import/checkout/docs, lint/type checks, Prisma validation, UI keyboard/mobile evidence and change-scope detection; investigate concrete failures with systematic debugging. No optional whole-repo test churn after sufficient evidence.
- [x] Final reviewer audits spec requirements against source and tests. Resolve significant findings via scoped TDD fixes and re-review. Controller transfers only feature diff back to the original checkout, preserving baseline/user work and verifies integration there.

## Cross-task preflight and review map

| Tasks | Shared interface/file | Resolution |
| --- | --- | --- |
| 1 / 2 | Config + projection types/schema | 1 owns domain; 2 consumes exported concrete signatures |
| 2 / 3 | Passed-transaction mutation helpers | 2 reports lock/preimage contract; 3 reuses it |
| 2 / 4 | Group snapshot, preview/apply API types | Server is authority; 4 consumes concrete payloads |
| 3 / 4 | Product edit validation/manual switch | 3 provides API; 4 makes it actionable |
| 4 / 5 | Actual UI usage + docs | 5 copies implemented labels/flow, not speculative claims |
| 1 | Legacy factors vs initial prices | Preserve initial selling money exactly; recompute HPP independently |
| 2 | Preview vs locks and revision | No write in preview, revalidate under locks on apply |
| 3 | Import order vs preimage | Batch group input then project once from coherent final source |
| 4 | AUTO default vs editable source | Source is input anchor; followers expose modes |
| 5 | Deployment vs live mutation | Prepare and test migrations; no production application without approval |

## Status pelaksanaan

- Task 1–2: domain, schema/backfill dan service/API selesai; hasil Task 2 sesudah fix boundary uang 79/79 tes.
- Task 3a: produk dan anggota grup, 308/308 tes; 3b: impor/worker/undo, fix review 43/43 tes; 3c: HPP master pembelian dan equal no-op, 24/24 tes. Ketiga slice diterapkan dan ditinjau.
- Task 4: panel ledger, editor, satuan baru dan cache selesai; baseline 413/413 tes, UX 81/81 dan lima browser harness. Fix konsistensi sumber/half-up/save-lock 4857d7e2 diterima reviewer. Browser memakai harness tanpa server, bukan user-managed server.
- Task 5: Bantuan, workflow/FAQ, changelog, fixture offline dan panduan operasional tersedia; focused RED 7 gagal/1 lulus → GREEN 8/8. Fullsuite web sekali selesai: 545 berkas lulus/2 dilewati, 4.088 tes lulus/10 dilewati, tanpa kegagalan, 1.617,94 detik (mulai 11:26:48 WIB). Type-check, lint, Prisma dan sampel offline selesai. Review menyeluruh dan scoped rereview disetujui; 112 berkas fitur sudah diterapkan ke checkout utama, diikuti 99/99 tes integrasi, 4 skenario browser dan pemeriksaan tipe web/database/worker.
- Migrasi schema dev dan prod `20261024010000_group_automatic_pricing` diterapkan dan diverifikasi pada 2026-10-24 WIB atas instruksi pengguna. Backfill belum dijalankan; migrasi ini tidak mengubah uang produk.

Bukti perintah, batas tooling dan seluruh keputusan tersedia mandiri pada [dokumen implementasi](harga-otomatis-grup-satuan-implementation-2026-10-24.md).

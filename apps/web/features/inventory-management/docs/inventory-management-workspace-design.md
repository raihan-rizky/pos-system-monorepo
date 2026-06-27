# Manajemen Inventaris Workspace Design

## Understanding Summary

- Build a dedicated `/inventory` page for **Manajemen Inventaris**, separate from `/products`.
- Add a new `INVENTORY` role.
- Page access is available to `OWNER`, `ADMIN`, and `INVENTORY`.
- Stock request approval is `OWNER` only. `ADMIN` and `INVENTORY` cannot approve stock requests.
- Use a task-first layout: `Ringkasan`, `Tugas Harian`, `Tugas Mingguan`, `Penerimaan Barang`, `Pemakaian Internal`, `Log Stok`, `Rekap Stok`, `Surat Jalan`, `Bulk & Grup Stok`.
- Daily work includes low stock, negative stock, pending stock requests, missing supplier/cost data, OUT/internal-use verification, damaged product reporting, and end-of-day stock matching.
- Weekly work includes storehouse cleaning proof via `prnt.sc` URL, reusing the existing `/api/prntsc` resolver/preview pattern.
- Inbound receiving starts from Daftar Belanja/supplier invoice, is submitted by staff, and updates stock only after owner approval.

## Assumptions

- First-version scale target is one store with up to about 10k products.
- Inventory views use paginated and targeted queries rather than loading all historical stock data.
- `INVENTORY` staff can see HPP/cost and stock value totals.
- Verification actions do not need a separate audit trail beyond saved workflow status/notes and existing stock/request logs.
- New workspace logic lives under `features/inventory-management`.
- Existing stock log, stock history, internal-use recap, bulk stock, stock group, and Surat Jalan logic should be reused where practical.

## Decisions

| Decision | Alternatives | Reason |
| --- | --- | --- |
| Dedicated `/inventory` page | Sidebar links to existing `/products` tabs | Staff need a focused operational workspace. |
| New `INVENTORY` role | Reuse `CASHIER` or `ADMIN` | Inventory staff need different permissions from cashier/admin. |
| Owner-only stock approval | Allow admin or inventory approval | Existing API model points to owner-gated stock approval. |
| Task-first layout | Domain-first or minimal layout | Recurring staff tasks should be surfaced first. |
| `InventoryLogVerification` table | Fields on `InventoryLog`, generic checklist table | Keeps stock movement truth separate from operational verification state. |
| Generic `InventoryTask` table | Dedicated weekly proof table, metadata-only storage | Supports weekly cleaning proof now and future recurring inventory tasks. |
| Hybrid inbound receiving | Whole receipt only, line-by-line approval | Supports partial/missing/damaged/mismatch lines without owner approving each line individually. |
| Damaged product reports always require owner approval | Immediate stock decrease for owner/admin | Damaged stock reduces usable inventory and should be consistently reviewed. |

## Architecture

Create `apps/web/app/(main)/inventory/page.tsx` as the workspace route. Put new workflow-specific hooks, API clients, helpers, services, repositories, types, and components under `apps/web/features/inventory-management`.

This design follows `frontend-dev-guidelines` and `backend-dev-guidelines` with repo-specific adaptation:

- Frontend uses Next.js App Router, React, TypeScript, Tailwind, and TanStack Query. Apply the Suspense-first guideline for new inventory-management queries where practical, with feature-level Suspense boundaries.
- Backend uses Next.js route handlers rather than Express controllers. The layered architecture guideline still applies as `route handler -> service -> repository -> Prisma`.
- Existing repo conventions take precedence where they are already established, but new inventory-management code must not add business logic directly in route handlers or fetch logic directly in components.

The inventory-management feature owns:

- Workspace shell and tab layout.
- Task summary cards.
- Daily task orchestration.
- Inventory log verification state.
- Weekly recurring task/proof UI.
- Inbound receiving workflow.
- Quick internal-use form integration.
- Damaged product report workflow.

Reuse existing mature functionality where possible:

- `StockLogsTab`
- `StockHistoryTab`
- `InternalUseRecapPanel`
- Bulk stock import/adjustment drawers
- Stock group activity components
- Surat Jalan data/components where practical
- `/api/prntsc` Lightshot resolver
- Existing inventory request APIs for pending stock-changing requests

### Feature Structure

New frontend and backend workflow code should be organized as:

```text
apps/web/features/inventory-management/
  api/
    inventory-management-api.ts
  components/
    InventoryWorkspace.tsx
    InventorySummaryTab.tsx
    DailyTasksTab.tsx
    WeeklyTasksTab.tsx
    InboundReceiptsTab.tsx
    QuickInternalUsePanel.tsx
    DamagedProductReportPanel.tsx
  hooks/
    useInventorySummary.ts
    useDailyInventoryTasks.ts
    useInventoryTaskMutations.ts
    useInboundReceipts.ts
  helpers/
    period.ts
    verification.ts
    inbound-receipt-rules.ts
    damaged-product-rules.ts
  repositories/
    InventoryManagementRepository.ts
    InventoryInboundReceiptRepository.ts
  services/
    inventory-management-service.ts
    inbound-receipt-service.ts
  types/
    inventory-management.ts
  docs/
    inventory-management-workspace-design.md
  index.ts
```

`apps/web/app/(main)/inventory/page.tsx` should stay thin: import the feature entry component, provide a Suspense boundary, and avoid business logic.

## Feasibility and Risk

### Frontend FFCI

| Dimension | Score | Notes |
| --- | ---: | --- |
| Architectural fit | 4 | Feature-based workspace fits the repo and avoids expanding `/products` further. |
| Reusability | 4 | Existing stock logs, recap, bulk, and Surat Jalan components can be reused. |
| Performance | 4 | Tab-level lazy loading and paginated APIs keep initial render bounded. |
| Complexity load | 4 | Multiple workflows, forms, and role-dependent actions. |
| Maintenance cost | 3 | New feature boundary and typed APIs keep it manageable. |

`FFCI = (4 + 4 + 4) - (4 + 3) = 5`

This is risky as one large release. Implementation should be split into phases:

1. RBAC, route, workspace shell, summary, existing reusable tabs.
2. Daily verification and weekly cleaning proof.
3. Quick internal use and damaged product report.
4. Inbound receiving with owner approval and stock application.

Each phase should independently keep `FFCI >= 6` by limiting scope and avoiding oversized components.

### Backend BFRI

| Dimension | Score | Notes |
| --- | ---: | --- |
| Architectural fit | 4 | Next route handlers can call services and repositories cleanly. |
| Testability | 4 | Service/repository split supports unit and route tests. |
| Business logic complexity | 4 | Inbound approval, damaged stock, verification, and role rules are non-trivial. |
| Data risk | 5 | Inbound approval and damage reports affect stock. |
| Operational risk | 3 | RBAC and owner-only approval are sensitive. |

`BFRI = (4 + 4) - (4 + 5 + 3) = -4`

The backend is dangerous if built as one broad change. Stock-changing paths must be isolated behind services, transactions, idempotency checks, and focused tests before implementation proceeds.

## RBAC

Add `INVENTORY` to the role model.

Default page access:

- `/inventory`: `OWNER`, `ADMIN`, `INVENTORY`

Default resource behavior:

- `OWNER`: full access, including `inventory.approve`.
- `ADMIN`: can access inventory workspace and create/update inventory operational records, but cannot approve stock requests.
- `INVENTORY`: can access inventory workspace and create stock/internal-use/damaged/correction/inbound submissions, but cannot approve stock requests.

## Data Model

### InventoryLogVerification

Stores daily verification state for stock OUT/internal-use logs.

- `id`
- `storeId`
- `inventoryLogId`
- `status`: `UNVERIFIED | VERIFIED | MISMATCH`
- `note`
- `verifiedBy`
- `verifiedAt`
- `createdAt`
- `updatedAt`

Mismatch correction creates a normal pending inventory adjustment request and may link back to the verification record if useful.

### InventoryTask

Generic recurring task table for weekly cleaning proof and future routines.

- `id`
- `storeId`
- `type`: e.g. `WEEKLY_CLEANING_PROOF`
- `periodType`: `DAILY | WEEKLY | MONTHLY`
- `periodKey`: e.g. `2026-W26`
- `status`: `PENDING | SUBMITTED`
- `proofUrl`
- `resolvedProofImageUrl`
- `note`
- `submittedBy`
- `submittedAt`
- `createdAt`
- `updatedAt`

### InventoryInboundReceipt

Header for inbound receiving from Daftar Belanja/supplier invoice.

- `id`
- `storeId`
- supplier/shopping request/invoice reference
- `status`: `DRAFT | SUBMITTED | APPROVED | REJECTED`
- `note`
- `submittedBy`
- `submittedAt`
- `approvedBy`
- `approvedAt`
- `rejectionReason`
- `createdAt`
- `updatedAt`

### InventoryInboundReceiptLine

Line-level receiving details.

- `id`
- `receiptId`
- `productId`
- `expectedQuantity`
- `receivedQuantity`
- `status`: `RECEIVED | PARTIAL | MISSING | DAMAGED | MISMATCH`
- `note`
- `createdAt`
- `updatedAt`

Owner approval applies stock increases only for eligible received/partial lines and writes inventory logs. Rejected receipts do not affect stock.

## Frontend Standards

New inventory-management frontend code must follow these rules:

- Use feature-local API clients in `features/inventory-management/api`; no inline `fetch` calls inside React components.
- Use typed API responses and request payloads from `features/inventory-management/types`; no `any`.
- Prefer `useSuspenseQuery` for read-only page data and place Suspense boundaries at the workspace/tab level.
- Lazy load non-trivial tabs, data-heavy panels, import drawers, and modals.
- Keep `page.tsx` thin and delegate UI to `InventoryWorkspace`.
- Split large tabs into focused panels instead of a single multi-thousand-line component.
- Use `useMemo` for derived task counts and grouped rows.
- Use `useCallback` for handlers passed into child components.
- Debounce product/supplier search fields at 300-500ms.
- Keep tab panels stable in dimensions where possible to avoid layout shift.
- Use existing Tailwind/design conventions from the app; do not introduce MUI solely because the generic guideline mentions it.
- Use existing feedback patterns in the repo. If no central snackbar exists, use the local status/error banner pattern already present in inventory and finance components.

Suggested frontend component boundaries:

- `InventoryWorkspace`: tab state, layout, high-level Suspense boundaries.
- `InventorySummaryTab`: urgent queues and quick action entry points.
- `DailyTasksTab`: daily checklist container only.
- `StockVerificationPanel`: OUT/internal-use verification.
- `DamagedProductReportPanel`: damaged item report form and recent reports.
- `WeeklyTasksTab`: cleaning proof task.
- `InboundReceiptsTab`: receipt list and create flow.
- `InboundReceiptEditor`: draft/submit form.
- `OwnerInboundApprovalPanel`: owner-only approval UI.
- `QuickInternalUsePanel`: internal-use request form.

## Backend Standards

New inventory-management backend code must follow a layered structure adapted to Next.js route handlers:

```text
Route Handler -> Service -> Repository -> Prisma
```

Route handlers:

- Validate params, query, and body with Zod.
- Resolve auth and permissions with existing guards such as `requirePermission`.
- Call a service function.
- Return standardized API responses using existing response helpers.
- Contain no stock calculation, approval, or persistence business rules.

Services:

- Own business rules: owner-only approval, status transitions, inbound line eligibility, damaged stock semantics, verification transitions, and idempotency.
- Be framework-agnostic and unit-testable.
- Accept dependencies explicitly where practical.
- Emit structured logs for critical stock-changing workflows.

Repositories:

- Encapsulate Prisma queries and transactions.
- Expose intent-based methods such as `findDailyVerificationLogs`, `submitInboundReceipt`, `approveInboundReceiptOnce`, and `createDamagedProductRequest`.
- Keep stock-changing operations inside database transactions.

Validation:

- All request bodies, route params, and query params must use Zod schemas.
- Enums in Zod should match Prisma enums.
- Quantities must reject zero, invalid numbers, and unsupported negative values unless the specific workflow explicitly allows them.
- `prnt.sc` proof URLs should follow the existing resolver constraints instead of accepting arbitrary image scraping behavior.

Observability:

- Use the repo's structured logger via `getLogger`.
- Log stock-changing approvals with receipt/request id, store id, actor id, affected line count, and resulting inventory log ids.
- Do not log sensitive proof contents or full external response bodies.
- Preserve existing error-response patterns; do not swallow failed approval or stock application errors.

Idempotency:

- Inbound receipt approval must be safe to retry.
- A receipt already `APPROVED` must not apply stock again.
- Approval should write stock logs and transition status in one transaction.
- If a transaction fails, no partial stock changes should remain.

## Workflows

### Daily Tasks

The daily task view loads a generated checklist from current product and stock data:

- Low stock
- Negative stock
- Pending stock requests
- Products missing supplier/cost data
- Today's OUT/internal-use logs needing verification
- Damaged product report queue
- End-of-day matching for today's OUT/internal-use/damaged items

OUT/internal-use rows can be marked `VERIFIED` or `MISMATCH` with notes. A mismatch can create a normal pending correction request.

### Weekly Tasks

The weekly task view shows the current week's storehouse cleaning proof. Staff paste a `prnt.sc` URL. The UI resolves/previews it through `/api/prntsc` and saves the task as `SUBMITTED`.

### Quick Internal Use

Quick Internal Use records internal stock usage.

- `OWNER`: applies immediately.
- `ADMIN` and `INVENTORY`: creates a pending OUT request requiring owner approval.

### Damaged Product Report

Damaged product reports capture product, quantity, reason, note, and optional proof URL/photo. All roles create a pending request. Owner approval reduces usable stock and records the stock log.

### Inbound Receiving

Staff select a supplier invoice/Daftar Belanja item, verify expected lines, record received quantities and line statuses, then submit the receipt.

Owner approval approves the receipt as a whole. Stock increases only for eligible received/partial lines, with inventory logs written once. Approval must be idempotent to prevent double stock application.

## APIs

New workflow APIs should be thin and focused:

- `GET /api/inventory-management/summary`
- `GET /api/inventory-management/daily-tasks`
- `POST/PATCH /api/inventory-management/log-verifications`
- `GET/POST/PATCH /api/inventory-management/tasks`
- `GET/POST/PATCH /api/inventory-management/inbound-receipts`
- `POST /api/inventory-management/inbound-receipts/[id]/submit`
- `POST /api/inventory-management/inbound-receipts/[id]/approve`
- `POST /api/inventory-management/inbound-receipts/[id]/reject`

Quick Internal Use, damaged product reports, and correction requests should reuse or extend the existing inventory request path where practical so approval behavior stays consistent.

### API Contracts

`GET /api/inventory-management/summary`

- Permission: page access to `/inventory`.
- Returns task counts, urgent queues, weekly proof status, and pending inbound receipt counts.
- Must use bounded limits for preview queues.

`GET /api/inventory-management/daily-tasks`

- Permission: page access to `/inventory`.
- Query: date, page/limit where relevant.
- Returns low stock, negative stock, missing supplier/cost items, today's verification candidates, and damaged report queue.

`POST/PATCH /api/inventory-management/log-verifications`

- Permission: `inventory.update`.
- Body: inventory log id, status, note.
- Service must ensure the target log belongs to the actor's store and is eligible for verification.

`GET/POST/PATCH /api/inventory-management/tasks`

- Permission: `inventory.read` for read, `inventory.update` for submit/update.
- Handles weekly cleaning proof.
- `proofUrl` must be a valid URL and should be compatible with existing `prnt.sc` resolver behavior.

`GET/POST/PATCH /api/inventory-management/inbound-receipts`

- Permission: `inventory.read` for read, `inventory.update` for create/update.
- Draft and submitted receipts must be scoped to store and linked to a valid supplier/shopping request reference.

`POST /api/inventory-management/inbound-receipts/[id]/approve`

- Permission: `inventory.approve`.
- Owner-only by default RBAC.
- Applies stock once, writes inventory logs, and marks the receipt approved in one transaction.

`POST /api/inventory-management/inbound-receipts/[id]/reject`

- Permission: `inventory.approve`.
- Requires rejection reason.
- Does not affect stock.

## Edge Case Decisions

### Inbound Receiving

- Over-receipt is allowed, but the line must be marked `OVER_RECEIVED`, include a required note, and wait for owner approval before stock changes.
- Multiple inbound receipts are allowed for the same supplier invoice/Daftar Belanja item, but only against remaining quantities.
- Submitted inbound receipts reserve their quantities. Rejected, cancelled, or `NEEDS_REVISION` receipts release those reservations.
- Remaining quantity should account for approved received quantity and submitted pending quantity.
- Draft receipts do not reserve quantities until submitted.
- Inbound receipt line snapshots are frozen at submission time. Snapshot fields should include product name, SKU, unit, expected quantity, received quantity, cost, supplier name, and invoice/reference number where available.
- Stock application must use existing stock group mutation/conversion helpers for grouped products and direct stock changes only for standalone products.
- Approval blocks if stock group conversion metadata is missing or marked review-needed.
- If any submitted line is invalid at approval time, approval of the whole receipt is blocked. No partial stock application in the first version.
- Add `NEEDS_REVISION` status. Flow: `DRAFT -> SUBMITTED -> APPROVED`, `SUBMITTED -> REJECTED`, and `SUBMITTED -> NEEDS_REVISION -> SUBMITTED`.
- Staff can edit receipts only in `DRAFT` or `NEEDS_REVISION`.
- Staff can cancel `DRAFT`, `NEEDS_REVISION`, and their own `SUBMITTED` receipts before owner action. Add `CANCELLED` status.
- Approval and cancellation must use status-guarded transactions. If a concurrent action changes status first, return `409 Conflict`.
- Stock increases only for line statuses `RECEIVED`, `PARTIAL`, and `OVER_RECEIVED`.
- `MISSING`, `DAMAGED`, and `MISMATCH` inbound lines do not increase stock.
- Inbound damaged lines only document receiving issues. They do not automatically create damaged product reports.
- Require notes for non-normal inbound lines: `PARTIAL`, `DAMAGED`, `MISMATCH`, and `OVER_RECEIVED`.
- Inbound issue proof is not required in the first version.
- Store both submitted cost snapshot and latest product cost at approval time. Use latest product cost for valuation and show differences in owner review.
- If latest product cost is missing or invalid, approval blocks until product cost is fixed.

### Stock Requests and Verification

- Correction requests from verification mismatches are allowed even if other pending requests exist for the same product. UI must show pending request count/delta warnings.
- Daily verification includes only approved `OUT` logs with reason `INTERNAL_USE` or manual stock OUT.
- Pending OUT requests are shown in pending request queues, not verification.
- IN and ADJUSTMENT logs are excluded from daily verification in the first version.
- Staff can edit verification status/note until daily matching is completed.
- Once daily matching is completed, existing verification rows become read-only.
- If new eligible logs appear after completion, the daily matching task becomes stale/incomplete and staff must complete matching again.
- Daily matching completion is stored as `InventoryTask` type `DAILY_STOCK_MATCHING`.
- Any `INVENTORY`, `ADMIN`, or `OWNER` user with `/inventory` access can mark daily matching complete.
- Daily matching completion stores submitter, submitted time, note, and a completion snapshot such as eligible log count or latest eligible log timestamp.
- Weekly cleaning proof is independent from daily matching completion.

### Quick Internal Use and Damaged Products

- Quick Internal Use applies immediately only for `OWNER`.
- `ADMIN` and `INVENTORY` Quick Internal Use submissions create pending requests requiring owner approval.
- Damaged product reports always require owner approval, including reports created by `OWNER` or `ADMIN`.
- Damaged product proof is required for all damaged reports.
- Damaged proof must be a valid `prnt.sc` URL with successful `/api/prntsc` image resolution before submit.
- Store both the original proof URL and resolved image URL.
- If Lightshot resolution fails, damaged report submit is blocked.
- Internal-use and damaged reports are submitted against the selected product/variant. Approval uses stock group mutation helpers if the product is grouped.
- Owner rejection reason is required for all new inventory workflows, including inbound receipts, damaged reports, correction requests, and internal-use requests.

### Tasks, Periods, and Badges

- Use Asia/Jakarta calendar dates/weeks for all inventory daily and weekly task periods.
- Daily task key is `YYYY-MM-DD` in Asia/Jakarta.
- Weekly task key is an ISO-like Jakarta week key, e.g. `2026-W26`.
- DB timestamps remain UTC; filtering uses Jakarta day/week boundaries.
- Weekly cleaning proof uses latest submission only. Unique key: `storeId + type + periodKey`.
- A new weekly proof submission overwrites proof URL, resolved preview URL, note, submitter, and submitted time for the same week.
- Inventory tasks are shared across inventory staff. There is no assignment workflow in the first version.
- Sidebar placement is a new top-level group: `Manajemen Inventaris`, with main item `Inventaris`.
- Sidebar badge shows a role-specific urgent inventory task count.
- `OWNER` badge focuses on approvals and decisions needed.
- `INVENTORY` badge focuses on shared operational tasks, stale/incomplete tasks, needs-revision receipts, and their rejected requests where useful.
- `ADMIN` badge follows operational visibility without approval power and is governed by RBAC.
- Badge counts should come from `GET /api/inventory-management/summary` or a dedicated lightweight badge endpoint.

### Product, Supplier, and Data Quality

- Forms should not allow selecting inactive or deleted products.
- If a product becomes inactive after draft/submission, approval blocks for inbound, damaged, correction, and internal-use workflows.
- Historical logs remain visible even if products become inactive later.
- `INVENTORY` can read supplier invoice details including cost/payment fields by default, but this must be governed by configurable RBAC access.
- Inbound APIs must enforce supplier/inbound read permission before returning invoice details.
- Missing supplier/cost daily task includes active products with missing supplier OR missing/zero cost price.
- Negative stock is separate and highest priority: `stock < 0`.
- Out of stock is a separate task: `stock === 0`.
- Low stock is `stock > 0 && stock <= minStock`.
- Large daily task result sets are paginated independently by category.
- Shared stock approval queues remain backed by existing inventory logs. `/products` and `/inventory` show the same pending stock request queue.
- Surat Jalan tab shows all history, but defaults to stock-affecting entries.

### Notifications and Connectivity

- Owner receives in-app/push notifications for new inventory submissions: Quick Internal Use requests, damaged reports, correction requests, and inbound receipts.
- Existing pending badge remains as a passive queue indicator.
- Notification submit paths must avoid duplicate notifications on retry/idempotent submit.
- Inventory workspace requires online connection for mutating actions in the first version.
- Read views may show cached data if existing app behavior supports it, but stale/offline state must be clear.
- Submit, approve, cancel, verify, and complete actions are disabled offline.

## UI

The `/inventory` page opens on `Ringkasan`. The first viewport should show operational information, not marketing content:

- Pending stock requests
- Low/negative stock
- Unverified OUT/internal-use logs
- Pending inbound receipts
- Weekly cleaning proof status
- Damaged product report status
- Quick actions

Tabs:

- `Ringkasan`
- `Tugas Harian`
- `Tugas Mingguan`
- `Penerimaan Barang`
- `Pemakaian Internal`
- `Log Stok`
- `Rekap Stok`
- `Surat Jalan`
- `Bulk & Grup Stok`

Use compact cards, dense tables, and mobile-friendly card fallbacks.

## Testing Strategy

Prioritize high-risk behavior.

Frontend tests:

- RBAC rendering tests for `OWNER`, `ADMIN`, and `INVENTORY`.
- Tab rendering tests for the task-first layout.
- Suspense boundary tests for data-driven tabs.
- Daily verification form tests for status and note submission.
- Weekly proof tests for `prnt.sc` preview behavior.
- Quick Internal Use tests for immediate vs pending behavior by role.
- Damaged report tests confirming all roles submit pending requests.
- Inbound receipt editor tests for partial/missing/damaged/mismatch lines.

Backend tests:

- RBAC tests for `INVENTORY` access and owner-only approval.
- Zod validation tests for each workflow route.
- Service tests for log verification create/update.
- Service tests for weekly cleaning proof create/update with `prnt.sc` URL behavior.
- Service and route tests for inbound receipt draft/submit/approve/reject.
- Idempotency tests for inbound approval stock application.
- Transaction rollback tests for failed inbound approval.
- Tests confirming damaged product reports do not change stock before owner approval.
- Repository tests for complex daily-task and inbound queries.

E2E smoke:

- `INVENTORY` logs in, opens Manajemen Inventaris, submits internal use, submits damaged report, uploads weekly proof, and submits inbound receipt.
- `OWNER` approves inbound receipt and stock changes exactly once.
- `ADMIN` can open workspace but cannot approve stock requests.

## Implementation Plan

1. Add `INVENTORY` role and RBAC defaults, including `/inventory` access and owner-only `inventory.approve`.
2. Add Prisma schema and migration for `InventoryLogVerification`, `InventoryTask`, `InventoryInboundReceipt`, and `InventoryInboundReceiptLine`.
3. Add service/repository layer for inventory-management workflows with tests before UI wiring.
4. Add `/inventory` route, sidebar entry, feature shell, and task-first tab layout.
5. Wire existing reusable stock log, stock recap, internal-use recap, bulk/group, and Surat Jalan views.
6. Implement daily verification and weekly cleaning proof.
7. Implement Quick Internal Use and damaged product report.
8. Implement inbound receiving draft/submit/owner approval with idempotency tests.
9. Run type-check, targeted unit tests, and an E2E smoke path.

## Validation Checklist

Frontend:

- FFCI for each implementation phase is at least 6.
- Feature boundaries are respected.
- Data fetching is isolated in feature API/hooks.
- Heavy tabs/modals are lazy loaded.
- Types are explicit and shared through `features/inventory-management/types`.
- Rendering stays stable on desktop and mobile.

Backend:

- BFRI for each stock-changing route is at least 3 after isolation and tests.
- Route handlers validate input and delegate business logic to services.
- Services enforce owner-only approval and status transitions.
- Repositories encapsulate Prisma and transactions.
- Stock-changing paths are idempotent.
- Structured logs exist for critical approval paths.

## Risks

- Inbound receipt approval is the highest-risk stock-changing workflow and needs transaction/idempotency protection.
- Adding `INVENTORY` touches RBAC defaults, settings UI, guards, and tests.
- Reusing existing product/inventory components may require small interface adjustments to make them fit the new workspace cleanly.
- Building the whole workspace in one pass is too risky; implementation must be phased.

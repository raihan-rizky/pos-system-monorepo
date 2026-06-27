# Inventory Task Checklist Design

## Understanding Summary

- Add a hybrid to-do list inside the Inventory page `Tugas` tab for `Tugas Harian` and `Tugas Mingguan`.
- Fixed operational tasks are driven by existing inventory workflow status data.
- Manual checklist items are shared per store and period-based by date or week.
- Only Owner/Admin can create, edit, or delete manual checklist items.
- All inventory users can mark manual checklist items complete or incomplete.
- Manual checklist completion stores lightweight audit fields: `completedById` and `completedAt`.
- Add `Riwayat Tugas Harian` and `Riwayat Tugas Mingguan` inside the existing `Riwayat` tab, showing only fixed operational task statuses.

## Assumptions

- Existing summary data can power current-period fixed task cards.
- New persistence and API routes are needed for manual checklist items.
- Fixed operational task history should be derived from existing operational records where reliable.
- Store-scoped RBAC applies to all reads and writes.
- Expected scale is low volume: dozens of checklist items per store period.
- Realtime sync is not required; mutation success can trigger normal refetch.
- Implementation should stay inside the existing `inventory-management` feature, API, and test structure.

## Decision Log

| Decision | Alternatives Considered | Reason |
| --- | --- | --- |
| Use a hybrid fixed-task and manual-checklist design. | Frontend-only checklist; unified task engine for all fixed and manual tasks. | Fixed tasks already have operational truth elsewhere, while manual tasks need their own persistence. |
| Manual checklist state is shared per store. | Private per user; mixed shared/private. | Store staff need one shared operational list. |
| Manual checklist items are period-based. | Reusable templates; persistent list. | Daily and weekly work should reset by date/week. |
| Owner/Admin manage manual items. | All inventory users; creator-only edit. | Checklist structure should be controlled by higher roles. |
| All inventory users can complete/uncomplete items. | Owner/Admin only; assigned user only. | Staff need to execute tasks during operations without assignment complexity. |
| Store lightweight completion audit. | Full history; no audit. | Captures who completed the current state without creating an event log. |
| Manual items include due time and priority. | Plain text only; priority only. | Due time and priority are useful for operational ordering. |
| Task history shows only fixed operational statuses. | Completed manual history; all manual history; fixed plus manual history. | User requested history for fixed operational task statuses only. |

## Final Design

### Tugas Tab

The `Tugas` tab should become a real work queue. Each sub-tab renders fixed operational tasks first, followed by manual checklist items.

`Tugas Harian` fixed tasks:

- `Matching Stok Harian`, using `dailyMatchingIncomplete`.
- `Laporan Barang Rusak`, using `damagedReportsPending`.
- `Log OUT Belum Diverifikasi`, using `unverifiedOutLogs`.

`Tugas Mingguan` fixed tasks:

- `Proof Kebersihan Gudang`, using `weeklyProofMissing`.

Fixed task rows should show status, period, short context, and an action button. Actions should reuse existing workflows, such as opening `DailyMatchingModal`, `DamagedReportModal`, `WeeklyProofModal`, or switching to the relevant transaction/review tab.

Manual checklist rows should show:

- checkbox
- task title
- due time
- priority badge
- completion audit text when complete
- Owner/Admin-only edit/delete controls

### Data Model

Add a store-scoped manual checklist model:

```prisma
model InventoryTaskChecklistItem {
  id            String   @id @default(cuid())
  storeId       String
  periodType    InventoryTaskPeriodType
  periodKey     String
  title         String
  dueTime       String?
  priority      InventoryTaskPriority @default(NORMAL)
  isCompleted   Boolean  @default(false)
  completedById String?
  completedAt   DateTime?
  createdById   String
  updatedById   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

enum InventoryTaskPeriodType {
  DAILY
  WEEKLY
}

enum InventoryTaskPriority {
  LOW
  NORMAL
  HIGH
}
```

Exact relation fields and indexes should follow the existing Prisma schema conventions. Recommended indexes are `(storeId, periodType, periodKey)` and `(storeId, periodType, periodKey, isCompleted)`.

### API Design

Recommended routes:

- `GET /api/inventory-management/task-checklist?periodType=DAILY&periodKey=...`
- `POST /api/inventory-management/task-checklist`
- `PATCH /api/inventory-management/task-checklist/[id]`
- `DELETE /api/inventory-management/task-checklist/[id]`
- `POST /api/inventory-management/task-checklist/[id]/toggle`

RBAC:

- `GET`: inventory read permission.
- `POST`, `PATCH`, `DELETE`: Owner/Admin-level management permission.
- `toggle`: inventory update permission.

When toggling complete, set `isCompleted`, `completedById`, and `completedAt`. When toggling incomplete, clear `completedById` and `completedAt`.

### Riwayat Tab

Extend the existing `Riwayat` sub-tabs:

- `Log Stok`
- `Rekap Stok`
- `Riwayat Tugas Harian`
- `Riwayat Tugas Mingguan`

The new task history tabs should show only fixed operational task statuses. A compact period table is enough:

- period date/week
- fixed task name
- status
- completed/missing/pending count
- last updated or submitted date when available

Daily history should derive from existing daily stock matching, damaged report, and OUT verification records where reliable. Weekly history should derive from weekly cleaning proof records. If a status cannot be derived reliably from current data, show an unavailable or empty state instead of inventing completion.

### Sorting And Edge Cases

Manual checklist sorting:

1. incomplete before complete
2. high priority before normal before low
3. earlier due time before later due time
4. untimed tasks after timed tasks
5. older created time before newer created time

Additional edge cases:

- Empty manual checklist: show an empty state and Owner/Admin-only add button.
- Inventory users without manage permission can still check/uncheck items.
- Duplicate task titles are allowed initially.
- History views tolerate missing source records and show neutral empty states.

### Testing Strategy

- Unit tests for checklist sorting and permission helpers.
- API route tests for create, update, delete, and toggle RBAC.
- Service/repository tests for store and period filtering.
- Tests for completion audit behavior.
- Component tests for daily/weekly fixed tasks, manual checklist controls, and permission-based management actions.
- Update existing `InventoryWorkspace` tests for new `Riwayat` sub-tabs.

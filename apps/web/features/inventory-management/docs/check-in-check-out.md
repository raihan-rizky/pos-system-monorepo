# Inventory Check Out

Updated: 2026-10-14

## Workflow

- Inventory staff can access daily and weekly tasks directly, using existing permissions.
- The inventory page no longer displays Check In, Morning Check, task locks, or a Check In history tab.
- Check Out closes one operational day per store, using the Asia/Jakarta business date.
- Required tasks must be complete or have a non-empty exception note for each unfinished category. Weekly cleaning proof is required on Saturdays and optional on other days.
- A successful check-out creates or updates the store-day session with the operator, closure time, and operational snapshot. Failed validation writes no session data.
- No check-in identity, timestamp, or Morning Check snapshot is fabricated for new sessions.

## History and compatibility

- Riwayat Tugas Harian displays check-out records directly, with expandable summaries from stored checkOutSnapshot data.
- Existing check-in fields and snapshots remain stored. Older CHECKED_IN and NOT_CHECKED_IN sessions can use the new check-out flow.
- Legacy Morning Check details can still be read from older check-out snapshots.
- The old check-in API remains available for compatibility; the inventory page no longer calls it.
- No database migration or stock mutation is required.

## Validation

- Workspace tests cover direct access without a loaded session and an unlocked daily command center.
- Panel tests cover check-out without a prior session, closed days, loading, and fetch errors.
- Route and service tests cover validation before upsert, task-specific exceptions, historical snapshots, remaining daily tasks, and Saturday proof rules.
- Help and workflow tests ensure instructions guide users directly to tasks and check-out.

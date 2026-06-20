# Active Import Progress

## Understanding Summary

- Products page should detect active product import jobs for the current store.
- If an import is active, the import button changes to an "Import in progress" state.
- Clicking the active-state button opens a compact progress modal.
- The modal shows progress counts and supports Refresh, Cancel, and Retry where applicable.
- Products page polls active import status every 5 seconds while mounted.
- Product management remains usable if status polling fails.

## Assumptions

- Active statuses are `PENDING`, `RUNNING`, and `CANCEL_REQUESTED`.
- Active import status is store-scoped, not browser-session scoped.
- The modal keeps the last observed job while open so terminal state remains visible.
- Existing cancel and retry endpoints are reused.
- Refresh uses the same React Query refetch flow as polling.

## Decision Log

- Add active-job discovery endpoint.
  Alternatives: client-only state.
  Reason: works across refreshes, tabs, and users.

- Use compact progress modal.
  Alternatives: full import drawer, read-only popup.
  Reason: user selected compact modal with actions.

- Poll every 5 seconds and include manual Refresh.
  Alternatives: faster polling, polling only, server push.
  Reason: balances freshness, load, and user control.

- Poll last observed job detail while modal is open.
  Alternatives: only poll `/active`.
  Reason: `/active` returns null when terminal, so detail polling preserves completion state.

## Final Design

`GET /api/products/import/jobs/active` returns `{ job }` for the current active store job or `{ job: null }`.

The products page uses `useActiveProductImportJob()` with a 5-second polling interval. When an active job exists, the import button changes to "Import in progress" and shows processed/total row counts. Clicking opens `ProductImportProgressModal`.

The modal receives the active job or last observed job. While open, the page also polls the last observed job detail so completion, cancellation, or error state remains visible after `/active` returns null. Refresh refetches both active and detail queries.

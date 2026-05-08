# Production PWA Plan

## Understanding Summary

- Build a production-grade PWA upgrade for the existing Next.js POS app.
- The goal is installability, offline resilience, queued offline POS transactions, update prompts, sync controls, push notifications, and test coverage.
- Offline checkout is allowed: users can complete transactions offline and queue them locally.
- Sync runs automatically on reconnect and manually from Settings for all logged-in users.
- If stock is insufficient during sync, the server creates one adjusted transaction using available quantities. If totals change, it syncs as `PENDING_APPROVAL`.
- Offline transactions older than 7 days still sync, but into `PENDING_APPROVAL`.
- Push notifications use Browser Web Push, requested during first login, filtered by role and feature area.

## Assumptions

- Use Dexie/IndexedDB for local queue/cache.
- Cache all active products, categories, and salespersons; cache recently viewed/searched customers only.
- Support up to 500 unsynced transactions per device.
- Desktop-first UX; mobile remains functional.
- Offline payment methods are recorded as declared payment.
- Local storage security is basic browser/device security only.
- Maintenance is lightweight: logs and manual troubleshooting.
- Tests include unit tests for queue/sync logic and Playwright PWA/offline smoke tests.

## Recommended Approach

Use a staged production PWA design with a local Dexie queue and an explicit server sync API.

The service worker should stay focused on installability, static/app-shell caching, offline fallback, and update lifecycle messaging. Business-critical offline checkout and sync rules should live in typed app/server code, not inside service worker fetch handlers.

## Architecture

### PWA Shell

- Keep `manifest.json`, icons, install metadata, and service worker registration.
- Improve service worker lifecycle handling so the app can show an "Update available" prompt when a new worker is waiting.
- Keep service worker responsibility narrow:
  - App shell caching
  - Offline fallback
  - Static assets
  - Update signaling

### Local Offline Store

Use Dexie-backed tables for:

- `catalogProducts`
- `catalogCategories`
- `salespersons`
- `cachedCustomers`
- `offlineTransactions`
- `syncAttempts`
- `notificationSubscriptions`

Each offline transaction should store:

- `clientMutationId`
- original cart/items
- declared payment method
- original totals
- cashier/user/store ids
- created time
- expiry status
- sync state
- retry count
- adjustment/sync result details

### Sync Engine

The client sync service should:

- Read pending local transactions.
- Post them to the server sync endpoint.
- Update local sync state.
- Emit status for global UI.
- Run on app startup, reconnect, and manual Settings sync.

### Server Sync API

Add an endpoint such as:

```text
POST /api/offline-sync/transactions
```

The endpoint should validate:

- Authenticated user
- Store ownership
- Product availability
- Stock availability
- Customer references
- Salesperson references
- Declared payment method
- Idempotency by `clientMutationId`

It should return per-transaction results:

- `SYNCED`
- `PENDING_APPROVAL`
- `FAILED_RETRYABLE`
- `FAILED_FINAL`

## Data Flow

### Online Checkout

Online checkout continues posting directly to `/api/transactions`.

### Offline Checkout

1. App detects offline status or network failure during checkout.
2. Cashier completes checkout normally.
3. Transaction is saved to Dexie as `PENDING_SYNC`.
4. UI shows confirmation marked "Belum tersinkron".
5. Global banner shows offline/sync queue count.
6. When online returns, sync engine sends queued transactions oldest-first.
7. Server validates and returns per-transaction sync result.
8. Client marks rows as `SYNCED`, `PENDING_APPROVAL`, `FAILED_RETRYABLE`, or `FAILED_FINAL`.

### Stock Adjustment

- Server checks each line item against current stock.
- If all quantities are available, create a normal transaction.
- If some quantities are reduced, create one adjusted transaction.
- If totals change, transaction status becomes `PENDING_APPROVAL`.
- Original requested items/totals should be preserved as audit metadata.
- Client shows the sync result as requiring approval.

### Expired Queue Items

- If an offline transaction is older than 7 days at sync time, server creates it as `PENDING_APPROVAL`.
- The transaction is still synced so the business record is not lost.

## UI/UX

### Global Status Banner

Show a persistent global banner when relevant:

- Offline: "Offline mode: transactions will sync later"
- Syncing: "Syncing 3 transactions..."
- Sync failed: "2 transactions need attention"
- Update available: "New version available" with a refresh action

### Settings: Offline Sync

Add an Offline Sync section with:

- Queue count
- Last sync time
- Manual "Sync now" button
- Failed items list with retry status
- Clear synced history action

Do not allow clearing unsynced transactions from normal UI.

### POS Checkout

- If offline, allow checkout and save locally.
- Receipt/modal must clearly mark transaction as not yet synced.
- Payment method remains selectable.
- If offline queue reaches 500, block further offline checkout and require sync.

### Push Notifications

Use Browser Web Push only.

Ask for permission during first login after explaining why notifications are useful.

Save subscriptions server-side with:

- user id
- role
- store id
- feature preferences

Filter notifications by role and feature area:

- Owner/Admin: sync failures, pending approvals, production status, WhatsApp, orders.
- Cashier: assigned sync results, checkout issues, order/payment updates.
- Sales: customer/order updates and production status relevant to their orders.

## Error Handling

- Queue write failure: block checkout and show a hard error.
- Duplicate sync submission: use stable `clientMutationId` for idempotency.
- Partial sync failure: continue syncing other queued transactions.
- Auth expired: stop sync, show login required, keep queue intact.
- Store/user mismatch: reject or mark `FAILED_FINAL`.
- Queue older than 7 days: sync as `PENDING_APPROVAL`.
- Product missing/inactive: remove unavailable line and create adjusted pending transaction if anything remains.
- No line items remain after adjustment: reject sync and keep local failure record.
- Total changes: always `PENDING_APPROVAL`.
- Payment amount mismatch: preserve declared payment as metadata; server approval resolves final financial treatment.

## Service Worker Rules

- Do not cache mutation API responses.
- Avoid caching authenticated HTML too aggressively.
- Use cache-first for static assets.
- Use network-first with a short timeout for safe API GETs.
- Do not serve stale checkout-critical data unless the UI clearly labels it as cached/offline data.

## Testing Strategy

### Unit Tests

- Dexie queue creation, ordering, expiry marking, retry increments.
- Sync result reducer states.
- Stock adjustment calculation.
- Queue limit enforcement at 500.
- Idempotency payload generation using `clientMutationId`.

### API/Integration Tests

- Normal queued transaction sync.
- Insufficient stock creates adjusted `PENDING_APPROVAL`.
- Expired transaction creates `PENDING_APPROVAL`.
- Duplicate `clientMutationId` returns existing result instead of double-creating.
- Cross-store payload is rejected.

### Playwright Smoke Tests

- Manifest is reachable and valid.
- Service worker registers in production build.
- Offline navigation shows cached shell/fallback.
- POS offline checkout saves queued transaction.
- Settings "Sync now" control is visible and disabled/enabled correctly.
- Update prompt appears when service worker update is simulated.

### Lighthouse/Manual Checklist

- Installable PWA criteria.
- Offline fallback behavior.
- Icon and maskable icon quality.
- No service worker caching of unsafe mutation routes.

## Decision Log

- Use queued offline transactions instead of read-only offline mode, because cashier continuity is a core requirement.
- Use both auto-sync and manual Settings sync, because reconnect should be convenient but users need direct control.
- Allow all logged-in users to sync their own local queue, because the queue is device-local and operationally simple.
- Use Dexie/IndexedDB instead of raw IndexedDB or localStorage, because structured offline data needs indexes, migrations, and maintainable queries.
- Support up to 500 unsynced transactions per device, balancing field usefulness with browser storage and sync complexity.
- Cache all active products, categories, and salespersons; cache only recent/searched customers to limit local data size.
- Create a single adjusted transaction when stock is insufficient, preserving original requested data for audit.
- Mark adjusted transactions as `PENDING_APPROVAL` when totals change, avoiding silent financial mismatch.
- Sync expired offline transactions as `PENDING_APPROVAL`, preserving business records while requiring review.
- Use Browser Web Push only, not WhatsApp routing, to keep notification delivery focused.
- Filter notifications by role and feature area to avoid noisy operational alerts.
- Use basic browser storage security, with encryption/device trust out of scope for this iteration.
- Keep maintenance lightweight with logs and manual troubleshooting rather than a dedicated ops process.

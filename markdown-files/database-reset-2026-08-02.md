# Database Reset — 2026-08-02

## Status

Approved design specification for an owner-only, selective operational-data reset in Settings.

## Context

The POS application needs a safe way for an owner to clear operational data for the currently authenticated store. The reset must not remove users, owner access, store settings, RBAC configuration, or shared/global data. Because the Prisma schema has both cascade and restrictive relationships, the UI must explain the impact before execution and the server must validate the dependency graph again before deleting anything.

## Goals

- Add a Reset Database area under Settings that is visible to `OWNER` only.
- Let the owner select one or more operational domains.
- Preview record counts, cascade children, and required dependencies before deletion.
- Require the exact confirmation phrase `RESET DATABASE`.
- Limit every operation to the current store.
- Execute the final delete as one atomic Prisma transaction.
- Preserve users, store settings, RBAC permissions, and shared/global tables.
- Make rollback and failure behavior explicit and testable.

## Non-goals

- Full database reset.
- Cross-store or global reset.
- Automatic seeding after reset.
- Deleting users, roles, store settings, or RBAC permissions.
- Deleting shared categories, assistant chat history, vector/document data, or legacy shared tables.
- A background reset job or progress worker in the first version.

## User experience

Settings receives an owner-only `Reset Database` tab presented as a danger zone. The user selects top-level domains rather than database tables. Dependent records are automatically included and locked. The UI labels why they are included:

- **Cascade:** the child is removed with its selected parent.
- **Required dependency:** the related domain must also be selected because the database constraint would otherwise reject the delete.
- **Preserved/shared:** the record is not eligible because it is global or outside the current-store scope.

The flow is:

1. Owner opens Settings > Reset Database.
2. Owner selects one or more domains.
3. Owner clicks `Lihat Dampak Reset`.
4. The preview shows per-model counts, cascade children, required dependencies, and warnings.
5. If a required dependency is missing, execution remains disabled and the UI explains which domain must be added.
6. Owner types `RESET DATABASE`.
7. Owner clicks `Reset Data Terpilih`.
8. After success, the UI shows counts deleted per domain and the execution timestamp.
9. Product, transaction, customer, supplier, inventory, finance, dashboard, and related query caches are invalidated. Store settings and RBAC remain available.

The selection domains are:

| Domain | Scope | Examples of included records |
| --- | --- | --- |
| Katalog Produk | Current store | Products, brands, stock groups, printing services, product-supplier links, price logs, stock-group activities |
| Pelanggan | Current store | Customers and eligible customer-related records |
| Penjualan & Keuangan | Current store | Transactions, transaction items, payments, shifts, expenses, invoice-date logs, production logs |
| Supplier & Pengadaan | Current store | Suppliers, shopping requests, goods purchases, inbound receipts and child lines |
| Inventaris & Operasional | Current store | Inventory logs, verifications, corrections, internal stock-out requests, surat jalan, inventory tasks, day sessions, checklists |
| Import & Batch Jobs | Current store | Product imports, bulk stock imports, batch operations and child rows |
| Notifikasi Store | Current store or current-store subscriptions | Store notifications and push subscriptions eligible for the current store |

The domain registry is the source of truth for exact model membership and dependency edges. The UI must not allow arbitrary model names.

## Architecture

Create an isolated `database-reset` feature module containing:

- A typed domain registry and allowlist.
- Dependency-closure logic that expands selected domains into cascade and required dependencies.
- Store-scoped Prisma where clauses.
- Preview/count helpers.
- Child-first deletion plans.
- Shared response types for the Settings UI and route handlers.

Add two owner-only routes:

- `POST /api/settings/database-reset/preview`
- `POST /api/settings/database-reset/execute`

Both routes use `requireRole("OWNER")`. Frontend visibility is only a UX optimization; authorization is enforced server-side. The execute route accepts only validated domain selections and the confirmation phrase, then recomputes the plan on the server. It must not trust a client-provided list of models, counts, or dependencies.

## Scope and preservation rules

Every reset query is constrained to the current authenticated user's `storeId`. The server must reject or ignore any client attempt to provide another store ID.

The following are preserved and never enter the deletion allowlist:

- `User` / `pos_users`.
- `Store` / `pos_stores`.
- `StoreSettings`.
- `RolePermission`.
- Global `Category` records, because the schema does not scope them by store.
- Assistant chat/session/message data, vector/document data, and shared legacy tables without a current-store ownership field.

If a selected domain references a preserved global record, the preview explains that the shared record stays intact. A delete that would affect another store is not allowed.

## Dependency behavior

The planner distinguishes two relationship types:

1. **Cascade dependency:** automatically included and locked in the preview. For example, deleting a transaction includes its transaction items and payments.
2. **Required dependency:** automatically identified but requires the owner to select the related top-level domain. For example, deleting a product may require related sales/procurement data when restrictive product references exist. The execute action is rejected if the required domain is absent.

The planner produces a deterministic child-first order. It must account for join tables, history/log tables, optional foreign keys, restrictive foreign keys, and rows that are linked to more than one selected domain. A model is deleted once even if it is reachable through multiple selected domains.

## API contracts

Preview request:

```ts
{ domains: DatabaseResetDomain[] }
```

Preview response:

```ts
{
  storeId: string;
  domains: Array<{
    id: DatabaseResetDomain;
    selected: boolean;
    count: number;
  }>;
  cascades: Array<{
    model: string;
    count: number;
    reason: string;
    sourceDomain: DatabaseResetDomain;
  }>;
  requiredDependencies: Array<{
    domain: DatabaseResetDomain;
    reason: string;
    blocking: boolean;
  }>;
  preserved: Array<{ model: string; reason: string }>;
  canExecute: boolean;
}
```

Execute request:

```ts
{
  domains: DatabaseResetDomain[];
  confirmation: "RESET DATABASE";
}
```

The response includes a success summary with deleted counts by model/domain and an execution timestamp. Error responses use the existing API response conventions.

## Transaction and failure handling

The execute handler validates authentication, role, domain values, confirmation phrase, current-store scope, active-process constraints, and the current dependency plan before opening the transaction. Deletion happens child-first inside one Prisma transaction. Any constraint failure, timeout, or unexpected database error rolls back the entire operation.

Execution is blocked when:

- The caller is not authenticated or is not an owner.
- No domain is selected.
- The confirmation phrase does not exactly match `RESET DATABASE`.
- A required dependency is not selected.
- The current store has an open cashier shift.
- A product import or bulk/batch operation is actively running.

The UI disables the submit control while executing. The server remains the final guard against duplicate or stale submissions and recomputes counts/dependencies immediately before deletion.

Error mapping:

- `401` — unauthenticated.
- `403` — non-owner.
- `422` — invalid selection or confirmation phrase.
- `409` — missing required dependency or active operational process.
- `500` — unexpected failure; the transaction is rolled back.

## Testing strategy

- Unit-test dependency closure, cascade inclusion, required-dependency detection, deduplication, child-first ordering, and preserved/global model rules.
- Unit-test store isolation and rejection of arbitrary store IDs/model names.
- API-test owner authorization, non-owner rejection, preview validation, confirmation validation, active-process blocking, successful execution, and rollback behavior.
- Component-test owner-only tab visibility, domain selection, locked cascade rows, required-dependency warnings, phrase validation, disabled execute state, and success summary.
- Add an E2E flow using mocked reset endpoints so the test suite never wipes a real database.

## Documentation follow-up

After implementation, update the Bantuan page with the owner-only Reset Database workflow and safety rules. Update the AI Assistant workflow catalog only if a guided reset workflow is intentionally exposed there; merely adding a Settings tab does not add a guided assistant workflow.

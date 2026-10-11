# Production migration and source publication

Date: 2026-10-11 (Asia/Jakarta)

The user authorized migrating the production database and committing/pushing the committed and uncommitted work on local main. The publication target is origin/main. Generated Next.js output, environment files, local recovery snapshots, and Serena cache/settings are excluded from publication.

## Production database

The repository shortcut references a missing packages/db/.env.production file. The existing packages/db/env.production.env was used explicitly with dotenv override and Prisma migrate deploy. Credentials were not printed or committed. No reset, db push, seed, or data-loss flag was used.

Preflight found seven pending migrations and one already-applied historical migration missing locally. The original 20260727_transaction_search_trgm_indexes/migration.sql was restored from Git commit 62849a1. Its SHA-256 checksum exactly matches production's applied record: 75811cf3185c82acf8b439757875f8c14f466d9cf43bc3f59b71bed2d48d971b. That migration was not rerun or marked applied manually.

All seven pending migrations applied successfully:

- 202610050001_shopping_request_name
- 202610050002_supplier_receipt_cost
- 202610050003_payment_method_tempo
- 202610050004_transaction_stock_audit
- 202610050005_category_sales_group
- 20261009090000_customer_pricing_formulas
- 20261010_unified_shopping_request_approval

Final Prisma migration status reports database schema up to date, with 71 local migrations. Read-only metadata verification confirms no missing local history entries, no incomplete migration records, and the new columns/enums. Schema/history snapshots are retained locally; they contain no row-level store data. Optional product units require no additional schema migration.

## Source and validation

The previously uncommitted work includes product descriptions/catalog unit badges, POS panel and checkout behavior, customer recap preferences, Supplier print layout, development prefetch/bundler settings, import-worker environment scripts, tests, and matching help/workflow guidance. No dependency versions changed.

The exact 53-file source/documentation snapshot matches the checkout that passed 2,478 tests, with 10 skipped. Browser unit checks and source TypeScript pass. Full workspace checking retains three pre-existing generated-route validator errors. Selected source ESLint passes with zero errors and two warnings in an existing mocked hook test. Its missing root plugin resolution was handled through NODE_PATH pointing to the existing pnpm store, without changing dependencies or bypassing lint.

GitNexus staged review of the source snapshot covers 53 files, 78 symbols and ten processes with HIGH aggregate risk, matching the approved broad source scope. The final commit also restores the migration file, ignores generated local artifacts, and records this delivery. Normal pre-commit/pre-push hooks remain enabled.

The git-pushing helper is executed through a local Windows-compatible copy with LF line endings, explicit force-add for the reviewed ignored Markdown paths, and a cleanup guard that resolves its temporary directory and verifies containment before deletion. Its isolated index, branch-race checks, normal hooks, and non-force push behavior remain intact.

Recovery files: C:/Users/Raihan Rizki/.codex/backups/product-optional-units-2026-10-11/production-push. Earlier merge backups/stashes are retained. No production build or development-server lifecycle operation was performed. Drive D is unavailable, so this report is saved under this checkout's markdown-files directory. Headroom stats/compression were used; its proxy was unreachable, and output remained bounded.

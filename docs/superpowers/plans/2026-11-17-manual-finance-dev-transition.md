# Manual Finance Development Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement and verify each task in order. A production build is performed only by GitHub Actions.

**Goal:** Apply the four reviewed manual-finance migrations to development and activate the exact verified `dev` artifact without allowing an old writer to change the migrated database.

**Architecture:** A root-only, development-specific cutover records durable intent, closes the existing verified dev ingress gate, drains the old services and fences their database logins before taking and verifying a fresh backup. Migrations run as a temporary login whose effective database role is the existing application owner. Once the requested commit has passed GitHub CI, a journalled forward switch validates the artifact, migrated database, runtime and permissions before reopening the dev gate. Failures after migration keep the gate closed and recover forward; they never restore an incompatible application.

**Tech Stack:** Python 3, PostgreSQL 17, Prisma, systemd, GitHub Actions, existing VPS release adapters.

**Spec:** `markdown-files/kategori-keuangan-manual-design-2026-11-16.md`, `markdown-files/rencana-kategori-keuangan-manual-2026-11-16.md`, and `docs/ops/cicd-vps-runbook-2026-11-10.md`.

## Global Constraints

- Development only. Verify the full PostgreSQL identity of each target before any write. The server uses the database name `postgres` in both environments and separate, independently verified PostgreSQL clusters. Read-only identity checks are allowed. Production stays outside this rollout.
- Do not modify existing migration history or forge a release baseline. Bind the operation to the existing active release, reviewed migration checksums, actual backup, expected schema hash, exact Git commit, CI run and artifact.
- Preserve the shared deployment lock, artifact provenance, disk safety checks and protected rollback history. No `db push`, seed, reset, force push or local production build.
- Export the Prisma bundle from the reviewed Git tree, not the Windows worktree. Git's LF-normalized bytes must be identical to the later CI artifact and the checksums recorded by Prisma.
- Keep the dev ingress gate and login fence persistent over interrupted commands and reboot. Only release them once the new application and database have passed verification; preserve a durable journal for forward recovery.
- User data, payment totals, existing permissions and applied migration records must survive. Do not print secrets or customer data. Use a fresh backup after writers are fenced and verify it on an isolated restored copy.

## Review Focus

- A crash between every journal write and external action must leave either the old compatible release or a fenced development environment with a forward recovery path.
- A delayed request, existing database session, systemd restart or retry must not allow an old process to write after migration.
- A candidate with the wrong commit, schema, migration bytes, target or database fingerprint must never become active or open the gate.
- Migrator identity must be restricted to the test/dev database and use the effective owner role so new tables, RLS and triggers remain accessible to the application.
- A failed backup, insufficient disk, changed database identity, stale CI run, failed canary or verification timeout must fail closed without altering production.

### Task 1: Durable journal and target validation

**Files:** Create `scripts/deploy/manual_finance_dev_cutover.py`; create `scripts/tests/test_vps_manual_finance_cutover.py`.

**Interfaces:** `Journal(path, binding).load()` returns the complete phase record or `None`; `Journal.advance(expected, next_phase, evidence)` atomically persists and fsyncs the next phase, and accepts an identical retry. `validate_plan(plan)` accepts only the exact dev target, separate PostgreSQL clusters, release SHA, candidate tree, schema hashes and four migration checksums.

- [x] Write tests that reject a production or same-cluster target, changed binding, invalid phase transition, symlink, unsafe permissions and incomplete evidence.
- [x] Run `python -m unittest discover -s scripts/tests -p test_vps_manual_finance_cutover.py` and observe the missing implementation fail.
- [x] Implement the journal and validation using atomic replacement and directory fsync; retain evidence needed to resume.
- [x] Run the new tests and the existing `test_vps_release.py` suite. Do not weaken ordinary deployment or rollback checks.

Ruling: Treat equal PostgreSQL cluster identifiers as the same target even if database names differ, since login changes apply to the whole cluster. The journal records no credentials. The final migrator, fencing and recovery adapters do not exist yet and this module cannot operate on a live service by itself.

### Task 2: Fence and migration rehearsal

**Files:** Extend `scripts/deploy/manual_finance_dev_cutover.py` and `scripts/tests/test_vps_manual_finance_cutover.py`.

**Interfaces:** `fence(plan, adapters, journal)` verifies the dev-only ingress gate, drains the worker and web, disables every discovered non-superuser login that can assume a role with write access to an application table, terminates only those dev sessions, and creates an isolated migrator with the application owner as its effective role. `migrate(plan, adapters, journal)` requires a verified current backup and the exact four migration files before executing Prisma.

- [x] Write failure-injection tests for identity mismatch, a rejected or partial fence, backup failure, wrong migration bytes and an interrupted migration. Assert no migration starts before the fence and backup are verified.
- [x] Run the tests red, implement the adapter-backed state transitions, then run the tests green. The real VPS adapter is not implemented yet.
- [ ] Write and run failure-injection tests for undrained transactions, partial role changes, restarts and real migration-file verification; implement the host adapter only after those tests fail for the expected behavior.
- [ ] Rehearse on an isolated restored dev snapshot. Verify the original columns of all existing application tables, pre-existing role permissions, migration status, owner privileges, RLS and enabled ledger triggers. Confirm migration retry is idempotent.

Evidence: a snapshot restored without `pg_cron` had the same baseline database fingerprint as the active dev release. All four migrations succeeded both from the worktree and from a temporary Git tree; the latter's recorded checksums matched the Git files. A baseline comparison preserved the old columns of 79 application tables and every existing permission row. An isolated role test confirmed the old login is rejected after fencing and a separate migrator can still assume the owner role. These checks do not replace the complete host-adapter rehearsal.

Ruling: Fence `postgres`, `authenticator` and `supabase_storage_admin` on the current dev cluster. The storage role can assume `service_role`, which can write application tables. Recompute and bind the complete writer set immediately before fencing; if it differs, abort instead of leaving an unguarded writer. This temporarily interrupts dev storage and PostgREST as well as web writes.

### Task 3: Verified forward activation and recovery

**Files:** Extend `scripts/deploy/manual_finance_dev_cutover.py` and `scripts/tests/test_vps_manual_finance_cutover.py`.

**Interfaces:** `activate(plan, adapters, run_id, artifact_id)` validates the successful CI run, exact branch head, artifact provenance and migration contents, then records the candidate and performs a recoverable forward switch under the deployment lock. `recover(plan, adapters)` resumes from every journalled phase without starting an incompatible old writer.

- [ ] Write failure-injection tests for stale SHA, incorrect schema/fingerprint, changed artifact, failure before and after service switch, restart during the transition and failed readiness. Verify the gate remains closed on each failure and old rollback remains prohibited after migration.
- [ ] Run the tests red, implement and run them green, then run the existing deployment/security test suites and an isolated end-to-end cutover rehearsal.
- [ ] Review the concrete script, journal and rehearsal evidence. Verify staging has at least 4 GiB free before changing the development database.

### Task 4: Development release

- [ ] Complete the ordered payment, allocation, date, RBAC, giro, type-check and wider test gates; resolve or explicitly identify any critical failure before continuing.
- [ ] Recheck the latest `dev` head, database identities, active release, preflight and free space. Close the gate, fence writers, take and verify a fresh backup, and apply only the four migrations.
- [ ] Review and commit the feature and approved transition files, push the exact commit to `dev`, and monitor its CI through GitHub MCP.
- [ ] Validate the exact successful artifact and complete the forward switch. Verify migrated schema, role privileges, app readiness, old writer termination and reopening of dev ingress. Monitor the GitHub deployment for that same commit until successful.

### Dev baseline on 21 November

The active GitHub branch and VPS release were verified at `49e2464d`. Apply the manual finance migrations after the expense correction migrations already present in that release. The verified rehearsal applied all four from Git, checked the stored checksums, and reran Prisma with nothing left to apply.

The root entry point in `scripts/deploy/manual_finance_dev_host.py` uses the installed dev firewall adapter, the shared deployment lock, and the existing artifact verifier. Stage the reviewed tree's schema and migration directory beside the private plan. Use `preflight` to check the branch baseline, dev database, backup target and release state. After the application tests pass, `migrate` closes dev ingress, drains services, fences writers, restores the new backup into the isolated fixture, and applies the reviewed migrations. Use `activate` with the commit, CI run and artifact IDs, or `recover` to resume with evidence already in the journal.

The active inventory close job uses a fenced database login through a normal PostgreSQL connection. The preflight verifies this for every active cron job. The archive retains cron data. The scratch restore skips the extension because that extension can run only in the fixture cluster's primary database.

The unvoid rollout advanced GitHub `dev` and its migration history to `fcb23c8d` while the VPS still served `49e2464d`. The standard deployment correctly rejected that mismatch. The cutover plan records the verified live database fingerprint from a fresh unvoid snapshot separately from the older runtime record. The candidate commit must descend directly from the reviewed `dev` commit. The registry changes only after the candidate passes runtime and database readiness.

GitHub CI checks out `schema.prisma` and `migration_lock.toml` with LF endings. The artifact verifier checks these two files against the reviewed Git content after CRLF normalization. Every SQL file still uses exact Git bytes, including the four checksums recorded by Prisma on dev.

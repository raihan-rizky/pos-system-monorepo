# CI/CD GitHub VPS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push main deploys production and push dev deploys development, after successful isolated CI, with compatible rollback and bounded disk usage.

**Architecture:** Two Actions workflows separate unprivileged CI/build from privileged deployment. A standard-library Python helper validates immutable GitHub artifacts and controls existing systemd services through restricted SSH and persistent jobs. Existing native runtime packaging is retained.

**Tech Stack:** GitHub Actions, Node 22, pnpm 10.24.0, Python 3.14 on VPS, systemd, OpenSSH.

**Spec:** `docs/superpowers/specs/2026-11-10-cicd-github-vps-design.md` (approved).

## Global Constraints

- main maps to prod, dev maps to dev. No deployment from PR/fork/codex branches.
- Build only in GitHub; do not run local production build or manage user's dev server.
- No production/dev database secrets in CI; no automatic migrations, seed/reset, or data restoration.
- Retention 72 hours, one healthy local rollback per environment, active/in-flight protection, global lock.
- At least 4 GiB before staging and 1 GiB afterwards; worker decision timeout 120 seconds without SIGKILL; readiness 60 seconds.
- Preserve unrelated dirty files. Reuse existing isolated worktree; stage explicit paths only.
- Implementation already authorized; execute inline without another permission round. Shared branch pushes and VPS bootstrap implement the approved design, with auto-deploy disabled until verified.

## Review Focus

- A PR-triggered successful run must not acquire deployment access (Task 1/4 provenance tests).
- A rollback must not be immediately undone by a queued deployment of the same bad SHA (Task 2 blocked-SHA test).
- Archive links/traversal and checksum substitution must fail before extraction (Task 1 archive tests).
- Worker timeout or interrupted switch must preserve both paths and recover old services (Task 2 fake-service tests).
- Environment fingerprint/schema drift must block deployment/rollback without modifying database (Task 1/2 compatibility tests).

## File Structure

- Modify `scripts/package-vps-artifact.mjs` and its tests: append schema/media fingerprints and GitHub build identity.
- Create `scripts/deploy/release_policy.py`: pure provenance, manifest, retention and extraction validation.
- Create `scripts/deploy/pos_release.py`: fixed-path CLI, Actions download, persistent job/state, systemd activation, status and cleanup.
- Create `scripts/deploy/install.sh`: install helper, sudo/SSH limits, cleanup/recovery units and worker stop settings.
- Create `scripts/tests/test_vps_release.py`: policy, filesystem and fake-service regression tests.
- Replace `.github/workflows/production.yml` and `.github/workflows/vps-artifact.yml` with `ci.yml` and `deploy.yml`.
- Create `scripts/build-vps-runtime.sh` and `scripts/deploy/dispatch.py`: packaging shell and bounded SSH client for Actions.
- Create runbook in approved C: documentation folder and versioned docs.

### Task 1: Immutable artifact and release policy

**Interfaces:** `validate_run(run, target, artifact)` raises `ReleaseError`; `validate_metadata(meta, target, expected)`; `cleanup_plan(records, protected, now)` returns release IDs; `extract_runtime(archive, destination)` rejects unsafe entries.

- [ ] Add failing metadata/policy tests for branch/event/repo/target/SHA/expiry/config/schema, archive traversal and symlink escape, plus 72-hour boundaries.
- [ ] Run `python -m unittest discover -s scripts/tests -p test_vps_release.py` and Node packaging tests; confirm missing behavior fails.
- [ ] Run GitNexus impact for existing packager `main`; implement only required metadata and pure policy.
- [ ] Run tests to green, syntax checks, staged scope/detect-changes; commit explicit task files.

### Task 2: Activation, journal and retention engine

**Interfaces:** `ReleaseManager(config, services, github)` provides `deploy(request)`, `rollback(request)`, `recover()`, `cleanup(apply=False)`. Services provide state, canary, drain, switch and readiness; GitHub provides verified run/artifact download and branch head.

- [ ] Write failing tests using temporary roots and fake services for success, no-op duplicate, stale SHA, schema drift, failed readiness, worker timeout, interrupted switch, blocked SHA, active path protection and expired cleanup.
- [ ] Run tests RED, then implement persistent atomic JSON state, global locking, protected filesystem operations and recovery.
- [ ] Verify GREEN and compile Python. Keep live commands isolated behind service/GitHub adapters; no business DB writes.
- [ ] Commit explicit task files after detect-changes.

### Task 3: Restricted SSH and host adapter

**Interfaces:** SSH stdin JSON `{action,target,run_id,artifact_id,operation_id}`; response sanitized JSON with operation ID/state. Fixed root helper queues systemd jobs, status polls never execute arbitrary commands.

- [ ] Write failing request-validation and installer contract tests (unknown action, target escalation, invalid IDs, forwarding/host checking, worker SIGKILL protection).
- [ ] Implement Actions REST access through existing gh, safe ZIP download, runtime probes, fixed systemd overrides, persistent operation/recovery and dry-run cleanup timer.
- [ ] Implement installer with dedicated SSH user, root-owned helper, forced commands bound to target and narrowly scoped sudo.
- [ ] Run Python tests, shell syntax checks, and helper `--help`; commit explicit files after detect-changes.

### Task 4: CI and deployment workflows

**Interfaces:** CI name `POS CI`; artifact `pos-runtime-{prod|dev}-{github.run_id}` contains tar.gz, metadata.json and sha256sums.txt. Deploy workflow consumes completed CI run ID and artifact ID; dispatch client uses restricted SSH stdin protocol.

- [ ] Add failing workflow/dispatcher tests for PR skip, branch mapping, manual rollback, no build SSH secret, no live CI database secret and no deployment cancellation.
- [ ] Implement ci.yml: install/generate/type-check/unit/safety/policy/E2E/build; target public config only on trusted branch build; PR dummy config and no deployable artifact; upload runtime retention 3 days.
- [ ] Implement deploy.yml on successful workflow_run or manual dispatch, gated by AUTO_DEPLOY_ENABLED for automatic events, with environment mapping, known_hosts and least permissions.
- [ ] Implement dispatcher polling persistent operation to completion and emitting sanitized GitHub summary. Remove duplicate legacy workflows.
- [ ] Run unit tests and actionlint, package tests and type-check where applicable; commit explicit files after detect-changes.

### Task 5: Review, bootstrap and prove both environments

- [ ] Fresh whole-branch review against approved spec; fix significant findings with regression RED/GREEN.
- [ ] Set AUTO_DEPLOY_ENABLED=false, install helper/config/keys without changing active release, initialize verified current state; verify dry-run and constrained SSH.
- [ ] Push only committed baseline + CI/CD changes, run PR CI and integrate normally without force push; CI failures must be diagnosed and fixed, not bypassed. Synchronize dev from main.
- [ ] Wait for completed successful CI artifacts for dev/main. Manual deploy dev then production; verify public login/assets/Auth and service paths/versions, readable DB connection, and safe worker handling.
- [ ] Enable auto-deploy only after both succeed. Trigger harmless committed change on each target branch and follow real workflow_run deploys through completion.
- [ ] Run cleanup dry-run/apply only on registered safe files. Verify 72-hour timer, current/rollback protection, disk space, and no database/media/backup changes.
- [ ] Update runbook and ledger with commands, verified runs, limitations and rollback procedure. Final Headroom stats.

## Self-review

All spec sections map to these five tasks. Shared interfaces: Task 1 -> Task 2 policy functions; Task 2 -> Task 3 adapters/CLI; Task 3 -> Task 4 SSH JSON protocol; Task 4 -> Task 5 workflow/artifact identity. No automatic database migration is introduced. Baseline main/dev branch creation is already complete; do not repeat it.

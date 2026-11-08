# GitHub Actions VPS Artifact Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a manually triggered GitHub Actions workflow that builds a selected commit on a larger Linux runner and publishes a portable Next.js runtime artifact for VPS installation.

**Architecture:** The workflow checks out an explicit ref, installs the locked pnpm workspace, generates Prisma Client, and runs the existing Turbo production build with CI-only placeholder database/Auth values. It then uses `pnpm --filter @pos/web deploy --prod` to create a portable runtime, adds the compiled `.next` and public assets, writes metadata/checksums, and uploads a short-lived artifact. VPS installation remains a separate, loopback-validated release step.

**Tech Stack:** GitHub Actions, Ubuntu runner, Node 22, pnpm 10.24.0, Turborepo, Next.js 15, Prisma, Node.js built-in test runner, tar/gzip, SHA-256.

**Spec:** `docs/superpowers/specs/2026-11-08-github-actions-vps-artifact-builder-design.md`

## Global Constraints

- The workflow must not run `db:migrate:prod` or use production credentials.
- The VPS service, public DNS, and active databases remain unchanged during artifact generation.
- The runtime artifact must contain a valid `apps/web/.next/BUILD_ID` equivalent and a checksum manifest.
- The repository remains private; uploaded artifacts use GitHub Actions access controls and seven-day retention.
- Do not run `pnpm build` in the interactive agent session; build verification runs on GitHub Actions.

## Review Focus

- A manually selected commit must be the commit actually built; the artifact metadata must record the checked-out SHA.
- A missing or partial Next build must fail before upload; the workflow must require `apps/web/.next/BUILD_ID`.
- Production migration commands or secrets must never be reachable from the artifact workflow; the contract test pins the forbidden/required strings.
- The portable runtime must include production dependencies and Prisma-generated files; `pnpm --filter @pos/web deploy --prod --legacy` and a runtime smoke check pin this.
- Artifact integrity must be independently verifiable after download; the workflow emits `sha256sums.txt` and verifies it before upload.

---

### Task 1: Add the workflow contract test

**Files:**
- Create: `scripts/tests/vps-artifact-workflow.test.mjs`
- Test: `scripts/tests/vps-artifact-workflow.test.mjs`

**Interfaces:**
- Consumes: `.github/workflows/vps-artifact.yml` as text.
- Produces: deterministic Node test coverage for required inputs, safety guards, build commands, packaging, and upload settings.

- [ ] **Step 1: Write the failing test**

  Add a Node `node:test` case that reads `.github/workflows/vps-artifact.yml` and asserts:
  `workflow_dispatch`, required `ref` input, `actions/checkout@v4`, pnpm `10.24.0`, Node `22`, `pnpm db:generate`, `pnpm exec turbo run build`, `pnpm --filter @pos/web deploy --prod --legacy`, `apps/web/.next/BUILD_ID`, `sha256sum`, and `actions/upload-artifact@v4` with `retention-days: 7` are present. Assert `db:migrate:prod`, `DATABASE_URL` production references, and `DIRECT_URL` production references are absent.

- [ ] **Step 2: Run the test to verify it fails**

  Run `node --test scripts/tests/vps-artifact-workflow.test.mjs`.
  Expected: FAIL because `.github/workflows/vps-artifact.yml` does not exist yet.

### Task 2: Implement the portable artifact workflow

**Files:**
- Create: `.github/workflows/vps-artifact.yml`

**Interfaces:**
- Consumes: `workflow_dispatch` input `ref` (default `main`), repository contents, and CI placeholder environment values.
- Produces: GitHub artifact `vps-web-runtime-<checked-out-sha>` containing `pos-web-runtime-<sha>.tar.gz`, `sha256sums.txt`, and `metadata.json`.

- [ ] **Step 1: Add workflow setup**

  Define `workflow_dispatch` with a required `ref` input, `contents: read`, a per-ref concurrency group, `ubuntu-latest`, and a 45-minute job timeout. Set only CI-safe placeholder values for `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

- [ ] **Step 2: Add deterministic build steps**

  Checkout the input ref, setup pnpm 10.24.0 and Node 22 with pnpm cache, run `pnpm install --frozen-lockfile`, run `pnpm db:generate`, and run `pnpm exec turbo run build`.

- [ ] **Step 3: Stage the portable runtime**

  Run `pnpm --filter @pos/web deploy --prod --legacy artifact/runtime`; copy `apps/web/.next`, `apps/web/public`, `apps/web/next.config.mjs`, and the web package manifest into the staged runtime. Fail if `artifact/runtime/.next/BUILD_ID` or `artifact/runtime/node_modules/next` is missing.

- [ ] **Step 4: Write metadata and checksums**

  Record the checked-out SHA (`git rev-parse HEAD`), requested ref, build ID, runner image, and UTC timestamp in `metadata.json`. Create `pos-web-runtime-<sha>.tar.gz` from the staged runtime and write `sha256sums.txt`; run `sha256sum --check sha256sums.txt` before upload.

- [ ] **Step 5: Upload the bounded artifact**

  Upload only the archive, metadata, and checksum manifest with `actions/upload-artifact@v4`, a deterministic artifact name, and `retention-days: 7`. Do not upload `.env` files, logs, or the workspace `node_modules` tree outside the portable runtime.

### Task 3: Verify locally and through GitHub Actions

**Files:**
- Modify: none beyond Tasks 1–2.

**Interfaces:**
- Consumes: the workflow contract test and pushed workflow branch.
- Produces: a successful GitHub Actions run, artifact metadata, archive checksum, and a recorded run URL for VPS transfer.

- [ ] **Step 1: Run the contract test**

  Run `node --test scripts/tests/vps-artifact-workflow.test.mjs`.
  Expected: PASS.

- [ ] **Step 2: Run syntax and scope checks**

  Run `git diff --check`, `git status --short`, and `node --check scripts/tests/vps-artifact-workflow.test.mjs`.
  Expected: no whitespace errors, only the intended files changed, and exit code 0.

- [ ] **Step 3: Push the branch and dispatch the workflow**

  Push the workflow commit to `codex/remove-hardcoded-db-credential`; dispatch `VPS artifact` for the exact intended ref through GitHub Actions. Do not dispatch against production credentials or change the production alias.

- [ ] **Step 4: Verify the run and artifact**

  Confirm the run is successful, read `metadata.json`, verify the checked-out SHA equals the requested ref, and verify `sha256sum --check sha256sums.txt` after downloading the artifact. Record the run ID, archive size, build ID, and checksum for the later VPS handoff.

- [ ] **Step 5: Run final repository checks**

  Run `git diff --check` and GitNexus `detect_changes()` before any commit; confirm only the workflow, contract test, design, and plan files are in scope.

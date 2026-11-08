# GitHub Actions VPS Artifact Builder Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. The dev build runs on GitHub Actions, not on the interactive workstation or VPS.

**Goal:** Build a verifiable, portable dev release on GitHub Actions for the existing VPS.

**Architecture:** Build an exact application ref in an Ubuntu/Node 22/pnpm 10 workspace using a dummy CI database and the real local dev gateway's public browser configuration. Preserve the working monorepo dependency layout and generated Prisma Client, exclude build caches and environment files, then package it with relative checksums. Extract and start the artifact in CI before uploading it.

**Spec:** `docs/superpowers/specs/2026-11-08-github-actions-vps-artifact-builder-design.md`

## Execution correction

The first plan assumed `pnpm deploy --legacy` would produce the same runtime layout and that dummy public Auth values could later be replaced at runtime. CI runs proved the deployment layout differs, and the application code proves Next.js inlines `NEXT_PUBLIC_*`. This revised plan keeps the chosen GitHub Actions approach while requiring a dev-specific build and an extracted-runtime smoke test. Production needs a separate build after its local gateway is configured.

## Constraints

- Never run a production database migration or provide production database credentials to this workflow.
- Keep VPS services and public ingress unchanged until the candidate passes capacity and loopback checks.
- Embed the existing local dev gateway URL and its public anon key; load the key from GitHub Actions secret.
- Preserve the generated Prisma Client and pnpm symlinks; exclude `.next/cache`, environment files, and logs.
- Upload artifacts for seven days and verify SHA-256 against filenames relative to the output directory.

## Tasks

1. Test the packager with a synthetic release: verify archive members, omitted cache/environment/log files, metadata, portable checksums, and rejection of incomplete or invalid input.
2. Check out builder and application refs separately; install locked dependencies, generate Prisma, and build the selected application ref. Fail if the local dev Auth gateway or public key is unavailable.
3. Stage the required monorepo runtime layout, generated Prisma Client, public assets, and AI help files. Package the result and verify its checksums.
4. Extract the archive on the runner. Verify Prisma schema/client, launch Next.js on loopback, fetch `/login`, and fetch one static JavaScript asset. Upload only if all checks pass.
5. Record the Actions run, commit SHA, build ID, size and checksum; verify the downloaded artifact before considering VPS installation.
6. Inspect actual VPS free disk and runtime capacity, then start an isolated candidate and validate local Auth/API, application behavior, and rollback before any service switch.

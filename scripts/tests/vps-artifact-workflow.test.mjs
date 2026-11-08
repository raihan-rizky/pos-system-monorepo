import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflowPath = resolve(repositoryRoot, ".github/workflows/vps-artifact.yml");

test("VPS artifact workflow is manual, CI-only, portable, and integrity checked", () => {
  assert.ok(existsSync(workflowPath), "the VPS artifact workflow must exist");

  const workflow = readFileSync(workflowPath, "utf8");
  const requiredFragments = [
    "workflow_dispatch:",
    "push:",
    "ref:",
    "actions/checkout@v4",
    "version: 10.24.0",
    "node-version: 22",
    "pnpm db:generate",
    "pnpm exec turbo run build",
    "pnpm --filter @pos/web deploy --prod",
    "apps/web/.next/BUILD_ID",
    "artifact/runtime/node_modules/@prisma/client",
    "metadata.json",
    "sha256sum",
    "sha256sum --check",
    "actions/upload-artifact@v4",
    "retention-days: 7",
  ];

  for (const fragment of requiredFragments) {
    assert.match(workflow, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing workflow fragment: ${fragment}`);
  }

  for (const forbiddenFragment of ["db:migrate:prod", "env.production", "production.env"]) {
    assert.doesNotMatch(workflow, new RegExp(forbiddenFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `forbidden production reference: ${forbiddenFragment}`);
  }
});

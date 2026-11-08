import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packager = join(root, "scripts", "package-vps-artifact.mjs");
const sha = "1234567890abcdef1234567890abcdef12345678";

function fixture(t) {
  const tmp = mkdtempSync(join(tmpdir(), "pos-artifact-test-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const release = join(tmp, "runtime");
  const out = join(tmp, "output");
  const put = (path, data) => {
    const file = join(release, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
  };
  put("apps/web/.next/BUILD_ID", "build-test-123\n");
  put("apps/web/.next/server/app.js", "server artifact");
  put("apps/web/.next/cache/big-pack", "discard cache");
  put("apps/web/public/icon.svg", "public asset");
  put("packages/db/prisma/schema.prisma", "schema");
  put("packages/product-import-worker/src/index.ts", "worker entry");
  put("apps/web/features/product-import/services/job.ts", "worker service");
  put("node_modules/next/package.json", "{}");
  put(".env", "private env");
  put("apps/web/debug.log", "private log");
  mkdirSync(out);
  return { tmp, release, out };
}

function run(release, out, commit = sha) {
  return spawnSync(process.execPath, [packager, release, out, commit, "dev"], {
    encoding: "utf8",
    env: { ...process.env, VPS_BUILD_REF: "refs/heads/example" },
  });
}

function runTarget(release, out, target) {
  return spawnSync(process.execPath, [packager, release, out, sha, target], {
    encoding: "utf8",
    env: { ...process.env, VPS_BUILD_REF: "refs/heads/example" },
  });
}

test("archive preserves the release, excludes cache and secrets, and has a portable checksum", (t) => {
  const { release, out } = fixture(t);
  const result = run(release, out);
  assert.equal(result.status, 0, result.stderr);
  const archiveName = `pos-web-runtime-${sha}.tar.gz`;
  const archive = join(out, archiveName);
  const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  assert.match(listing.stdout, /runtime\/apps\/web\/\.next\/BUILD_ID/);
  assert.match(listing.stdout, /runtime\/apps\/web\/\.next\/server\/app\.js/);
  assert.match(listing.stdout, /runtime\/packages\/db\/prisma\/schema\.prisma/);
  assert.match(listing.stdout, /runtime\/packages\/product-import-worker\/src\/index\.ts/);
  assert.match(listing.stdout, /runtime\/apps\/web\/features\/product-import\/services\/job\.ts/);
  assert.doesNotMatch(listing.stdout, /\.next\/cache|\/\.env(?:\n|$)|debug\.log/);

  const metadata = JSON.parse(readFileSync(join(out, "metadata.json"), "utf8"));
  assert.equal(metadata.checkedOutSha, sha);
  assert.equal(metadata.requestedRef, "refs/heads/example");
  assert.equal(metadata.buildId, "build-test-123");
  assert.equal(metadata.target, "dev");
  const entries = readFileSync(join(out, "sha256sums.txt"), "utf8").trim().split(/\r?\n/);
  assert.equal(entries.length, 2);
  for (const line of entries) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    assert.ok(match, `checksum entry must use a relative filename: ${line}`);
    const actual = createHash("sha256").update(readFileSync(join(out, match[2]))).digest("hex");
    assert.equal(match[1], actual);
  }
  assert.ok(entries.some((line) => line.endsWith(`  ${archiveName}`)));
  assert.ok(entries.some((line) => line.endsWith("  metadata.json")));
});

test("an incomplete build does not create an artifact", (t) => {
  const { release, out } = fixture(t);
  rmSync(join(release, "apps/web/.next/BUILD_ID"));
  const result = run(release, out);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BUILD_ID/);
});

test("an invalid commit identifier is rejected", (t) => {
  const { release, out } = fixture(t);
  const result = run(release, out, "main");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /commit/i);
});

test("an output directory inside the release is rejected", (t) => {
  const { release } = fixture(t);
  const result = run(release, join(release, "output"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside/i);
});

test("production target is packaged with production metadata", (t) => {
  const { release, out } = fixture(t);
  const result = runTarget(release, out, "prod");
  assert.equal(result.status, 0, result.stderr);
  const metadata = JSON.parse(readFileSync(join(out, "metadata.json"), "utf8"));
  assert.equal(metadata.target, "prod");
});

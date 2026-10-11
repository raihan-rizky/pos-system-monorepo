import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
const repositoryRoot = path.resolve(workerRoot, "../..");
const { scripts } = JSON.parse(
  readFileSync(path.join(workerRoot, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

for (const mode of ["dev", "start", "once", "cleanup"]) {
  for (const inherited of [false, true]) {
    it(`${mode} ${inherited ? "preserves an inherited database URL" : "loads the development environment before starting"}`, () => {
      const fixture = mkdtempSync(path.join(tmpdir(), "product-import-env-"));
      try {
        const cwd = path.join(fixture, "packages/product-import-worker");
        mkdirSync(cwd, { recursive: true });
        mkdirSync(path.join(fixture, "apps/web"), { recursive: true });
        writeFileSync(
          path.join(fixture, "apps/web/env.development.env"),
          "DATABASE_URL=postgresql://fixture-development\nDIRECT_URL=postgresql://fixture-direct\n",
        );
        const probe = path.join(fixture, "probe.cjs");
        writeFileSync(
          probe,
          "console.log(JSON.stringify({databaseUrl:process.env.DATABASE_URL ?? null,directUrl:process.env.DIRECT_URL ?? null,args:process.argv.slice(2)}))",
        );
        const environment = { ...process.env };
        delete environment.DATABASE_URL;
        delete environment.DIRECT_URL;
        if (inherited) environment.DATABASE_URL = "postgresql://fixture-deployment";
        const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path") ?? "PATH";
        environment[pathKey] = `${path.join(repositoryRoot, "node_modules/.bin")}${path.delimiter}${environment[pathKey] ?? ""}`;
        const command = scripts[mode].replace(
          "tsx src/index.ts",
          `"${process.execPath}" "${probe}"`,
        );
        const result = spawnSync(command, {
          cwd,
          env: environment,
          shell: true,
          encoding: "utf8",
          timeout: 15_000,
        });
        assert.equal(result.status, 0, result.stderr || result.error?.message);
        const observed = JSON.parse(result.stdout.trim());
        assert.deepEqual(observed, {
          databaseUrl: inherited ? "postgresql://fixture-deployment" : "postgresql://fixture-development",
          directUrl: "postgresql://fixture-direct",
          args: mode === "once" ? ["--once"] : mode === "cleanup" ? ["--cleanup"] : [],
        });
      } finally {
        assert.equal(path.dirname(path.resolve(fixture)), path.resolve(tmpdir()));
        assert.ok(path.basename(fixture).startsWith("product-import-env-"));
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  }
}

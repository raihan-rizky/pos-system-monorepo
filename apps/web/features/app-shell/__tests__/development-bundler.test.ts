import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";

const webPackage = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
const rootPackage = JSON.parse(readFileSync(new URL("../../../../../package.json", import.meta.url), "utf8"));

describe("Optional Turbopack development", () => {
  it("provides a web-only root command and keeps the existing dev command", () => {
    expect(rootPackage.scripts["dev:turbo"]).toBe("pnpm --filter @pos/web dev:turbo");
    expect(webPackage.scripts["dev:turbo"]).toBe("next dev --turbopack --port 3002");
    expect(webPackage.scripts.dev).toBe("next dev --port 3002");
  });

  it("acknowledges Turbopack while preserving the Prisma webpack plugin", () => {
    const root = nextConfig.turbopack?.root;
    expect(root).toBeDefined();
    if (!root) throw new Error("Missing Turbopack monorepo root");
    expect(resolve(root)).toBe(
      resolve(fileURLToPath(new URL("../../../../../", import.meta.url))),
    );
    const configureWebpack = nextConfig.webpack;
    expect(configureWebpack).toBeTypeOf("function");
    if (!configureWebpack) throw new Error("Missing Prisma webpack hook");
    const serverConfig = configureWebpack(
      { plugins: [] },
      { isServer: true } as Parameters<typeof configureWebpack>[1],
    );
    expect(serverConfig.plugins.map((plugin: object) => plugin.constructor.name)).toContain("PrismaPlugin");
    expect(configureWebpack(
      { plugins: [] },
      { isServer: false } as Parameters<typeof configureWebpack>[1],
    ).plugins).toEqual([]);
  });
});

// Shared in-memory bundler for real component interaction tests, without an app server.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const web = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
export const repo = path.resolve(web, "../..");
const require = createRequire(import.meta.url);
const { build } = require(
  require.resolve("esbuild", { paths: [require.resolve("vitest")] }),
);
const postcss = require("postcss");
const tailwind = require("tailwindcss");

export async function bundleReactHarness(entry, styleSources) {
  const bundle = await build({
    stdin: {
      contents: entry,
      resolveDir: web,
      sourcefile: "stock-group-harness.tsx",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const configBundle = await build({
    entryPoints: [path.join(web, "tailwind.config.ts")],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    alias: {
      "@pos/config/tailwind.config": path.join(
        repo,
        "packages/config/tailwind.config.ts",
      ),
    },
  });
  const configModule = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    configBundle.outputFiles[0].text,
  )(require, configModule, configModule.exports);
  const sources = await Promise.all(
    styleSources.map((file) => readFile(path.join(web, file), "utf8")),
  );
  const css = await postcss([
    tailwind({
      ...configModule.exports.default,
      content: sources.map((raw) => ({ raw, extension: "tsx" })),
    }),
  ]).process("@tailwind base; @tailwind components; @tailwind utilities;", {
    from: undefined,
  });
  return { script: bundle.outputFiles[0].text, css: css.css };
}

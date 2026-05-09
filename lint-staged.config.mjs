import path from "node:path";

const shellQuote = (value) => `"${value.replaceAll('"', '\\"')}"`;

const toPlaywrightSpecList = (files) =>
  files
    .map((file) => path.relative(process.cwd(), file).replaceAll("\\", "/"))
    .filter((file) => file.startsWith("apps/web/e2e/"))
    .map((file) => file.replace("apps/web/", ""));

export default {
  "*.{js,jsx,ts,tsx}": () => "pnpm type-check",
  "apps/web/e2e/**/*.ts": (files) => {
    const specs = toPlaywrightSpecList(files);
    if (specs.length === 0) return [];

    return [
      `pnpm --filter @pos/web exec playwright test --config=playwright.config.ts ${specs
        .map(shellQuote)
        .join(" ")}`,
    ];
  },
};

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  // ── Global ignores ────────────────────────────────────────────
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "packages/db/**",
    ],
  },

  // ── Base: Next.js shared config (via FlatCompat) ──────────────
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // ── Shared rule overrides (replaces packages/config/eslint.json) ─
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "error",
      "react/no-unescaped-entities": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // ── apps/web overrides ────────────────────────────────────────
  {
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
      "react/no-unescaped-entities": "off",
    },
  },

  // ── apps/admin overrides (inherits shared, no extra rules) ────
  {
    files: ["apps/admin/**/*.{js,jsx,ts,tsx}"],
    rules: {},
  },
];

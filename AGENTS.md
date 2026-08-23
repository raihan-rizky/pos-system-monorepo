# AGENTS Guidelines for This Repository

This repository contains a Next.js application located in the root of this repository. When
working on the project interactively with an agent (e.g. the Codex CLI) please follow
the guidelines below so that the development experience – in particular Hot Module
Replacement (HMR) – continues to work smoothly.

## 1. Use the Development Server, **not** `pnpm build`

* **Always use `pnpm dev`** while iterating on the
  application.  This starts Next.js in development mode with hot-reload enabled.
* **Do _not_ run `pnpm build` inside the agent session.**  Running the production
  build command switches the `.next` folder to production assets which disables hot
  reload and can leave the development server in an inconsistent state.  If a
  production build is required, do it outside of the interactive agent workflow.
* **Do not run `pnpm dev` or stop `pnpm dev` after implementing a feature or fixing bugs.** Let the user manage the server lifecycle and avoid starting/stopping server tasks once your development or bug-fixing tasks are finished.

## 2. Keep Dependencies in Sync

If you add or update dependencies remember to:

1. Update the appropriate lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`).
2. Re-start the development server so that Next.js picks up the changes.

## 3. Coding Conventions

* Prefer TypeScript (`.tsx`/`.ts`) for new components and utilities.
* Co-locate component-specific styles in the same folder as the component when
  practical.
* **Always use the [test-driven-development](file:///C:/Users/Unknown/.gemini/config/skills/test-driven-development/SKILL.md) skill** when implementing any new feature or fixing a bug, ensuring tests are written and verified failing before writing implementation code.
* **Write user-visible text in friendly Indonesian** unless it is a technical term (e.g., standard industry jargon or systems terms).
* **Always use the [systematic-debugging](file:///C:/Users/Unknown/.gemini/config/skills/systematic-debugging/SKILL.md) skill** when debugging or investigating issues to systematically find the root cause before proposing or implementing a fix.

## 4. Useful Commands Recap

| Command | Purpose |
| :--- | :--- |
| `pnpm dev` | Start the Next.js dev server with HMR. |
| `pnpm dev:prod` | Start the Next.js dev server with HMR loaded with production environment variables. |
| `pnpm lint` | Run ESLint checks. |
| `pnpm test` | Execute the test suite for the web application. |
| `pnpm type-check` | Run TypeScript compilation check across all packages. |
| `pnpm setup` | Initialize environment (runs install, generates Prisma client, and pushes schema). |
| `pnpm db:push` | Push the Prisma schema state directly to the database. |
| `pnpm db:push:prod` | Push the Prisma schema state directly to the production database. |
| `pnpm db:generate` | Generate Prisma client assets. |
| `pnpm db:seed` | Seed the database with default/development data. |
| `pnpm db:seed:prod` | Seed the production database with default/production data. |
| `pnpm db:studio` | Launch Prisma Studio web GUI to browse data. |
| `pnpm db:migrate:dev` | Run Prisma migrations against the development database. |
| `pnpm db:migrate:prod` | Run Prisma migrations against the production database (deploy). |
| `pnpm e2e` | Execute Playwright/Cypress end-to-end tests for the web package. |
| `pnpm product-import-worker` | Run the product import background worker process. |
| `pnpm product-import-worker:once` | Run the product import background worker process once. |
| `pnpm product-import-worker:cleanup` | Clean up import worker resources. |
| `pnpm assistant:evaluate` | Run AI assistant evaluations. |
| `pnpm assistant:concurrency` | Run AI assistant concurrency tests. |
| `pnpm assistant:cost` | Analyze AI assistant API costs. |
| `pnpm audit:icons` | Audit and verify correct icon importing and definitions. |
| `pnpm build` | **Production build – _do not run during agent sessions_** |

## 5. Always Create Documentation

- **The documentation file must be in markdown format**
- **The documentation file MUST always be created and updated** in `D:\main_project\pos-system-monorepo\markdown-files`
- **Only create or update documentation files** when you implement a BIG feature, modify an existing feature/component, or fix a BIG bug (do not document minor changes, small fixes, or simple tasks).
- **The name of documentation MUST be in format {filename}-{date}.md**
- **Make sure the documentation is always up to date**
- **Always update the Bantuan (Help) page content** in [HelpContent.tsx](file:///d:/main_project/pos-system-monorepo/apps/web/features/help-documentation/components/HelpContent.tsx) whenever a new feature is added, ensuring the user-facing help documentation is always kept in sync.
- **Always update the AI Assistant workflow catalog** in [workflow-catalog.ts](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/workflows/workflow-catalog.ts) whenever a guided workflow is added or modified, keeping the AI assistant's procedural knowledge in sync.

---

Following these practices ensures that the agent-assisted development workflow stays
fast and dependable.  When in doubt, restart the dev server rather than running the
production build.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **pos-system-monorepo** (8564 symbols, 20657 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/pos-system-monorepo/context` | Codebase overview, check index freshness |
| `gitnexus://repo/pos-system-monorepo/clusters` | All functional areas |
| `gitnexus://repo/pos-system-monorepo/processes` | All execution flows |
| `gitnexus://repo/pos-system-monorepo/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

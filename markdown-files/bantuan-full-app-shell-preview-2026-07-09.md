# Bantuan Full App-Shell Preview Design

## Understanding Summary

- The Bantuan visual guide should move from simplified static mock previews to full app-shell visual replicas.
- Each guide step should show a static 1366 x 768 desktop canvas with sidebar, active nav item, page content, and AI Assistant button.
- The previews should use the same `lucide-react` icon set and app-like styling conventions used by the real pages.
- Each selected step should also show a separate static companion focus panel that renders a larger close-up of the target area.
- All registered visual pages are in scope: settings, history, POS, products, inventory, suppliers, customers, finance, shift, production, salespersons, and assistant.
- The preview system must remain fake-data, read-only, and isolated from live routes, API hooks, providers, mutations, and side effects.
- Existing Bantuan behavior remains: normal guides show visuals inline, while AI Assistant guide visuals open in the existing modal flow.

## Assumptions

- Bantuan-specific preview components are allowed when current live components are not cleanly presentational.
- Existing visual registry keys and resolver behavior should remain stable.
- The scaled desktop canvas preserves layout recognition, while the focus panel provides readable detail.
- The implementation should avoid importing `app/(main)` route pages.
- Presentational shared primitives and `lucide-react` icons may be reused when they do not pull in hooks/providers.
- TDD will be used during implementation.

## Non-Functional Requirements

### Performance

- Render static markup only.
- No route embedding, live page imports, network calls, API hooks, or provider-heavy components.
- The preview system should render only the selected guide's visual page at runtime.
- No stored screenshot assets or generated image capture.

### Scale

- The preview system must cover every page in `HELP_VISUAL_PAGE_CONFIG`.
- Each registered target must be represented in either the full canvas, focus panel, or both.
- Adding a new visual page should require adding a page renderer and focus renderer, not changing the guide stepper contract.

### Security And Privacy

- Use fake/sample data only.
- Do not read live customer, product, transaction, shift, inventory, or finance data.
- Do not expose mutation handlers, links that navigate, or actionable form submissions.
- Do not rely on user role/provider state from the live application.

### Reliability

- Unknown or invalid targets should continue to fall back to the page primary target through the existing resolver.
- Tests should detect registry/template drift.
- AI Assistant modal-only preview behavior must remain unchanged.

### Maintenance

- Keep the preview layer isolated under help documentation code.
- Prefer shared preview primitives for shell, sidebar, targets, focus panels, buttons, tabs, tables, and cards.
- Test semantic markers and important labels instead of pixel-perfect CSS details.
- Update previews when major live page layout labels or icon choices change.

## Accepted Design

### Architecture

Use a dedicated Bantuan preview system separate from live routes.

Core pieces:

- `VisualGuideMockup`
  - Orchestrates the selected visual page.
  - Keeps existing callout text and active target handling.
  - Delegates full-canvas and focus rendering to page preview renderers.
- `GuideAppShellPreview`
  - Renders a static 1366 x 768 desktop canvas.
  - Includes sidebar, main content area, and floating AI Assistant button.
  - Scales the desktop canvas to fit inside the Bantuan panel/modal.
- `GuidePreviewSidebar`
  - Static version of the app sidebar.
  - Uses the same `lucide-react` icon choices and nav grouping where practical.
  - Highlights the active nav item for the selected preview page.
- `GuideTarget`
  - Wraps visual elements that correspond to guide targets.
  - Emits `data-help-target`.
  - Applies active highlight and numbered marker for the selected step.
- `GuideFocusPanel`
  - Renders a larger static close-up of the active target.
  - Emits `data-help-focus-target`.
  - Provides readability when the scaled canvas makes small UI details hard to read.
- Page preview renderers
  - One renderer per `HelpVisualPage`.
  - Each renderer owns the static desktop content and focus snippets for that page.
  - Examples: `SettingsPreviewPage`, `HistoryPreviewPage`, `PosPreviewPage`.

Data flow:

1. `HelpDiagramStepper` resolves each step through the existing visual resolver.
2. `VisualGuideMockup` receives `{ page, target, callout }`.
3. The selected page preview renderer produces:
   - full app-shell canvas content
   - focus-panel content for the active target
4. The existing callout block remains below the visual area.

### Layout

- Desktop canvas target size: 1366 x 768.
- Preview area uses a scaled desktop canvas rather than responsive reflow.
- Focus panel sits beside the full canvas on wide layouts.
- On narrow layouts, the focus panel stacks below the canvas.
- The canvas may contain small text because it is primarily for recognition.
- The focus panel must keep text and controls readable.

### Icon And Styling Rules

- Use `lucide-react` icons directly.
- Mirror the real sidebar icon choices where practical:
  - Kasir: `Calculator`
  - Riwayat: `WalletCards`
  - Produk: `Package`
  - Supplier: `Truck`
  - Produksi: `PanelsTopLeft`
  - Pelanggan: `Users`
  - Sales: `Tags`
  - Keuangan: `CircleDollarSign` / `BarChart3`
  - Shift: `BriefcaseBusiness`
  - Pengaturan: `Settings`
  - Bantuan/Assistant: `HelpCircle` / `Bot`
- Use app-like cards, gradients, rounded panels, tabs, table headers, badges, and action buttons.
- Do not require pixel-perfect duplication where it increases coupling or brittleness.

### Page Coverage

All current visual pages must receive full app-shell previews:

- `settings`
- `history`
- `pos`
- `products`
- `inventory`
- `suppliers`
- `customers`
- `finance`
- `shift`
- `production`
- `salespersons`
- `assistant`

## Testing Strategy

Use TDD.

Failing tests should be added before implementation:

- `VisualGuideMockup` renders `data-help-preview-canvas="1366x768"`.
- Sidebar exists in the preview and highlights the correct active nav item.
- Core pages render expected app-like labels/icons:
  - `Pengaturan`
  - `Riwayat`
  - `Kasir`
  - `Produk`
- Active step renders both:
  - `data-help-target="..."`
  - `data-help-focus-target="..."`
- Every registered target in `HELP_VISUAL_PAGE_CONFIG` is represented by the preview system.
- AI Assistant guide steps still render modal triggers instead of inline assistant previews.
- Preview files do not import route pages or live hooks/providers.

Verification commands:

- `pnpm --filter @pos/web test features/help-documentation/__tests__`
- `pnpm --filter @pos/web type-check`

Do not run `pnpm build`.
Do not start or stop the dev server.

## Edge Cases

- If a target is visually tiny in the canvas, the focus panel must make it clear.
- If a target appears in a modal/action menu, the page preview may show that modal/menu already open for the relevant step.
- If a page has many workflow states, preview only the state needed to explain existing guide targets.
- If future guide targets are added, tests should fail until the preview renderer includes them.
- AI Assistant visual behavior remains modal-only.

## Decision Log

| Decision | Alternatives Considered | Reason |
| --- | --- | --- |
| Use a dedicated Bantuan preview system. | Import live route pages; mock providers around route components. | Keeps previews safe, fake-data only, and isolated from live behavior. |
| Include full app shell in every preview. | Page-content-only previews. | User wants exact design page context with sidebar and app chrome. |
| Cover all registered visual pages. | Core pages first; only common guides. | User selected full coverage. |
| Use presentational reuse only. | Render real route components; render live pages read-only. | Avoids hooks, providers, API calls, and side effects. |
| Create Bantuan-specific preview components when needed. | Only reuse existing components; extract live pages first. | Current route pages often mix UI with state/hooks, so isolated previews reduce risk. |
| Use a 1366 x 768 scaled desktop canvas. | Responsive replica; 1440 x 900; 1600 x 1000. | User changed preference to scaled desktop canvas and selected 1366 x 768. |
| Use a static companion focus panel. | Target ring only; CSS transform crop; canvas/image capture. | Static focus panels are practical, testable, and readable. |
| Use the same `lucide-react` icons. | Simplified placeholders; icons only in header/sidebar. | User explicitly requested same icons. |
| Keep fake data and read-only behavior. | Live data previews. | Protects privacy, reliability, and performance. |

## Implementation Status

Implemented in `apps/web/features/help-documentation/components/VisualGuideMockup.tsx`.

- Added a static `GuideAppShellPreview` around the existing page target renderers.
- Added a 1366 x 768 desktop canvas marker with `data-help-preview-canvas="1366x768"`.
- Added `GuidePreviewSidebar`, using `lucide-react` icons and static navigation groups modeled after the real sidebar.
- Added active nav markers with `data-help-preview-nav-active`.
- Added a floating static AI Assistant button with `data-help-preview-assistant-button`.
- Added `GuideFocusPanel` with `data-help-focus-panel` and `data-help-focus-target` for the active guide target.
- Kept all previews fake-data, read-only, and isolated from live route pages/hooks/providers.
- Preserved existing inline Bantuan behavior and AI Assistant modal-trigger behavior.

Verification completed:

- `pnpm --filter @pos/web test features/help-documentation/__tests__/help-visual-guide.test.tsx`
- `pnpm --filter @pos/web test features/help-documentation/__tests__`
- `pnpm --filter @pos/web type-check`

## Implementation Handoff Notes

- Start with tests for the shell canvas, sidebar active nav, focus panel, and full target coverage.
- Introduce preview primitives before moving individual page templates.
- Keep existing resolver and guide metadata unchanged unless tests prove a mapping issue.
- Avoid importing anything from `apps/web/app/(main)` into the preview system.
- Keep all user-visible text in friendly Indonesian.
- Update this document after implementation with files changed and verification results.

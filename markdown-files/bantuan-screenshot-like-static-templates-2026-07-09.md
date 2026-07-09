# Bantuan Screenshot-Like Static Templates Design

## Understanding Summary

- The Bantuan visual guide should move from generic simplified mock pages to higher-fidelity static React/CSS page replicas.
- The visuals should look closer to the actual app screens, similar to screenshots, while remaining static and read-only.
- The system should continue using fake/sample data only.
- No actual route embedding, live data, API calls, mutation handlers, or stored screenshot image files should be used.
- Numbered arrows/callouts should continue to guide users to the relevant area for each step.
- Existing inline role-guide behavior and AI Assistant modal behavior can remain.
- The goal is recognition: users should immediately recognize the real screen they need to use.

## Assumptions

- Static React/CSS templates replace the current generic mock layout.
- Existing guide metadata, visual target keys, and resolver can remain.
- Shared UI styling conventions/classes are allowed when safe.
- The implementation should not import behavior-heavy production page components.
- Templates should be responsive enough for desktop and mobile Bantuan.
- Fidelity should be high enough to recognize the real page, but not pixel-perfect if that makes maintenance brittle.
- Security/privacy remains unchanged: fake data only, no live actions, no mutations.

## Non-Functional Requirements

### Performance

- Static templates must stay lightweight.
- No network calls, route loading, or heavy screenshot assets.
- Rendering the Bantuan page should not load the full production pages.

### Scale

- All existing visual pages should get screenshot-like templates:
  - settings
  - history
  - pos
  - products
  - inventory
  - suppliers
  - customers
  - finance
  - shift
  - production
  - salespersons
  - assistant

### Security And Privacy

- Use fake data only.
- No customer, product, transaction, or store data from the live app.
- No real form submissions.
- No API hooks, mutation handlers, or route embedding.

### Reliability

- Existing guide behavior should continue to work.
- Unknown targets should fall back safely to the page primary target.
- Tests should catch registry/template drift.

### Maintenance

- Keep templates compact and purpose-built.
- Test semantic markers and core labels, not exact CSS.
- Update templates when major production UI labels or layouts change.

## Final Design

### Architecture Change

Keep the existing visual-guide architecture, but replace the generic renderer internals.

Current:

- one generic `MockTemplate`
- registry groups render as generic cards
- every page looks structurally similar

New:

- `VisualGuideMockup` becomes a page-template dispatcher
- each `HelpVisualPage` maps to a specific static template component
- templates resemble the actual app page layout
- the shared callout/highlight system remains

Example shape:

```tsx
const TEMPLATE_BY_PAGE = {
  settings: SettingsStaticPreview,
  history: HistoryStaticPreview,
  pos: PosStaticPreview,
  products: ProductsStaticPreview,
  inventory: InventoryStaticPreview,
};
```

Each template receives:

```ts
{
  activeTarget: string;
  stepNumber: number;
  pageConfig: HelpVisualPageConfig;
}
```

The shared wrapper still renders:

- page frame
- callout text
- target highlight
- read-only badge

Each page template owns its visual structure. `settings` can look like the settings tabs, `history` like transaction table/detail layout, and `pos` like product grid plus cart.

### Template Fidelity Rules

Use:

- same page title and main section labels as the real app
- similar tab placement, table/card layout, button positions, badges, and modal shapes
- fake but realistic data like `INV-20260709-0001`, `Produk Contoh`, `Pelanggan Contoh`
- muted colors for inactive content
- strong highlight only on the active target
- numbered badge and arrow/callout for the selected step

Avoid:

- exact pixel-perfect duplication
- copying large production component trees
- real form behavior
- API hooks
- route hooks
- mutation handlers
- live providers
- stored screenshots as images

### Target Highlight Model

Keep the existing registry targets, but change how templates render targets.

Instead of rendering target labels as generic cards, each template wraps realistic UI elements:

```tsx
<GuideTarget id="history-filter">
  <div className="...">Filter Status: Pending</div>
</GuideTarget>
```

`GuideTarget` handles:

- `data-help-target`
- active highlight ring
- numbered badge
- optional arrow indicator
- decorative arrow pieces with `aria-hidden`

If a template does not contain the requested target:

- highlight the page primary target
- still show callout text
- log a development warning

The registry remains the source of valid target keys. Templates must include wrappers for the target keys they claim to support.

## Testing Strategy

TDD sequence:

1. Add failing tests that `settings`, `history`, and `pos` render page-specific UI, not generic target cards.
2. Add a test that every registered target exists in its template output.
3. Build shared `GuideTarget`.
4. Replace generic `MockTemplate` with page dispatcher.
5. Implement all page templates.
6. Keep existing every-step visual target tests.
7. Run help-documentation tests and type-check.

Acceptance criteria:

- Existing guide behavior still works.
- Each visual page looks distinct and recognizable.
- No template uses API hooks or live page imports.
- AI Assistant modal behavior remains unchanged.
- Every registered target is represented in the corresponding static template.

## Implementation Status

Implemented in `apps/web/features/help-documentation/components/VisualGuideMockup.tsx`.

- Replaced the generic mock-card renderer with a page dispatcher.
- Added shared `GuideTarget`, `TargetButton`, `TargetTab`, and `TargetCard` primitives for consistent numbered highlights.
- Added screenshot-like static templates for all registered visual pages:
  - settings
  - history
  - pos
  - products
  - inventory
  - suppliers
  - customers
  - finance
  - shift
  - production
  - salespersons
  - assistant
- Kept all preview data fake and read-only.
- Did not import live route components, API hooks, mutation handlers, or stored screenshots.
- Preserved existing inline behavior for normal Bantuan guides and modal behavior for AI Assistant guides.

Verification completed:

- `pnpm --filter @pos/web test features/help-documentation/__tests__/help-visual-guide.test.tsx features/help-documentation/__tests__/HelpDiagramStepper.test.tsx`
- `pnpm --filter @pos/web test features/help-documentation/__tests__`
- `pnpm --filter @pos/web type-check`

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Drift from real UI over time | Keep templates compact and label-focused; update templates on major UI changes. |
| Too much detail makes guides harder to read | One active highlight at a time; muted surrounding UI; callout remains plain text. |
| Template maintenance becomes large | Use shared `GuideTarget`, fake data helpers, and compact page-specific templates. |
| Tests become brittle | Test semantic markers, target presence, and core labels instead of exact class strings. |

## Decision Log

| Decision | Alternatives Considered | Reason |
| --- | --- | --- |
| Use screenshot-like static React/CSS templates for all visual pages. | Hybrid rollout, real components with fake data. | Best matches user intent while avoiding live behavior coupling. |
| Keep existing registry/resolver and guide metadata. | Redesign metadata from scratch. | Current metadata already solves target mapping and can support higher-fidelity templates. |
| Use shared `GuideTarget` wrapper. | Duplicate highlight logic in every template. | Keeps target behavior consistent and easier to test. |
| No screenshots, live data, route embedding, or API hooks. | Actual page preview, generated images. | Protects safety, privacy, performance, and maintainability. |
| Test all registered targets are represented in templates. | Manual QA only. | Prevents registry/template drift. |

## Implementation Handoff Notes

- Start by adding tests that prove templates are page-specific.
- Do not import `app/(main)` pages into Bantuan templates.
- Do not remove the AI Assistant modal behavior.
- Keep fake data centralized where practical.
- Existing generic mock renderer can be replaced internally without changing guide metadata.

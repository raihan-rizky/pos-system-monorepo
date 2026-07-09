# Bantuan Inline Page Overlay Design

## Understanding Summary

- The Bantuan visual guide should no longer use a separate zoom, crop, or focus panel.
- The guide should show the full 1366 x 768 app-shell page as the only visual preview.
- Guidance should appear directly inside the full page as an inline overlay on the active target.
- The overlay should use a numbered badge, arrow, and short label.
- The full page should show the relevant static state for the current step, such as selected tabs, open action menus, or open modals.
- The existing bottom callout text should remain for readable explanation.
- All previews remain static, fake-data, read-only, and isolated from live route pages, API calls, providers, hooks, and mutations.

## Assumptions

- "Exact page" means a higher-fidelity static page replica, not embedding or importing live route pages.
- The short overlay label can default to the target label from `HELP_VISUAL_PAGE_CONFIG`.
- Existing visual registry keys and resolver behavior should remain stable.
- Page renderers may add target-specific static states to improve fidelity.
- More preview markup is acceptable when it makes the page state closer to the real app.
- TDD will be used during implementation.

## Non-Functional Requirements

### Performance

- Render static markup only.
- Render only the selected guide page preview at runtime.
- Do not use screenshot assets, canvas capture, route embedding, network calls, live hooks, or provider-heavy route components.

### Scale

- The system must support every visual page in `HELP_VISUAL_PAGE_CONFIG`.
- Every registered visual target must be represented by the full page and must be able to show an overlay marker.
- Adding a target should fail tests until the page renderer includes it.

### Security And Privacy

- Use fake/sample data only.
- Do not read live customer, product, transaction, inventory, finance, shift, or user data.
- Do not expose navigation, mutation handlers, or form submissions.
- Do not rely on live role/provider state.

### Reliability

- Invalid targets should keep using the existing fallback to the page primary target.
- AI Assistant guide previews must keep modal-trigger behavior.
- Tests should catch missing overlays and missing target wrappers.

### Maintenance

- Keep the preview layer isolated under help documentation code.
- Avoid a complex overlay positioning engine until real overlap issues appear.
- Prefer small helper predicates for target-specific page states.
- Test semantic markers, visible labels, and representative page states rather than exact CSS pixels.

## Accepted Design

### Architecture

Keep the dedicated Bantuan preview system, but simplify the visual layout.

Current structure:

- `GuideAppShellPreview`
- `GuideFocusPanel`
- bottom callout block

New structure:

- `GuideAppShellPreview`
- inline overlay rendered by the active `GuideTarget`
- bottom callout block

`GuideFocusPanel` and `FocusSnippet` should be removed.

`GuideTarget` becomes responsible for:

- `data-help-target`
- `data-help-target-active`
- active highlight ring
- numbered badge
- arrow line
- short label bubble
- `data-help-overlay-target`

`VisualGuideMockup` continues to resolve:

- page
- active target
- target label
- bottom callout text

Page templates continue to receive `ctx.activeTarget` so they can render the matching static state.

### Inline Overlay

When `target === ctx.activeTarget`, `GuideTarget` should render:

- a numbered badge using the current step number
- a small arrow pointing toward the target
- a compact label using the target label

Default overlay placement is enough for the first implementation. If specific targets overlap badly later, add a small placement override map rather than a general positioning system.

Required marker:

```tsx
data-help-overlay-target={target}
```

### Step-Specific Page State

The full page should show the relevant state for the active target.

Examples:

- Settings:
  - RBAC tab selected for RBAC, matrix, permission, review, and save targets.
  - Store info tab selected for store info targets.
  - WhatsApp tab selected for WhatsApp targets.
- History:
  - Action menu open for action-menu and invoice-date targets.
  - Approval action area visible for approval targets.
  - Detail panel visible for document/payment targets.
- POS:
  - Payment modal visible for payment modal, method, invoice date, and print targets.
  - Cart area emphasized for cart/pay targets.
- Suppliers:
  - Shopping request area visible for shopping request targets.
- Finance:
  - Expense form/modal visible for expense targets.
- Assistant:
  - Assistant widget panel open for assistant input, answer, workflow, and status targets.

The bottom callout block remains below the preview for full explanatory text.

## Testing Strategy

Use TDD.

Add failing tests before implementation:

- The preview does not render `data-help-focus-panel`.
- The preview does not render `data-help-focus-target`.
- The active target renders `data-help-overlay-target="..."`.
- Every registered target can render an overlay marker.
- The bottom callout text still renders.
- Representative full-page states render:
  - `settings-rbac-tab` shows RBAC tab selected.
  - `history-action-menu` shows an open action menu.
  - `pos-payment-modal` shows a payment modal.
- AI Assistant guide steps still render modal triggers instead of inline assistant previews.
- Static import scan confirms no route page, hook, provider, or API imports.

Verification commands:

- `pnpm --filter @pos/web test features/help-documentation/__tests__/help-visual-guide.test.tsx`
- `pnpm --filter @pos/web test features/help-documentation/__tests__`
- `pnpm --filter @pos/web type-check`

Do not run `pnpm build`.
Do not start or stop the dev server.

## Edge Cases

- Small targets inside the scaled canvas may be hard to read, so overlay labels should be concise and high contrast.
- Targets near canvas edges may overlap with the default overlay; defer custom placement until specific overlaps are observed.
- Modal and action-menu targets should show those states already open in the static page.
- Tab targets should show the matching tab selected.
- On narrow Bantuan layouts, the scaled page remains the visual reference and the bottom callout remains the readable fallback.
- Live page imports remain out of scope.

## Decision Log

| Decision | Alternatives Considered | Reason |
| --- | --- | --- |
| Remove separate focus, zoom, and crop panel. | Keep companion focus panel. | User wants exact full page, not a separate active-area view. |
| Use inline overlay inside the full page. | Bottom callout only; separate focus panel. | Keeps the user oriented in the exact page context. |
| Overlay uses number badge, arrow, and short label. | Badge only; full tooltip bubble. | Gives visible direction without replacing the bottom explanation. |
| Show relevant static page state per active target. | Keep one default page state. | Higher fidelity for menus, modals, tabs, and workflow-specific steps. |
| Keep bottom callout block. | Remove all external explanation. | Preserves readable detail when the scaled page text is small. |
| Prefer stricter fidelity. | Minimal preview code. | User explicitly selected stricter fidelity. |
| Keep previews static and fake-data only. | Import or render live route components. | Protects privacy, reliability, and maintainability. |

## Implementation Status

Implemented in `apps/web/features/help-documentation/components/VisualGuideMockup.tsx`.

- Removed the separate `GuideFocusPanel` and `FocusSnippet` companion area.
- Kept the full 1366 x 768 app-shell canvas as the only visual preview.
- Updated `GuideTarget` so the active target renders an inline overlay with:
  - numbered badge
  - arrow line
  - short target label
  - `data-help-overlay-target`
- Kept the existing bottom callout block for readable explanation.
- Added representative static full-page states:
  - `settings-rbac-active`
  - `history-action-menu-open`
  - `pos-payment-modal-open`
- Kept all preview data fake, read-only, and isolated from live route pages, hooks, providers, and API calls.

Verification completed:

- `pnpm --filter @pos/web test features/help-documentation/__tests__/help-visual-guide.test.tsx`
- `pnpm --filter @pos/web test features/help-documentation/__tests__`
- `pnpm --filter @pos/web type-check`

## Layout Adjustment

Implemented in `apps/web/app/(main)/help/page.tsx`.

- Increased the Help page content container from `max-w-5xl` to `max-w-[1600px]`.
- Added `data-help-page-layout="wide"` to make the wide layout testable.
- This gives inline visual guides enough horizontal room for the 1366 x 768 app-shell preview beside the step list.

Additional verification completed:

- `pnpm --filter @pos/web test app/(main)/help/__tests__/page.test.tsx`
- `pnpm --filter @pos/web test features/help-documentation/__tests__ app/(main)/help/__tests__/page.test.tsx`

## Implementation Handoff Notes

- Start by changing tests from focus-panel expectations to inline-overlay expectations.
- Remove `GuideFocusPanel` and `FocusSnippet` after the red tests are confirmed.
- Update `GuideTarget` to render the inline overlay for active targets.
- Add target-state helper predicates where pages need open menus, selected tabs, or static modals.
- Keep `HELP_VISUAL_PAGE_CONFIG` and visual resolution behavior stable unless a mapping bug is found.
- Update this document after implementation with changed files and verification results.

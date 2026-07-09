# Bantuan Visual Guide Design

## Understanding Summary

- The Bantuan page will be improved so every guide step has a visual read-only mock page.
- The current right-side icon/description panel will become a simplified fake app screen with numbered arrows/callouts.
- Mock pages should use recognizable app labels and layout patterns, but they should not be pixel-perfect clones.
- The solution should cover all existing Bantuan guides across Owner, Admin, Kasir, Sales, Inventory, and AI Assistant.
- AI Assistant guide visuals should appear only after the user clicks a step, opening a modal with the static mock page and arrow guidance.
- The goal is clearer procedural guidance and content completeness, not live data, real navigation, or automated actions.
- The design should be reusable and config-driven so future guides can add visual targets without creating one-off components.

## Assumptions

- Mock pages are static, lightweight, and do not call APIs.
- Mock content uses fake sample labels/data only, with no real customer, product, or store data.
- Existing role tabs and accordion behavior can remain as the base interaction model.
- The current `HelpDiagramStepper` concept can evolve instead of being fully replaced.
- Visual fidelity should be enough for recognition and instruction, not an exact app clone.
- Every existing guide should eventually have valid visual metadata.
- Fallback rendering is acceptable during migration, but the final acceptance target is full visual coverage.
- AI Assistant mock visuals should not clutter normal chat output.

## Non-Functional Requirements

### Performance

- Initial Bantuan page load should remain fast.
- Mock page templates should be static React/CSS, not screenshots or heavy canvases.
- No network requests should be triggered by mock guide rendering.

### Scale

- The system should support all current guide steps and future guide additions.
- Adding a new guide step should require selecting a page template and target key, not creating custom UI.

### Security And Privacy

- Mock pages must never use live operational data.
- Mock controls are read-only and must not submit forms, call APIs, or mutate state.
- Callouts should describe user action but not perform it.

### Reliability

- Unknown or missing visual metadata should render a safe fallback instead of breaking the guide.
- Development warnings may flag missing template targets.

### Maintenance

- Coordinates and target positions belong in a central target registry.
- Guide content should only reference `page`, `target`, and callout text.
- Template updates should be shared across guides that point to the same app surface.

## Non-Goals

- No real page embedding.
- No live data.
- No form submission or automated UI action.
- No pixel-perfect recreation of every production page.
- No screenshot-based guide system.

## Final Design

### Architecture

Split the Bantuan system into two layers:

1. Guide content layer:
   - Role grouping.
   - Guide title and description.
   - Ordered steps.
   - Optional visual metadata per step.

2. Visual guide layer:
   - A reusable `VisualGuideMockup` renderer.
   - Static page templates.
   - Target registry for highlighted areas.
   - Numbered callout and arrow overlay.

For normal Bantuan role guides, the open accordion keeps a left/right layout:

- Left: ordered steps.
- Right: mock page preview for the selected step.

For AI Assistant guides:

- Step list remains compact.
- Clicking a step opens a modal.
- Modal shows the same visual renderer and callout.
- The modal is read-only and closes with a visible close button, Escape key, and standard focus handling.

## Implementation Status

- Added a central visual guide registry with supported mock pages and target keys.
- Added a `VisualGuideMockup` renderer that shows static read-only fake pages, highlighted targets, and numbered callouts.
- Reworked `HelpDiagramStepper` so normal role guides render inline visual mock pages on the right side.
- AI Assistant guide steps now use modal-style visual triggers, keeping the normal guide compact until a step is clicked.
- Added resolver logic that maps every existing guide step to a valid mock page target, with direct step-level metadata still supported.
- Exported Help role content for validation tests.
- Added tests for read-only mock rendering, every-step visual target coverage, and AI Assistant modal trigger behavior.
- Verified with focused help-documentation tests and web type-check.

### Step Metadata

Extend the step model with optional visual metadata:

```ts
type HelpVisualPage =
  | "settings"
  | "history"
  | "pos"
  | "products"
  | "inventory"
  | "suppliers"
  | "customers"
  | "finance"
  | "shift"
  | "production"
  | "salespersons"
  | "assistant";

type HelpStepVisual = {
  page: HelpVisualPage;
  target: string;
  callout: string;
  variant?: string;
};
```

Example guide step:

```ts
{
  title: "Buka Tab RBAC",
  description: "Pada halaman pengaturan yang terbuka, klik tab RBAC.",
  visual: {
    page: "settings",
    target: "settings-rbac-tab",
    callout: "Klik tab RBAC di panel kiri."
  }
}
```

### Mock Page Templates

Create reusable static templates for major app surfaces:

- `settings`: sidebar/tab layout for Info Toko, RBAC, WhatsApp, and related settings.
- `history`: transaction table, filters, action menu, and detail panel.
- `pos`: product grid, cart, and payment modal.
- `products`: product table, tabs, import dropdown, edit and price actions.
- `inventory`: tabs, task panel, stock logs, and update stock controls.
- `suppliers`: supplier tabs, daftar belanja table/form.
- `customers`: customer table, profile, and piutang tabs.
- `finance`: report cards, date filter, export button.
- `shift`: start/close shift form and shift history table.
- `production`: simplified kanban board.
- `salespersons`: sales list and detail panel.
- `assistant`: floating AI button, chat panel, and message area.

Each template exposes target keys from a central registry, for example:

```ts
settings: {
  "settings-sidebar": { x: 12, y: 48 },
  "settings-rbac-tab": { x: 16, y: 168 },
  "settings-review-save": { x: 78, y: 12 }
}
```

Coordinates and highlight shapes should be owned by templates, not copied into guide steps.

### Interaction

For role guides:

- Selecting a step updates the active mock page and callout.
- Active step uses `aria-current="step"`.
- Only one callout is emphasized at a time.
- The mock canvas uses stable aspect ratio to avoid layout jump.
- Mobile layout stacks step list above mock page.

For AI Assistant:

- Step click opens `VisualGuideModal`.
- Modal title combines guide title and step title.
- Modal body renders `VisualGuideMockup`.
- Modal footer includes a friendly Indonesian close action.
- No chat, API, or workflow execution is triggered by opening the mock.

### Accessibility

- Step buttons remain keyboard reachable.
- Active step state is exposed with `aria-current`.
- Modal should support focus trap and Escape close.
- Arrow overlays are decorative with `aria-hidden`.
- Callout text is rendered as normal text, not only as a visual label.
- Fallback panels should explain when a visual has not been configured.

### Fallback Behavior

If a step lacks visual metadata or references an unknown target:

- Render a neutral fallback panel.
- Show guide title, step title, and description.
- In development, log a warning for missing or invalid target metadata.
- In final acceptance for this project, no existing guide should remain in fallback unless explicitly marked non-visual.

## Testing Strategy

- Unit test that every configured guide step has valid visual metadata.
- Unit test that every `page + target` pair exists in the target registry.
- Component test that selecting a step changes the active mock target.
- Component test that AI Assistant step clicks open the visual modal.
- Accessibility checks for `aria-current`, modal labeling, close behavior, and callout text.
- Keep existing HelpContent tests for guide text coverage.

## Rollout Plan

1. Build the visual guide foundation:
   - step visual metadata type
   - mock renderer
   - target registry
   - fallback panel
   - AI modal behavior

2. Build core templates:
   - settings
   - history
   - pos
   - products
   - inventory
   - assistant

3. Build remaining templates:
   - suppliers
   - customers
   - finance
   - shift
   - production
   - salespersons

4. Migrate guide content:
   - add visual metadata to every current guide step
   - role by role is acceptable internally
   - final target is full coverage

5. Validate:
   - run focused component/unit tests
   - run type-check
   - manually review representative guides on desktop and mobile

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Mock pages drift from real UI labels | Keep templates simplified and label-focused; include manual review when features change. |
| Scope becomes too large | Implement reusable templates first, then migrate metadata systematically. |
| Visuals become noisy | Show one active callout per selected step; keep fake page muted and highlight only the target. |
| Mobile view becomes cramped | Stack layout and keep callout text readable outside the mock canvas. |
| AI Assistant modal adds friction | Open visuals only when the user clicks a step; keep normal guide output compact. |

## Decision Log

| Decision | Alternatives Considered | Reason |
| --- | --- | --- |
| Improve guide content/completeness first. | Search improvements, visual polish only, AI-only alignment, onboarding-only flow. | User wants richer guide content that teaches exact UI actions. |
| Use simplified read-only mock pages. | High-fidelity mock pages, live app components, annotated screenshots. | Best balance of clarity, maintainability, privacy, and performance. |
| Cover every existing guide. | Owner/Admin first, operational guides first. | User explicitly wants every guide to have this behavior. |
| Build a reusable config-driven system. | One-off custom visuals per guide, static assets per guide. | Prevents long-term maintenance problems and keeps future guides easier to add. |
| Use centralized template target registry. | Store coordinates directly on each guide step. | Keeps content authors focused on guide intent and UI maintainers focused on layout. |
| AI Assistant uses modal visuals on step click. | Always show large visuals in chat, exclude AI Assistant, defer AI Assistant. | Preserves compact assistant experience while still offering visual guidance. |
| Fallback exists but final coverage should be strict. | No fallback; fallback acceptable forever. | Avoids runtime breakage during migration while preserving the goal of full guide coverage. |

## Implementation Handoff Notes

- Do not start by migrating all guide text. Build renderer and target validation first.
- Keep mock templates static and local to the help documentation feature.
- Avoid using production forms or app routes inside mock templates.
- Add metadata validation tests before completing guide migration.

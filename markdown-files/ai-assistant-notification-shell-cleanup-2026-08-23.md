# AI Assistant Notification and App Shell Cleanup

Date: 2026-08-23
Status: Implemented and validated

## Outcome

The authenticated app shell no longer renders a standalone floating notification center or the small ambient loop in the top-right corner. Pak Teladan remains the single in-app notification entry point through its unread badge and preview of up to three unread notifications.

## Removed

- Standalone draggable notification bell, panel, hide control, and restore tab.
- Notification floating-position preference helper and its tests.
- Global `app-page-loop` markup, keyframes, dot styles, and low-spec overrides.

## Preserved

- `NotificationProvider`, inbox polling, and mark-as-read behavior.
- Notification API routes, browser push delivery, permission prompt, sound, and settings.
- Pak Teladan unread badge, notification previews, and destination navigation.

## Validation

- Authenticated layout tests passed.
- Pak Teladan component tests passed.
- Full `pnpm.cmd test` passed with 2,035 tests across 380 test files; 4 tests and 1 file were skipped by the existing suite.
- `pnpm.cmd --filter @pos/web lint` passed.
- `pnpm.cmd --filter @pos/web type-check` passed.
- GitNexus change detection confirmed the expected app-shell and dead-UI scope at low risk.

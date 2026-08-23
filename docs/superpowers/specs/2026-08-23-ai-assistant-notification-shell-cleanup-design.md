# AI Assistant Notification and App Shell Cleanup

Date: 2026-08-23
Status: Approved design, pending written-spec review

## Summary

The authenticated app shell will remove the standalone floating notification center and the small ambient loop animation in the top-right corner. Notifications will remain available through Pak Teladan, the existing AI Assistant: the launcher keeps its unread badge and the open chat keeps its preview of up to three latest unread notifications.

The notification data source, API routes, push delivery, permission prompt, sound preference, and settings remain unchanged. This is a focused UI consolidation, not a notification backend redesign.

## Goals

- Remove the separate floating notification bell, drag behavior, hide control, restore tab, and floating notification panel.
- Remove the small ambient loop markup and its global CSS animation.
- Keep Pak Teladan as the single in-app entry point for unread notification previews.
- Preserve notification fetching, unread counts, mark-as-read behavior, and destination navigation.
- Reduce duplicate controls and decorative motion in the global app shell.
- Remove dead standalone notification UI code after it is no longer rendered.

## Non-Goals

- Changing notification database records, API contracts, polling intervals, or query caching.
- Removing browser push notifications, permission prompts, notification sound, or notification settings.
- Building a full notification history inside Pak Teladan.
- Changing the existing limit of three latest unread notification previews in the assistant.
- Adding or modifying an AI Assistant guided workflow.
- Redesigning the Pak Teladan chat panel.

## Design Read

Reading this as: an authenticated POS app shell for operational users, using the established product visual language, with dial `ENERGY 1 / RHYTHM 1 / MOTION 1` for global shell decoration.

The shell should stay calm because transaction and inventory work already provide the primary visual focus. Removing redundant motion and controls supports that purpose without changing the assistant's established identity.

## Architecture

`MainLayout` remains responsible for the authenticated shell:

1. Render `Sidebar`.
2. Render the page content inside the existing `Suspense` boundary.
3. Render `DeferredAssistantWidget` as the only floating global action.

`MainLayout` will no longer import or render `NotificationCenter`. It will also no longer render the `app-page-loop` container and dots.

`NotificationProvider` remains mounted in the application providers. `DeferredAssistantWidget` and `AssistantWidget` continue consuming it, so removing the standalone UI does not interrupt notification data flow.

## Notification Data Flow

1. `NotificationProvider` fetches the current user's notification inbox.
2. The deferred Pak Teladan launcher reads `unreadCount` and displays the existing badge when the count is greater than zero.
3. Once the assistant is activated, `AssistantWidget` reads the same provider state.
4. The open chat displays up to three latest unread notification cards.
5. Selecting a card attempts to mark it as read, closes the assistant, and navigates to the notification's internal destination.
6. If marking the notification as read fails, navigation remains available and the provider can reconcile state on a later refresh.

No new state store, API endpoint, or event channel will be introduced.

## UI States and Accessibility

- Loading: Pak Teladan remains usable; notification affordances appear after notification data is ready.
- Empty: when there are no unread notifications, neither the unread badge nor the notification preview strip is rendered.
- Error: notification fetch failure does not block chat usage; existing provider retry and refetch behavior remains authoritative.
- The removed floating bell, hide button, and restore tab also leave the keyboard tab order.
- The Pak Teladan launcher and notification preview cards remain native buttons.
- Existing visible focus behavior and reduced-motion support remain in place.
- No replacement animation or decorative control will be added.

## Source Cleanup

The implementation will remove:

- the `NotificationCenter` import and render from `apps/web/app/(main)/layout.tsx`;
- the `app-page-loop` markup from the same layout;
- the loop keyframes, dot styles, reduced-motion override, and low-spec selectors from `apps/web/app/globals.css`;
- the standalone `NotificationCenter` component and its component tests;
- the notification floating-control helper and its helper tests.

The implementation will preserve:

- `NotificationProvider` and `useNotifications`;
- notification types and API helpers;
- notification API routes;
- push notification services, permission prompt, sound, and settings;
- unread badge behavior in `DeferredAssistantWidget` and `AssistantWidget`;
- unread notification preview behavior in `AssistantWidget`.

## Test Strategy

Implementation follows test-driven development.

### RED

Update the authenticated layout test first so it requires:

- no `NotificationCenter` import or rendered output;
- no `app-page-loop` markup;
- `DeferredAssistantWidget` still present.

Run the targeted layout test and confirm it fails because the old notification center and loop are still rendered.

### GREEN

Apply the minimal production cleanup, remove dead files, and rerun the targeted layout test until it passes.

### Regression

- Run the Pak Teladan component tests, including the unread badge and notification preview test.
- Run the full repository test suite with `pnpm test`.
- Run `pnpm lint`.
- Run `pnpm type-check`.
- Do not run `pnpm build`, start `pnpm dev`, or stop an existing development server.
- Run GitNexus `detect_changes()` before any commit to verify the affected scope.

## GitNexus Risk Control

GitNexus reported `CRITICAL` upstream risk for `NotificationCenter` and `MainLayout` because the framework layout fans out to the authenticated application and the index associates unrelated same-name symbols. The exact direct dependency for `NotificationCenter` is one caller, `MainLayout`.

The implementation will therefore keep the shell edit surgical, preserve the provider and assistant data path, and use targeted layout plus assistant regression tests before the full validation suite.

## Documentation Scope

Implementation will create or update the required dated markdown implementation note in the active repository's `markdown-files` directory. The historical absolute `D:\main_project\pos-system-monorepo` path does not exist in this environment, so repository-relative placement under `C:\Projects\pos-system-monorepo` is authoritative.

`HelpContent.tsx` will not change because this work removes duplicate UI without adding a new feature. `workflow-catalog.ts` will not change because no guided workflow is added or modified.

## Acceptance Criteria

- The standalone floating notification bell and panel no longer render on authenticated pages.
- The small ambient loop in the top-right corner no longer renders or consumes animation CSS.
- Pak Teladan still shows the correct unread badge before its heavy implementation loads.
- Opening Pak Teladan still shows up to three unread notification previews.
- Selecting a notification still marks it as read when possible and navigates to its destination.
- Push notifications, notification settings, permission prompts, sounds, polling, and API behavior remain unchanged.
- The authenticated layout and Pak Teladan notification regression tests pass.
- Lint and type checking pass without running a production build or changing the development server lifecycle.

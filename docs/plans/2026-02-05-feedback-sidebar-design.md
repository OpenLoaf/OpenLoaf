# Feedback Sidebar Footer Design

## Goal
Add a "反馈问题" entry in the left sidebar footer that opens a lightweight popover form for submitting feedback to SaaS in real time.

## Requirements
- Entry appears in sidebar footer (not floating button).
- Clicking opens a non-blocking popover (no full-screen dialog/overlay).
- Form fields: feedback type (ui/performance/bug/feature/other), content, optional email.
- Anonymous submission is allowed.
- On submit, call SaaS feedback API via `@tenas-saas/sdk/web`.
- Auto context attached: page path, device/platform, appVersion (Electron), workspace, active tab, project/root/open uri (if available).
- Success toast + close popover; failure toast + keep input.

## UI Structure
- `SidebarFooter` hosts a single `SidebarMenuButton` labeled "反馈问题".
- Popover anchored to the footer button, opens above it (`side="top"`).
- Compact form layout: type select, content textarea, email input, actions (submit/cancel).

## Data Flow
1. User opens popover and fills form.
2. On submit, build `context` object:
   - `page`: `location.pathname`
   - `env`: `electron` | `web`
   - `device`: `{ platform, userAgent }`
   - `appVersion`: `window.tenasElectron.getAppVersion()` (if available)
   - `workspaceId`, `workspaceRootUri`
   - `tabId`, `tabTitle`
   - `projectId`, `rootUri`, `openUri` (from active tab runtime params)
3. Submit via `client.feedback.submit({ source: "tenas", type, content, context, email? })`.

## Error Handling
- Validate `content` is non-empty.
- Validate `email` only if provided.
- If SaaS URL missing / network error / API error: show toast, keep form state.

## Notes
- Keep styling consistent with existing sidebar + popover design system.
- Do not clear form on popover close; only clear on successful submit.

# System Calendar Sync (Electron) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace calendar localStorage data with Electron IPC-backed system calendar sync (macOS EventKit + Windows WinRT), enabling bidirectional updates from the calendar UI.

**Architecture:** Add a calendar service in Electron main that proxies to platform-specific helpers (native bridge). Expose a small IPC surface via preload to the web UI and update `Calendar.tsx` to load and mutate events via IPC, plus listen for system changes.

**Tech Stack:** Electron main + preload IPC, React (apps/web), native helper binaries (macOS/Windows) invoked from main process.

> Note: Per project rule, skip TDD and do not create a worktree. User requested no git commit.

### Task 1: Define shared calendar IPC types and window API

**Files:**
- Modify: `apps/web/src/types/electron.d.ts`
- Modify: `apps/electron/src/preload/index.ts`

**Step 1: Add TypeScript types for calendar events and IPC results**
- Add `TenasCalendarEvent`, `TenasCalendarRange`, and result unions for `getEvents`, `createEvent`, `updateEvent`, `deleteEvent`, `getCalendars`, `requestPermission`.

**Step 2: Expose calendar IPC API from preload**
- Add `calendar` API under `window.tenasElectron` with methods:
  - `requestCalendarPermission()`
  - `getCalendars()`
  - `getEvents(range)`
  - `createEvent(payload)`
  - `updateEvent(payload)`
  - `deleteEvent(payload)`
  - `subscribeCalendarChanges(handler)` (wraps `tenas:calendar:changed` events)

### Task 2: Implement Electron main calendar service (JS bridge)

**Files:**
- Create: `apps/electron/src/main/calendar/calendarService.ts`
- Modify: `apps/electron/src/main/ipc/index.ts`

**Step 1: Create calendar service module**
- Implement `createCalendarService({ log })` with methods:
  - `requestPermission(webContents)`
  - `listCalendars()`
  - `getEvents(range)`
  - `createEvent(payload)`
  - `updateEvent(payload)`
  - `deleteEvent(payload)`
  - `startWatching(webContents)`
- For now, route calls to a platform helper executable:
  - `apps/electron/resources/calendar/macos/tenas-calendar`
  - `apps/electron/resources/calendar/windows/tenas-calendar.exe`
- If helper missing, return `{ ok: false, reason: 'Calendar helper not built' }`.

**Step 2: Register IPC handlers**
- Add IPC channels:
  - `tenas:calendar:permission`
  - `tenas:calendar:list-calendars`
  - `tenas:calendar:get-events`
  - `tenas:calendar:create-event`
  - `tenas:calendar:update-event`
  - `tenas:calendar:delete-event`
- Add a push channel `tenas:calendar:changed` to notify renderers on system change.

### Task 3: Wire calendar UI to IPC

**Files:**
- Modify: `apps/web/src/components/calendar/Calendar.tsx`
- Create: `apps/web/src/lib/calendar/electronCalendar.ts`

**Step 1: Add Electron calendar client**
- Implement functions:
  - `requestPermission()`
  - `getCalendars()`
  - `getEvents(range)`
  - `createEvent(event)`
  - `updateEvent(event)`
  - `deleteEvent(event)`
  - `subscribeChanges(handler)`
- Provide no-op fallbacks if not running in Electron.

**Step 2: Replace localStorage usage in Calendar**
- On mount: request permission → fetch events for visible range
- On event add/update/delete: call IPC and update state from returned canonical event
- On change notifications: refresh current range
- Keep localStorage removed entirely

### Task 4: Add UX for permission and errors

**Files:**
- Modify: `apps/web/src/components/calendar/Calendar.tsx`

**Step 1: Add simple permission/error banner**
- Track `permissionState` and `errorMessage` in component state
- If denied/unavailable, show a top banner with “重新授权” action and disable edits

### Task 5: Platform helper placeholders

**Files:**
- Create directories:
  - `apps/electron/resources/calendar/macos/`
  - `apps/electron/resources/calendar/windows/`
- Create README placeholders with build instructions (to be filled when native helper is implemented).

**Step 1: Add placeholder README files**
- Explain that native helpers are required for EventKit/WinRT.

---

Plan complete and saved to `docs/plans/2026-01-29-system-calendar-sync-implementation-plan.md`.
Two execution options:

1. Subagent-Driven (this session) — I dispatch a fresh subagent per task and review between tasks.
2. Parallel Session (separate) — Open a new session with executing-plans for batch execution.

Which approach?

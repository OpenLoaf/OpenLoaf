# System Calendar Native Helpers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement macOS (EventKit) and Windows (C# WinRT) native helpers for system calendar read/write/watch, plus multi-calendar selection and color mapping in the web UI.

**Architecture:** Add native helper binaries that implement a simple JSON protocol invoked by Electron main, and update the UI to fetch calendars/events from IPC, filter by selected calendars, and map calendar colors to events.

**Tech Stack:** Swift (macOS EventKit), C# (.NET, WinRT Appointments), Electron IPC, React.

> Note: Project rule says skip TDD tests when using superpowers skills. User asked for no git commits. Steps below omit tests/commits.

### Task 1: Define calendar helper protocol and build script

**Files:**
- Create: `apps/electron/scripts/buildCalendarHelper.mjs`
- Modify: `apps/electron/package.json`
- Modify: `apps/electron/src/main/calendar/calendarService.ts`

**Step 1: Create build script**
- Add a script similar to `buildSpeechHelper.mjs` that builds:
  - macOS: `resources/calendar/macos/CalendarHelper.swift` → `tenas-calendar`
  - Windows: `resources/calendar/windows/TenasCalendar.csproj` → `tenas-calendar.exe`

**Step 2: Wire build script into package.json**
- Add `build:calendar-helper` script.
- Append to `predesktop` so calendar helper builds before packaging.
- Add `resources/calendar` to `extraResources` so binaries ship in packaged app.

**Step 3: Update calendar service protocol**
- Ensure `calendarService` invokes helper via argv JSON and expects JSON response.
- Define response shape:
  - `{ ok: true, data: ... }` or `{ ok: false, reason, code }`
  - For `watch`, helper writes line-delimited JSON `{ "type": "changed" }`.

### Task 2: Implement macOS EventKit helper

**Files:**
- Create: `apps/electron/resources/calendar/macos/CalendarHelper.swift`

**Step 1: Implement CLI command parser**
- Commands: `permission`, `list-calendars`, `get-events`, `create-event`, `update-event`, `delete-event`, `watch`.

**Step 2: Implement EventKit access**
- Request permission with `EKEventStore.requestAccess`.
- List calendars and map to `{ id, title, color, readOnly }`.
- Query events using predicate, map to `{ id, title, start, end, allDay, description, location, calendarId }`.
- Create/update/delete events with `EKEventStore.save/remove`.
- Watch mode: subscribe to `EKEventStoreChanged` and emit `{ "type": "changed" }`.

### Task 3: Implement Windows C# helper

**Files:**
- Create: `apps/electron/resources/calendar/windows/Program.cs`
- Create: `apps/electron/resources/calendar/windows/TenasCalendar.csproj`

**Step 1: Implement CLI command parser**
- Commands: `permission`, `list-calendars`, `get-events`, `create-event`, `update-event`, `delete-event`, `watch`.

**Step 2: Implement WinRT Appointments**
- Use `AppointmentStore` to list calendars.
- Use `FindAppointmentsAsync` to query by range.
- Use `SaveAppointmentAsync` / `DeleteAppointmentAsync` for mutations.
- Watch mode: `AppointmentStore.StoreChanged` emit `{ "type": "changed" }`.

### Task 4: UI multi-calendar selection + color mapping

**Files:**
- Modify: `apps/web/src/components/calendar/Calendar.tsx`
- Modify: `apps/web/src/lib/calendar/electron-calendar.ts`

**Step 1: Fetch calendars on load**
- Add state for `calendars` and `selectedCalendarIds`.
- Default select all calendars.

**Step 2: Filter events by selected calendars**
- After fetching events, filter by `calendarId` membership.

**Step 3: Map calendar colors**
- When loading events, apply calendar color if event color missing.

**Step 4: Add simple calendar selector UI**
- Add a small list with checkboxes at top of calendar panel.

### Task 5: Manual verification checklist

**Files:**
- None (manual)

**Step 1: macOS**
- Create/update/delete event from UI, verify in Apple Calendar.
- Edit in Apple Calendar, verify UI refresh.

**Step 2: Windows**
- Create/update/delete event from UI, verify in Windows Calendar.
- Edit in Windows Calendar, verify UI refresh.

---

Plan complete and saved to `docs/plans/2026-01-29-system-calendar-native-helpers.md`.
Two execution options:

1. Subagent-Driven (this session) — I dispatch a fresh subagent per task and review between tasks.
2. Parallel Session (separate) — Open a new session with executing-plans for batch execution.

Which approach?

# Calendar Permission & Sync Flow Redesign

**Date**: 2026-03-27
**Status**: Approved
**Scope**: Electron main process calendar service, Swift helper, frontend calendar hook & UI

## Problem

Desktop calendar widget auto-requests macOS calendar permission on mount without user intent. Swift helper hangs indefinitely on `DispatchSemaphore.wait()` when the macOS dialog doesn't show. A 60s sync timer runs unconditionally, spawning 4 Swift processes per tick even when permission is denied. No deduplication, no user feedback, no recovery path. Result: 8+ timeout events logged, sustained resource waste, broken UX.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop widget behavior when unauthorized | Show local calendar + guidance card to connect system calendar | Non-intrusive, respects user intent |
| Sync strategy | Watch-first, 5-min timer as fallback only when watch dies | Eliminates unnecessary process spawning |
| Permission caching | Main-process cache, refresh on specific events | Avoids repeated Swift spawns for a rarely-changing value |

## 1. Permission Lifecycle

### 1.1 Two-Tier Permission API

Split the single `permission` action into two:

**`check-permission` (new)** — lightweight, read-only:
- Reads `EKEventStore.authorizationStatus(for:)` for both `.event` and `.reminder`
- Does NOT call `requestAccess` / `requestFullAccessToEvents`
- Returns `{ event: "granted"|"denied"|"prompt"|"unsupported", reminder: "granted"|"denied"|"prompt"|"unsupported" }`
- Used on component mount via cache

**`permission` (existing, renamed semantically to "request")** — user-initiated only:
- Called only when user clicks "connect system calendar"
- Calls `requestFullAccessToEvents` + `requestFullAccessToReminders` (with 20s semaphore timeout)
- Returns same shape as `check-permission`

### 1.2 Main-Process Permission Cache

```typescript
// In calendarService.ts
type PermissionCache = {
  event: CalendarPermissionState;
  reminder: CalendarPermissionState;
} | null;

let permissionCache: PermissionCache = null;
```

**Cache population**:
- `checkPermission()`: returns cache if available, otherwise spawns Swift `check-permission`, caches result
- `requestPermission()`: always spawns Swift `permission`, updates cache on result

**Cache invalidation triggers**:
1. First query on cold start (cache is null)
2. User clicks "connect system calendar" (explicit request)
3. Watch process fails to start or exits unexpectedly
4. Any `invokeCalendarHelper` returns `code === "not_authorized"` → set both to `"denied"`, kill watch, broadcast to renderers

**Cache does NOT persist across app restarts** — fresh check on each launch.

### 1.3 Permission State Broadcasting

When permission cache transitions (especially to `"denied"` mid-session):
- Iterate all renderer `webContents` in `listeners` set
- Send `openloaf:calendar:permission-changed` event with new state
- Frontend updates `permissionState` reactively

### 1.4 Swift Changes

**New action `check-permission`**:
```swift
case "check-permission":
    let eventStatus = authorizationStatus()        // existing
    let reminderStatus = reminderAuthorizationStatus() // existing
    writeSuccess(["event": eventStatus, "reminder": reminderStatus])
```

**Modified `handlePermission()`**:
- Requests both event AND reminder access (currently only events)
- Returns combined `{ event, reminder }` status

**Modified `handleWatch()`**:
- Replace `ensureAuthorized(eventStore)` with check-only logic
- If not granted, exit with error code `"not_authorized"` — do NOT call `requestAccess`

**Semaphore timeouts** (already implemented):
- `requestEventAccess`: 20s timeout
- `requestReminderAccess`: 20s timeout

## 2. Frontend Permission Flow

### 2.1 Mount Behavior (use-calendar-page-state.ts)

**Remove** the auto-request `useEffect`:
```typescript
// REMOVE THIS:
useEffect(() => {
  if (permissionState !== "prompt") return;
  if (permissionRequestedRef.current) return;
  permissionRequestedRef.current = true;
  void handleRequestPermission();
}, [handleRequestPermission, permissionState]);
```

**Replace with** a lightweight check:
```typescript
useEffect(() => {
  if (permissionCheckedRef.current) return;
  permissionCheckedRef.current = true;
  void (async () => {
    const result = await checkCalendarPermission(); // new lightweight API
    if (result.ok) {
      setEventPermission(result.data.event);
      setReminderPermission(result.data.reminder);
    }
  })();
}, []);
```

### 2.2 User-Initiated Permission Request

`handleRequestPermission()` is only called from UI buttons:
- "Connect System Calendar" guidance card
- "Import Calendar" button in toolbar
- Calendar filter panel connect button

Flow:
1. User clicks → `requestCalendarPermission()`
2. macOS dialog appears (from user gesture context)
3. Result: granted → `triggerSync("permission")` + start watch
4. Result: denied → show "Go to System Settings" dialog
5. Result: timeout → show friendly "unable to connect, try later" toast

### 2.3 Guidance Card UI (Calendar.tsx)

When `eventPermission !== "granted"`:
- Compact mode (desktop widget): small card with calendar icon + "Connect System Calendar" button
- Full mode (calendar page): more prominent card with description + button

When `eventPermission === "granted"` but `reminderPermission !== "granted"`:
- Subtle banner: "Reminders not connected" with connect link

### 2.4 Permission Change Listener

Subscribe to `openloaf:calendar:permission-changed` event:
```typescript
useEffect(() => {
  const handler = (_event, state) => {
    setEventPermission(state.event);
    setReminderPermission(state.reminder);
  };
  // Subscribe via preload API
  return subscribePermissionChanges(handler);
}, []);
```

## 3. Sync Architecture

### 3.1 Sync Trigger Flow

```
Permission granted
  → triggerSync("permission")
    → syncSystemCalendars() → IPC → calendarSync.syncNow()
    → Main process: startWatch() if listeners exist
    → No timer started

Watch running (normal path):
  EKEventStoreChanged → watch stdout "changed"
    → IPC event to renderer → triggerSync("watch")
    → 1.5s throttle (both frontend + main process)
    → syncSystemCalendars() → calendarSync.syncNow()

Watch exits unexpectedly (fallback path):
  calendarService emits "watch-exited" event
    → calendarSync starts 5-min fallback timer
    → Each tick: attempt startWatch() first
      → Watch starts → stop timer
      → Watch fails → syncNow() + continue timer

syncNow() permission guard:
  → Check permissionCache
  → Not "granted" → skip, stop timer, log
  → "granted" → proceed with listCalendars + listReminders + getEvents + getReminders
```

### 3.2 Main-Process Sync Throttle

Add throttle in `calendarSync.syncNow()`:
```typescript
const SYNC_THROTTLE_MS = 1500;
let lastSyncAt = 0;

const syncNow = async (override?: SyncContext) => {
  if (syncing) return;
  if (Date.now() - lastSyncAt < SYNC_THROTTLE_MS) return; // main-process throttle
  // ...
};
```

### 3.3 setCalendarSyncRange Changes

- Still saves the sync context (`viewRange`)
- Does NOT call `startTimer()` — timer only starts on watch failure
- Does NOT call `syncNow()` — sync is triggered by permission grant or watch events

### 3.4 Watch Lifecycle in calendarService

```typescript
// New: watch exit callback for calendarSync
const watchExitCallbacks = new Set<() => void>();
const onWatchExit = (cb: () => void) => {
  watchExitCallbacks.add(cb);
  return () => watchExitCallbacks.delete(cb);
};

// In startWatch():
child.on("exit", () => {
  const wasExpected = watchStopping;
  watchSession = null;
  watchStopping = false;
  if (!wasExpected) {
    // Unexpected exit — notify calendarSync
    for (const cb of watchExitCallbacks) cb();
  }
});
```

### 3.5 Permission Grant → Watch Auto-Start

In `requestPermission()`, after cache update:
```typescript
if (newCache.event === "granted" && listeners.size > 0 && !watchSession) {
  startWatch();
}
```

## 4. File Change Summary

| File | Changes |
|------|---------|
| `CalendarHelper.swift` | New `check-permission` action; `handlePermission` requests both event+reminder; `handleWatch` check-only (no requestAccess); semaphore 20s timeout (done) |
| `calendarService.ts` | `checkPermission()` with cache; `requestPermission()` dedup (done) + cache update; permission broadcast; watch exit callback; auto-start watch on grant |
| `calendarSync.ts` | `syncNow` permission guard + 1.5s throttle; watch-exit fallback timer (5min); remove unconditional `startTimer`; subscribe watch-exit |
| `ipc/index.ts` | New `calendar:check-permission` handler; `set-sync-range` removes `startTimer()`; `sync` removes `startTimer()` |
| `preload/index.ts` | Expose `checkPermission`, `subscribePermissionChanges` |
| `electron.d.ts` | Type definitions for new APIs |
| `electron-calendar.ts` | New `checkCalendarPermission()`, `subscribePermissionChanges()` |
| `use-calendar-page-state.ts` | Remove auto-request effect; add check-on-mount effect; split event/reminder permission state; listen to permission-changed; triggerSyncRef (done) |
| `Calendar.tsx` | Guidance card for unconnected state (compact + full variants) |
| `calendar-filter-panel.tsx` | Adapt to split event/reminder permission display |

## 5. Edge Cases

| Scenario | Handling |
|----------|---------|
| App launch, permission already granted | `checkPermission` returns cached "granted" from Swift, watch starts on subscription |
| App launch, permission never requested | `checkPermission` returns "prompt", UI shows guidance card |
| Permission revoked mid-session via System Settings | Next helper call returns "not_authorized" → cache invalidated → broadcast → UI updates |
| macOS sleep/wake | Watch process survives sleep; events during sleep trigger `EKEventStoreChanged` on wake |
| Multiple Electron windows | Permission cache is process-level singleton; broadcast reaches all windows; watch is shared |
| Watch process crash-loops | Fallback timer fires syncNow every 5min; each tick tries watch restart; if watch keeps crashing, stays on timer |
| User grants permission then immediately navigates away | Sync completes in main process regardless of renderer state |

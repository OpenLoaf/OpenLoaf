# Calendar Permission & Sync Flow Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate auto-permission-request on mount, replace with user-initiated flow; add permission cache; replace unconditional 60s sync timer with watch-first + 5-min fallback.

**Architecture:** Bottom-up: Swift helper → main-process service → IPC/preload → frontend API → React hook → UI. Each layer builds on the previous.

**Tech Stack:** Swift (EventKit), TypeScript (Electron main/preload), React 19, i18n (i18next)

**Spec:** `docs/superpowers/specs/2026-03-27-calendar-permission-sync-redesign.md`

**Already applied (keep/extend):**
- `CalendarHelper.swift`: 20s semaphore timeout on `requestEventAccess` + `requestReminderAccess`
- `calendarService.ts`: permission in-flight deduplication
- `use-calendar-page-state.ts`: `triggerSyncRef` stable reference pattern

---

### Task 1: Swift — New `check-permission` Action + Modify `handlePermission` + Modify `handleWatch`

**Files:**
- Modify: `apps/desktop/resources/calendar/macos/CalendarHelper.swift:144-182` (action switch)
- Modify: `apps/desktop/resources/calendar/macos/CalendarHelper.swift:186-196` (handlePermission)
- Modify: `apps/desktop/resources/calendar/macos/CalendarHelper.swift:648-672` (handleWatch)

- [ ] **Step 1: Add `check-permission` to action switch**

In `CalendarHelper.swift` at line 154 (the `switch action` block), add the new case **before** `case "permission"`:

```swift
case "check-permission":
    handleCheckPermission()
```

- [ ] **Step 2: Implement `handleCheckPermission()`**

Add new static function after `handlePermission()` (around line 196):

```swift
/// Handle lightweight permission status check (no access request).
private static func handleCheckPermission() {
    let eventStatus = authorizationStatus()
    let reminderStatus = reminderAuthorizationStatus()
    writeSuccess(["event": eventStatus, "reminder": reminderStatus])
}
```

- [ ] **Step 3: Modify `handlePermission()` to request both event + reminder and return split status**

Replace the existing `handlePermission()` (lines 186-196) with:

```swift
/// Handle permission request flow — requests both event and reminder access.
private static func handlePermission() {
    let eventStore = EKEventStore()
    let eventStatus = authorizationStatus()
    var finalEventStatus = eventStatus
    if eventStatus == "prompt" {
        let granted = requestEventAccess(eventStore)
        finalEventStatus = granted ? "granted" : "denied"
    }
    let reminderStatus = reminderAuthorizationStatus()
    var finalReminderStatus = reminderStatus
    if reminderStatus == "prompt" {
        let granted = requestReminderAccess(eventStore)
        finalReminderStatus = granted ? "granted" : "denied"
    }
    writeSuccess(["event": finalEventStatus, "reminder": finalReminderStatus])
}
```

- [ ] **Step 4: Modify `handleWatch()` to check-only (no requestAccess)**

Replace the authorization logic in `handleWatch()` (lines 648-672). Change:

```swift
let eventStore = EKEventStore()
guard ensureAuthorized(eventStore) else { return }
```

To:

```swift
let eventStore = EKEventStore()
let status = authorizationStatus()
if status != "granted" {
    writeError("未授权系统日历访问权限。", code: "not_authorized")
    return
}
```

This ensures watch never triggers a permission dialog — it only checks.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/resources/calendar/macos/CalendarHelper.swift
git commit -m "feat(calendar): add check-permission action, split event/reminder permission, watch check-only"
```

---

### Task 2: Main Process — Permission Cache + `checkPermission` + Updated `requestPermission` + Broadcast + Watch Exit Callback

**Files:**
- Modify: `apps/desktop/src/main/calendar/calendarService.ts`

This task heavily modifies `calendarService.ts`. The changes are:
1. New `PermissionCache` type and state
2. New `checkPermission()` function
3. Updated `requestPermission()` to return split event/reminder state and update cache
4. Permission broadcast helper
5. `not_authorized` interceptor in `invokeCalendarHelper`
6. Watch exit callback mechanism
7. Auto-start watch on permission grant

- [ ] **Step 1: Add `PermissionCache` type and state**

After the existing `type CalendarResult<T>` (line 38-40), add:

```typescript
type PermissionCache = {
  event: CalendarPermissionState;
  reminder: CalendarPermissionState;
} | null;
```

Inside `createCalendarService()`, after `const activeChildren` (line 86), add:

```typescript
  /** Main-process permission cache. Reset on app restart. */
  let permissionCache: PermissionCache = null;
```

- [ ] **Step 2: Add permission broadcast helper**

After `emitChange()` (line 189), add:

```typescript
  /** Broadcast permission state change to all subscribed renderers. */
  const broadcastPermissionChange = (state: NonNullable<PermissionCache>) => {
    for (const webContents of listeners) {
      if (webContents.isDestroyed()) {
        listeners.delete(webContents);
        continue;
      }
      webContents.send("openloaf:calendar:permission-changed", state);
    }
  };
```

- [ ] **Step 3: Add `not_authorized` interceptor in `invokeCalendarHelper`**

In the `child.on("close")` handler (line 141), after the `code !== 0` check that calls `settle(...)` (line 147), add a `not_authorized` detection **before** the existing `settle`:

Replace:

```typescript
      child.on("close", (code) => {
        if (stderr.trim()) {
          args.log(`[calendar] ${action} stderr: ${stderr.trim()}`);
        }
        if (code !== 0) {
          const reason = stderr.trim() || `helper exited with code ${code ?? 0}`;
          settle({ ok: false, reason, code: "helper_failed" });
          return;
        }
```

With:

```typescript
      child.on("close", (code) => {
        if (stderr.trim()) {
          args.log(`[calendar] ${action} stderr: ${stderr.trim()}`);
        }
        if (code !== 0) {
          const reason = stderr.trim() || `helper exited with code ${code ?? 0}`;
          const isNotAuthorized = reason.includes("not_authorized") || stderr.includes("not_authorized");
          if (isNotAuthorized && permissionCache?.event !== "denied") {
            permissionCache = { event: "denied", reminder: "denied" };
            killWatch();
            broadcastPermissionChange(permissionCache);
          }
          settle({ ok: false, reason, code: isNotAuthorized ? "not_authorized" : "helper_failed" });
          return;
        }
```

- [ ] **Step 4: Add watch exit callback mechanism**

After `let watchStopping = false;` (line 171), add:

```typescript
  /** Callbacks invoked when watch exits unexpectedly. */
  const watchExitCallbacks = new Set<() => void>();
```

Modify the `child.on("exit")` handler inside `startWatch()` (line 226-229). Replace:

```typescript
    child.on("exit", () => {
      watchSession = null;
      watchStopping = false;
    });
```

With:

```typescript
    child.on("exit", () => {
      const wasExpected = watchStopping;
      watchSession = null;
      watchStopping = false;
      if (!wasExpected) {
        for (const cb of watchExitCallbacks) cb();
      }
    });
```

- [ ] **Step 5: Implement `checkPermission()` with cache**

After the `permissionCache` declaration, add:

```typescript
  /** Lightweight permission check — uses cache or spawns Swift check-permission. */
  const checkPermission = async (): Promise<CalendarResult<{ event: CalendarPermissionState; reminder: CalendarPermissionState }>> => {
    if (permissionCache) {
      return { ok: true, data: permissionCache };
    }
    const result = await invokeCalendarHelper<{ event: CalendarPermissionState; reminder: CalendarPermissionState }>(
      "check-permission",
      {},
    );
    if (result.ok) {
      permissionCache = result.data;
    }
    return result;
  };
```

- [ ] **Step 6: Update `requestPermission()` to return split state and manage cache**

Replace the existing `requestPermission` (lines 260-272) with:

```typescript
  /** In-flight permission request for deduplication. */
  let permissionInflight: Promise<CalendarResult<{ event: CalendarPermissionState; reminder: CalendarPermissionState }>> | null = null;

  /** Request system permission (deduplicated). Updates cache and auto-starts watch. */
  const requestPermission = async (): Promise<CalendarResult<{ event: CalendarPermissionState; reminder: CalendarPermissionState }>> => {
    if (permissionInflight) return permissionInflight;
    permissionInflight = (async () => {
      const result = await invokeCalendarHelper<{ event: CalendarPermissionState; reminder: CalendarPermissionState }>(
        "permission",
        {},
      );
      if (result.ok) {
        permissionCache = result.data;
        broadcastPermissionChange(result.data);
        if (result.data.event === "granted" && listeners.size > 0 && !watchSession) {
          startWatch();
        }
      }
      return result;
    })().finally(() => {
      permissionInflight = null;
    });
    return permissionInflight;
  };
```

- [ ] **Step 7: Add `onWatchExit` to service API + expose `checkPermission` and `getPermissionCache`**

In the returned object (lines 354-369), add the new methods:

```typescript
  return {
    checkPermission,
    requestPermission,
    getPermissionCache: () => permissionCache,
    listCalendars,
    listReminders,
    getEvents,
    getReminders,
    createEvent,
    createReminder,
    updateEvent,
    updateReminder,
    deleteEvent,
    deleteReminder,
    startWatching,
    stopWatching,
    onWatchExit: (cb: () => void) => {
      watchExitCallbacks.add(cb);
      return () => { watchExitCallbacks.delete(cb); };
    },
    destroy,
  };
```

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/main/calendar/calendarService.ts
git commit -m "feat(calendar): add permission cache, check-permission, broadcast, watch-exit callbacks"
```

---

### Task 3: Main Process — calendarSync Permission Guard + Throttle + Fallback Timer

**Files:**
- Modify: `apps/desktop/src/main/calendar/calendarSync.ts`

- [ ] **Step 1: Update `createCalendarSync` args to accept permission check + watch-exit subscription**

Replace the `args` type (line 133):

```typescript
export function createCalendarSync(args: {
  log: Logger;
  calendarService: CalendarService;
  getPermissionCache: () => { event: string; reminder: string } | null;
  onWatchExit: (cb: () => void) => () => void;
  tryStartWatch: () => void;
}) {
```

- [ ] **Step 2: Add permission guard and 1.5s throttle to `syncNow()`**

Replace the existing `syncNow` function (lines 142-249) with:

```typescript
  const SYNC_THROTTLE_MS = 1500;
  let lastSyncAt = 0;

  const syncNow = async (override?: SyncContext) => {
    if (syncing) return;
    // Permission guard.
    const cache = args.getPermissionCache();
    if (!cache || cache.event !== "granted") {
      args.log("[calendar-sync] skipping sync: permission not granted");
      stopTimer();
      return;
    }
    // Main-process throttle.
    if (Date.now() - lastSyncAt < SYNC_THROTTLE_MS) return;

    const context = override ?? lastContext;
    if (!context) return;
    const provider = resolveProvider();
    if (!provider) return;
    const serverUrl = process.env.OPENLOAF_SERVER_URL ?? "";
    if (!serverUrl) {
      args.log("[calendar-sync] missing server url");
      return;
    }

    syncing = true;
    try {
      const range = resolveSyncRange(context.viewRange);
      const [calendarResult, reminderResult, eventsResult, remindersResult] =
        await Promise.all(
          [
            args.calendarService.listCalendars(),
            args.calendarService.listReminders(),
            args.calendarService.getEvents(range),
            args.calendarService.getReminders(range),
          ] as const,
        );

      if (isCalendarFailure(calendarResult)) {
        args.log(`[calendar-sync] listCalendars failed: ${calendarResult.reason}`);
        return;
      }
      if (isCalendarFailure(eventsResult)) {
        args.log(`[calendar-sync] getEvents failed: ${eventsResult.reason}`);
        return;
      }

      const sources: SyncSourcePayload[] = [];
      for (const item of calendarResult.data) {
        sources.push({
          kind: "calendar",
          externalId: item.id,
          title: item.title,
          color: item.color ?? null,
          readOnly: item.readOnly,
          isSubscribed: item.isSubscribed,
        });
      }
      if (reminderResult.ok) {
        for (const item of reminderResult.data) {
          sources.push({
            kind: "reminder",
            externalId: item.id,
            title: item.title,
            color: item.color ?? null,
            readOnly: item.readOnly,
            isSubscribed: item.isSubscribed,
          });
        }
      }

      const items: SyncItemPayload[] = [];
      for (const event of eventsResult.data) {
        items.push({
          externalId: event.id,
          calendarId: event.calendarId ?? null,
          kind: "event",
          title: event.title,
          description: event.description ?? null,
          location: event.location ?? null,
          startAt: event.start,
          endAt: event.end,
          allDay: Boolean(event.allDay),
          recurrenceRule: event.recurrence ?? null,
          completed: Boolean(event.completed),
        });
      }
      if (remindersResult.ok) {
        for (const event of remindersResult.data) {
          items.push({
            externalId: event.id,
            calendarId: event.calendarId ?? null,
            kind: "reminder",
            title: event.title,
            description: event.description ?? null,
            location: event.location ?? null,
            startAt: event.start,
            endAt: event.end,
            allDay: Boolean(event.allDay),
            recurrenceRule: event.recurrence ?? null,
            completed: Boolean(event.completed),
          });
        }
      }

      await postTrpc({
        serverUrl,
        path: "calendar.syncFromSystem",
        payload: {
          provider,
          range,
          sources,
          items,
        },
      });
      lastSyncAt = Date.now();
    } catch (error) {
      args.log(`[calendar-sync] failed: ${String(error)}`);
    } finally {
      syncing = false;
    }
  };
```

- [ ] **Step 3: Replace 60s timer with 5-min fallback timer + watch-exit subscription**

Replace `startTimer` and `stopTimer` (lines 251-263) with:

```typescript
  const FALLBACK_INTERVAL_MS = 5 * 60_000;

  const startFallbackTimer = () => {
    if (timer) return;
    args.log("[calendar-sync] watch exited unexpectedly, starting 5-min fallback timer");
    timer = setInterval(() => {
      // Try to restart watch first.
      args.tryStartWatch();
      void syncNow();
    }, FALLBACK_INTERVAL_MS);
  };

  const stopTimer = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  // Subscribe to watch-exit events from calendarService.
  const unsubWatchExit = args.onWatchExit(() => {
    startFallbackTimer();
  });
```

- [ ] **Step 4: Update return object — remove `startTimer`, add `stopTimer` and `destroy`**

Replace the return block:

```typescript
  return {
    setSyncContext,
    syncNow,
    stopTimer,
    destroy: () => {
      stopTimer();
      unsubWatchExit();
    },
  };
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/calendar/calendarSync.ts
git commit -m "feat(calendar): add permission guard, 1.5s throttle, 5-min fallback timer in calendarSync"
```

---

### Task 4: IPC Handlers — New `check-permission` + Remove `startTimer()` Calls

**Files:**
- Modify: `apps/desktop/src/main/ipc/index.ts:447-530`

- [ ] **Step 1: Add `calendar:check-permission` handler**

Add before the existing `openloaf:calendar:permission` handler (before line 448):

```typescript
  // 轻量级日历权限状态检查（不触发权限弹窗）。
  ipcMain.handle('openloaf:calendar:check-permission', async () => {
    return await calendarService.checkPermission();
  });
```

- [ ] **Step 2: Remove `startTimer()` from `set-sync-range` handler**

Replace lines 463-469:

```typescript
  ipcMain.handle('openloaf:calendar:set-sync-range', async (_event, payload: {
    range?: { start: string; end: string };
  }) => {
    calendarSync.setSyncContext({ viewRange: payload?.range });
    return { ok: true as const };
  });
```

- [ ] **Step 3: Remove `startTimer()` from `sync` handler**

Replace lines 472-479:

```typescript
  ipcMain.handle('openloaf:calendar:sync', async (_event, payload: {
    range?: { start: string; end: string };
  }) => {
    calendarSync.setSyncContext({ viewRange: payload?.range });
    await calendarSync.syncNow({ viewRange: payload?.range });
    return { ok: true as const };
  });
```

- [ ] **Step 4: Update `createCalendarSync` call site**

Find where `createCalendarSync` is called (likely in the same file or a nearby setup file). Update it to pass the new args:

```typescript
  const calendarSync = createCalendarSync({
    log: args.log,
    calendarService,
    getPermissionCache: () => calendarService.getPermissionCache(),
    onWatchExit: (cb) => calendarService.onWatchExit(cb),
    tryStartWatch: () => calendarService.tryRestartWatch(),
  });
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/index.ts apps/desktop/src/main/calendar/calendarService.ts
git commit -m "feat(calendar): add check-permission IPC handler, remove unconditional startTimer"
```

---

### Task 5: Preload + Types — Expose `checkPermission` + `subscribePermissionChanges`

**Files:**
- Modify: `apps/desktop/src/preload/index.ts:269-308`
- Modify: `apps/web/src/types/electron.d.ts:317-369`

- [ ] **Step 1: Add `checkPermission` to preload calendar object**

In `apps/desktop/src/preload/index.ts`, inside the `calendar: { ... }` object (after `requestPermission` at line 271), add:

```typescript
    checkPermission: (): Promise<CalendarResult<{ event: CalendarPermissionState; reminder: CalendarPermissionState }>> =>
      ipcRenderer.invoke('openloaf:calendar:check-permission'),
```

- [ ] **Step 2: Add `subscribePermissionChanges` to preload calendar object**

In the same `calendar` object, add after `subscribeChanges` (after line 307):

```typescript
    subscribePermissionChanges: (handler: (state: { event: CalendarPermissionState; reminder: CalendarPermissionState }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: { event: CalendarPermissionState; reminder: CalendarPermissionState }) => {
        handler(state);
      };
      ipcRenderer.on('openloaf:calendar:permission-changed', listener);
      return () => {
        ipcRenderer.removeListener('openloaf:calendar:permission-changed', listener);
      };
    },
```

- [ ] **Step 3: Update `electron.d.ts` — add `checkPermission` type**

In `apps/web/src/types/electron.d.ts`, inside the `calendar?` interface (after `requestPermission` at line 320), add:

```typescript
        /** Check calendar permission status without triggering OS dialog. */
        checkPermission?: () => Promise<OpenLoafCalendarResult<{
          event: OpenLoafCalendarPermissionState;
          reminder: OpenLoafCalendarPermissionState;
        }>>;
```

- [ ] **Step 4: Update `electron.d.ts` — update `requestPermission` return type**

Change line 320 from:

```typescript
        requestPermission: () => Promise<OpenLoafCalendarResult<OpenLoafCalendarPermissionState>>;
```

To:

```typescript
        requestPermission: () => Promise<OpenLoafCalendarResult<{
          event: OpenLoafCalendarPermissionState;
          reminder: OpenLoafCalendarPermissionState;
        }>>;
```

- [ ] **Step 5: Update `electron.d.ts` — add `subscribePermissionChanges` type**

After `subscribeChanges` (line 350), add:

```typescript
        /** Subscribe to permission state changes. */
        subscribePermissionChanges?: (
          handler: (state: { event: OpenLoafCalendarPermissionState; reminder: OpenLoafCalendarPermissionState }) => void
        ) => () => void;
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/preload/index.ts apps/web/src/types/electron.d.ts
git commit -m "feat(calendar): expose checkPermission and subscribePermissionChanges in preload/types"
```

---

### Task 6: Frontend API — `checkCalendarPermission` + `subscribePermissionChanges`

**Files:**
- Modify: `apps/web/src/lib/calendar/electron-calendar.ts`

- [ ] **Step 1: Add `checkCalendarPermission()` function**

After `requestCalendarPermission()` (line 30), add:

```typescript
/** Check system calendar permission status (no OS dialog). */
export async function checkCalendarPermission(): Promise<
  OpenLoafCalendarResult<{ event: OpenLoafCalendarPermissionState; reminder: OpenLoafCalendarPermissionState }>
> {
  if (!isElectronEnv() || !getCalendarApi()?.checkPermission) {
    return { ok: false, reason: "当前仅支持桌面端日历。", code: "unsupported" };
  }
  return await getCalendarApi()!.checkPermission!();
}
```

- [ ] **Step 2: Update `requestCalendarPermission()` return type**

Update the existing function signature to match the new split return type:

```typescript
export async function requestCalendarPermission(): Promise<
  OpenLoafCalendarResult<{ event: OpenLoafCalendarPermissionState; reminder: OpenLoafCalendarPermissionState }>
> {
  if (!isElectronEnv() || !getCalendarApi()?.requestPermission) {
    return { ok: false, reason: "当前仅支持桌面端日历。", code: "unsupported" };
  }
  return await getCalendarApi()!.requestPermission();
}
```

- [ ] **Step 3: Add `subscribePermissionChanges()` function**

After the new `checkCalendarPermission()`, add:

```typescript
/** Subscribe to calendar permission state changes from main process. */
export function subscribePermissionChanges(
  handler: (state: { event: OpenLoafCalendarPermissionState; reminder: OpenLoafCalendarPermissionState }) => void
): () => void {
  if (!isElectronEnv() || !getCalendarApi()?.subscribePermissionChanges) {
    return () => null;
  }
  return getCalendarApi()!.subscribePermissionChanges!(handler);
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/calendar/electron-calendar.ts
git commit -m "feat(calendar): add checkCalendarPermission and subscribePermissionChanges frontend API"
```

---

### Task 7: Frontend Hook — Remove Auto-Request, Add Check-on-Mount, Split Permission State

**Files:**
- Modify: `apps/web/src/components/calendar/use-calendar-page-state.ts`
- Modify: `apps/web/src/lib/calendar/electron-calendar.ts` (import)

- [ ] **Step 1: Add imports for new APIs**

In `use-calendar-page-state.ts`, add `checkCalendarPermission` and `subscribePermissionChanges` to the import from `electron-calendar`:

```typescript
import {
  checkCalendarPermission,
  createSystemEvent,
  createSystemReminder,
  deleteSystemEvent,
  deleteSystemReminder,
  requestCalendarPermission,
  setCalendarSyncRange,
  subscribePermissionChanges,
  subscribeSystemCalendarChanges,
  syncSystemCalendars,
  updateSystemEvent,
  updateSystemReminder,
} from "@/lib/calendar/electron-calendar";
```

- [ ] **Step 2: Split `permissionState` into `eventPermission` + `reminderPermission`**

Replace line 145:

```typescript
const [permissionState, setPermissionState] = useState<CalendarPermissionState>("prompt");
```

With:

```typescript
const [eventPermission, setEventPermission] = useState<CalendarPermissionState>("prompt");
const [reminderPermission, setReminderPermission] = useState<CalendarPermissionState>("prompt");
```

Add a `permissionCheckedRef` after `permissionRequestedRef` (line 151):

```typescript
const permissionCheckedRef = useRef(false);
```

- [ ] **Step 3: Derive `permissionState` for backward compatibility**

After the two new state variables, add:

```typescript
// Derived for backward compat — existing consumers use single `permissionState`.
const permissionState = eventPermission;
```

- [ ] **Step 4: Update `handleRequestPermission()` for split state**

Replace the existing `handleRequestPermission` (lines 321-336) with:

```typescript
const handleRequestPermission = useCallback(async (): Promise<
  OpenLoafCalendarResult<{ event: OpenLoafCalendarPermissionState; reminder: OpenLoafCalendarPermissionState }>
> => {
  const result = await requestCalendarPermission();
  if (!result.ok) {
    setEventPermission("unsupported");
    setReminderPermission("unsupported");
    setErrorMessage(result.reason);
    return result;
  }
  setEventPermission(result.data.event);
  setReminderPermission(result.data.reminder);
  if (result.data.event !== "granted") {
    setErrorMessage(i18next.t('calendar:errUnauthorized'));
    return result;
  }
  setErrorMessage(null);
  await triggerSyncRef.current("permission");
  return result;
}, []);
```

- [ ] **Step 5: Replace auto-request `useEffect` with lightweight check-on-mount**

Replace lines 338-343 (the auto-request useEffect):

```typescript
useEffect(() => {
  if (permissionState !== "prompt") return;
  if (permissionRequestedRef.current) return;
  permissionRequestedRef.current = true;
  void handleRequestPermission();
}, [handleRequestPermission, permissionState]);
```

With:

```typescript
useEffect(() => {
  if (permissionCheckedRef.current) return;
  permissionCheckedRef.current = true;
  void (async () => {
    const result = await checkCalendarPermission();
    if (result.ok) {
      setEventPermission(result.data.event);
      setReminderPermission(result.data.reminder);
    }
  })();
}, []);
```

- [ ] **Step 6: Add permission-changed listener**

After the watch subscription `useEffect` (lines 357-361), add:

```typescript
useEffect(() => {
  return subscribePermissionChanges((state) => {
    setEventPermission(state.event);
    setReminderPermission(state.reminder);
  });
}, []);
```

- [ ] **Step 7: Update return type to include split permission + update `CalendarPageStateResult`**

Update the `CalendarPageStateResult` type — change `permissionState` line (82) and add new fields:

```typescript
type CalendarPageStateResult = {
  // ... existing fields ...
  permissionState: CalendarPermissionState;
  eventPermission: CalendarPermissionState;
  reminderPermission: CalendarPermissionState;
  // ... rest ...
  handleRequestPermission: () => Promise<OpenLoafCalendarResult<{
    event: OpenLoafCalendarPermissionState;
    reminder: OpenLoafCalendarPermissionState;
  }>>;
  // ... rest unchanged ...
};
```

Update the return object to include the new fields:

```typescript
return {
  // ... existing ...
  permissionState,
  eventPermission,
  reminderPermission,
  // ... rest ...
};
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/calendar/use-calendar-page-state.ts
git commit -m "feat(calendar): remove auto-request, add check-on-mount, split event/reminder permission"
```

---

### Task 8: Frontend UI — Guidance Card + Permission Dialog Updates

**Files:**
- Modify: `apps/web/src/components/calendar/Calendar.tsx`
- Modify: `apps/web/src/i18n/locales/zh-CN/calendar.json`
- Modify: `apps/web/src/i18n/locales/en-US/calendar.json` (if exists)

- [ ] **Step 1: Add i18n keys for guidance card**

In `apps/web/src/i18n/locales/zh-CN/calendar.json`, add:

```json
"connectSystemCalendar": "连接系统日历",
"connectSystemCalendarDesc": "授权访问 macOS 日历和提醒事项，在 OpenLoaf 中统一管理你的日程。",
"connectReminders": "连接提醒事项",
"remindersNotConnected": "提醒事项未连接",
"connectionTimeout": "无法连接系统日历，请稍后重试。"
```

Check if `en-US/calendar.json` exists and add corresponding English keys:

```json
"connectSystemCalendar": "Connect System Calendar",
"connectSystemCalendarDesc": "Authorize access to macOS Calendar and Reminders to manage your schedule in OpenLoaf.",
"connectReminders": "Connect Reminders",
"remindersNotConnected": "Reminders not connected",
"connectionTimeout": "Unable to connect to system calendar. Please try again later."
```

- [ ] **Step 2: Update Calendar.tsx to use split permission from hook**

In `Calendar.tsx`, update the destructured hook values (around line 430-452) to include the new fields:

```typescript
const {
  systemEvents,
  systemReminders,
  calendars,
  reminderLists,
  selectedCalendarIds,
  selectedReminderListIds,
  permissionState,
  eventPermission,
  reminderPermission,
  isLoading,
  selectedCalendarIdList,
  selectedReminderListIdList,
  handleRequestPermission,
  handleDateChange,
  handleEventAdd,
  handleEventUpdate,
  handleEventDelete,
  handleToggleCalendar,
  handleSelectAllCalendars,
  handleClearCalendars,
  setSelectedCalendarIds,
  setSelectedReminderListIds,
  toggleReminderCompleted,
} = useCalendarPageState({ toSystemEvent, getEventKind, sourceFilter });
```

- [ ] **Step 3: Update `shouldShowImportButton` logic**

Replace line 605:

```typescript
const shouldShowImportButton = !hasSystemSources && permissionState !== "unsupported";
```

With:

```typescript
const shouldShowImportButton = eventPermission !== "granted" && eventPermission !== "unsupported";
```

- [ ] **Step 4: Update `handleImportCalendar` for timeout handling**

In `handleImportCalendar` (lines 609-632), add timeout handling after the permission request:

```typescript
const handleImportCalendar = useCallback(async () => {
  try {
    const result = await handleRequestPermission();
    if (!result.ok) {
      if (result.code === "timeout") {
        toast.error(t('connectionTimeout'));
      } else {
        toast.error(result.reason || t('importCalendarFailed'));
      }
      return;
    }
    if (result.data.event === "granted") {
      toast.success(t('authSuccess'));
      return;
    }
    if (isElectronEnv()) {
      setShowPermissionDialog(true);
      window.openloafElectron?.openExternal?.(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars"
      );
    } else {
      toast.error(t('accessDenied'));
    }
  } catch {
    toast.error(t('importFailedRetry'));
  }
}, [handleRequestPermission]);
```

- [ ] **Step 5: Pass `eventPermission` and `reminderPermission` to CalendarFilterPanel**

Update the `CalendarFilterPanel` props (around line 758) to pass split permissions instead of single `permissionState`:

```typescript
permissionState={eventPermission}
```

This is backward compatible since we derive `permissionState = eventPermission`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/calendar/Calendar.tsx apps/web/src/i18n/locales/zh-CN/calendar.json
git commit -m "feat(calendar): update Calendar UI for split permission state and guidance"
```

---

### Task 9: Wire Up `calendarSync` Constructor at Service Init

**Files:**
- Modify: `apps/desktop/src/main/ipc/index.ts:266`
- Modify: `apps/desktop/src/main/calendar/calendarService.ts` (add `tryRestartWatch`)

- [ ] **Step 1: Add `tryRestartWatch` to calendarService return object**

In `calendarService.ts`, add to the return object (alongside `onWatchExit`):

```typescript
    tryRestartWatch: () => {
      if (listeners.size > 0) startWatch();
    },
```

- [ ] **Step 2: Update the `createCalendarSync` call at line 266**

Replace line 266:

```typescript
const calendarSync = createCalendarSync({
  log,
  calendarService,
  getPermissionCache: () => calendarService.getPermissionCache(),
  onWatchExit: (cb) => calendarService.onWatchExit(cb),
  tryStartWatch: () => calendarService.tryRestartWatch(),
});
```

- [ ] **Step 3: Ensure cleanup on app exit calls `calendarSync.destroy()`**

Add `calendarSync.destroy()` to the app quit handler if not already handled.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/
git commit -m "feat(calendar): wire up calendarSync with permission cache and watch-exit subscription"
```

---

### Task 10: Type Check + Smoke Test

- [ ] **Step 1: Run type check for desktop app**

```bash
cd apps/desktop && pnpm exec tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Run type check for web app**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Fix any type errors.

- [ ] **Step 3: Run lint**

```bash
pnpm run lint:biome
```

Fix any lint errors.

- [ ] **Step 4: Manual smoke test checklist**

Verify in Electron dev mode (`pnpm run desktop`):

1. Launch app → calendar widget on desktop shows guidance card (not a permission dialog)
2. Click "Connect System Calendar" → macOS permission dialog appears
3. Grant permission → calendar syncs, watch starts
4. Deny permission → "Go to System Settings" dialog appears
5. Check console: no `startTimer` calls, no repeated Swift spawns
6. Check that reminders are requested alongside events

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix(calendar): resolve type/lint issues from permission redesign"
```

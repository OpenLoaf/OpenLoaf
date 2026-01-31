# Calendar DB Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist calendar data in DB (workspace-bound) and sync all system calendars into DB with 1-minute auto-sync and page-entry sync, while UI reads/writes DB.

**Architecture:** Electron main pulls system calendar data and posts to Server for DB upsert; web UI only consumes DB via tRPC; sync range is visible range union past 90 days and next 1 year.

**Tech Stack:** Prisma (SQLite), tRPC (Hono), Electron IPC, React (apps/web).

> Project rule: skip TDD tests, do not create worktrees, and do not commit.

### Task 1: Add Prisma models for calendar sources/items

**Files:**
- Create: `packages/db/prisma/schema/calendar.prisma`

**Step 1: Create calendar models**

```prisma
model CalendarSource {
  id           String   @id
  workspaceId  String
  provider     String
  externalId   String?
  title        String
  color        String?
  readOnly     Boolean  @default(false)
  isSubscribed Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  items CalendarItem[]

  @@index([workspaceId])
  @@unique([workspaceId, provider, externalId])
}

model CalendarItem {
  id             String   @id
  workspaceId    String
  sourceId       String
  kind           String
  title          String
  description    String?
  location       String?
  startAt        DateTime
  endAt          DateTime
  allDay         Boolean  @default(false)
  recurrenceRule Json?
  completedAt    DateTime?
  externalId     String?
  sourceUpdatedAt DateTime?
  deletedAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  source CalendarSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, startAt])
  @@index([workspaceId, sourceId])
  @@unique([workspaceId, sourceId, externalId])
}
```

**Step 2: Generate Prisma client (skip tests by rule)**

Run: `pnpm --filter db db:generate`

---

### Task 2: Define calendar router contracts in packages/api

**Files:**
- Create: `packages/api/src/routers/calendar.ts`
- Modify: `packages/api/src/index.ts`

**Step 1: Add schemas and BaseCalendarRouter**

Inputs/outputs to include:
- `listSources({ workspaceId })`
- `listItems({ workspaceId, range })`
- `createItem({ workspaceId, item })`
- `updateItem({ workspaceId, item })`
- `deleteItem({ workspaceId, id })`
- `toggleReminderCompleted({ workspaceId, id, completed })`
- `syncFromSystem({ workspaceId, provider, range, sources, items })`

**Step 2: Export and register router**
- Add to `appRouterDefine` and exports in `packages/api/src/index.ts`.

---

### Task 3: Implement server calendar router

**Files:**
- Create: `apps/server/src/routers/calendar.ts`
- Modify: `apps/server/src/bootstrap/createApp.ts`

**Step 1: Implement calendarRouterImplementation**
- Use `prisma` to read/write `CalendarSource`/`CalendarItem`.
- Upsert sources by `(workspaceId, provider, externalId)`.
- Upsert items by `(workspaceId, sourceId, externalId)`.
- Handle deletes inside sync range by soft delete (`deletedAt`).
- Reject writes to `readOnly` or `isSubscribed` sources.

**Step 2: Register router in `createApp`**
- Add `calendar: calendarRouterImplementation` to router map.

---

### Task 4: Add Electron calendar sync manager

**Files:**
- Create: `apps/electron/src/main/calendar/calendarSync.ts`

**Step 1: Implement sync manager**
- Keep latest `viewRange` from renderer.
- Compute `syncRange = union(viewRange, now-90d, now+365d)`.
- Pull calendars/reminders/events from `calendarService`.
- POST to `${serverUrl}/trpc/calendar.syncFromSystem` with payload.
- Expose `startTimer()` (1 minute) and `syncNow()` methods.

---

### Task 5: Wire IPC for sync triggers

**Files:**
- Modify: `apps/electron/src/main/ipc/index.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Modify: `apps/web/src/lib/calendar/electron-calendar.ts`

**Step 1: IPC handlers**
- `tenas:calendar:sync` → call `calendarSync.syncNow()`
- `tenas:calendar:set-sync-range` → update `viewRange`

**Step 2: Preload API**
- `calendar.syncNow(range?)`
- `calendar.setSyncRange(range)`

**Step 3: Web wrapper**
- Add `syncSystemCalendars(range)` and `setCalendarSyncRange(range)` with no-op in web-only.

---

### Task 6: Switch Calendar page to DB-backed data

**Files:**
- Modify: `apps/web/src/components/calendar/use-calendar-page-state.ts`
- Modify: `apps/web/src/components/calendar/Calendar.tsx`

**Step 1: Replace Electron calendar reads with tRPC**
- Use `trpc.calendar.listSources` / `trpc.calendar.listItems`.
- Use `trpc.calendar.createItem/updateItem/deleteItem/toggleReminderCompleted`.

**Step 2: Trigger sync on page entry**
- On mount: call `syncSystemCalendars(range)` if in Electron.
- On `activeRange` change: call `setCalendarSyncRange(range)`.

---

### Task 7: Manual verification (no automated tests)

**Step 1: DB migration**
- Run: `pnpm --filter db db:push`

**Step 2: Smoke checks**
- Open calendar page → verify sync triggers (logs).
- Create/edit/delete events and ensure DB updates.
- Change system calendar → verify sync and UI refresh.

---

Plan complete and saved to `docs/plans/2026-01-30-calendar-db-sync-implementation-plan.md`.

Two execution options:
1. Subagent-Driven (this session) — I dispatch a fresh subagent per task and review between tasks.
2. Parallel Session (separate) — Open a new session with executing-plans for batch execution.

Which approach?

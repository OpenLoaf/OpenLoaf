# Calendar DB Sync Design

## Goal
Persist calendar data in the database (bound to `workspaceId`) and synchronize all system calendars into DB, with periodic auto-sync and immediate sync when entering the calendar page. The web UI reads/writes DB only.

## Scope
- Platforms: macOS + Windows (system calendar helpers)
- Accounts: system calendars only (no Google/Outlook OAuth)
- Sync range: **current visible range** ∪ **past 90 days** ∪ **next 1 year**
- Sync cadence: **every 1 minute** + **on calendar page entry** + **system change events**
- DB is the source of truth; UI consumes DB

## Non-Goals
- Web-only access to system calendars
- Advanced conflict resolution beyond timestamp-based overwrite

## Architecture
**Three layers:**
1) **UI (apps/web)**
   - Calendar UI reads/writes DB via tRPC.
   - When entering calendar page in Electron, requests an immediate system sync.
2) **Electron main**
   - Calls system calendar helpers (macOS EventKit / Windows WinRT).
   - Computes sync range and posts data to Server for upsert.
   - Runs a 1-minute sync timer and reacts to system change events.
3) **Server (apps/server + packages/api/db)**
   - Receives sync payload, upserts sources and items in DB.
   - Validates read-only/subscribed calendars before accepting writes.

## Data Model
### CalendarSource
- `id`, `workspaceId`
- `provider`: `local | macos | windows`
- `externalId` (system calendar id)
- `title`, `color`
- `readOnly`, `isSubscribed`
- `createdAt`, `updatedAt`

### CalendarItem
- `id`, `workspaceId`, `sourceId`
- `kind`: `event | reminder`
- `title`, `description`, `location`
- `startAt`, `endAt`, `allDay`
- `recurrenceRule` (string/json)
- `completedAt` (reminder completion)
- `externalId` (system event id)
- `sourceUpdatedAt` (system update time)
- `createdAt`, `updatedAt`

**Indexes:**
- `@@unique([workspaceId, sourceId, externalId])`
- `@@index([workspaceId, sourceId])`
- `@@index([workspaceId, startAt])`

## Sync Range Policy
Given view range `[viewStart, viewEnd]`:
- `rangeStart = min(viewStart, today - 90d)`
- `rangeEnd = max(viewEnd, today + 365d)`

## Sync Triggers
1) **Calendar page entry** → immediate sync
2) **Interval (1 min)** → scheduled sync
3) **System change notification** → immediate sync
4) **View range change** → update sync range for subsequent pulls

## Conflict Strategy
- Use `sourceUpdatedAt` to determine the newest record.
- For system calendars, system write result is authoritative.
- For local calendars, DB write is authoritative.

## Deletion Policy
Within the sync range, any `externalId` missing from the system snapshot is treated as deleted. Prefer soft delete (`deletedAt`) to avoid accidental removal outside the range.

## Error Handling
- If sync fails: keep UI responsive; retry next tick.
- If permission denied: show UI prompt to authorize; only display `provider=local` sources.

## Open Questions (Resolved)
- Sync range: **visible ∪ past 90 days ∪ next 1 year**
- Sync cadence: **1 minute**
- Trigger on page entry: **yes**

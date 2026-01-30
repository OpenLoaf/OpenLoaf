# System Calendar Sync (Electron) Design

## Goal
Enable two-way sync between the app calendar UI and the OS system calendars on macOS and Windows, using only system accounts (no Google/Outlook OAuth). The web UI remains the same component but uses IPC-backed data instead of localStorage.

## Scope
- Platforms: macOS + Windows
- Accounts: system calendar accounts only
- Sync: bidirectional (read + write + listen for external changes)
- UI: apps/web calendar component as display/editor

## Non-Goals
- Pure web browser access to system calendar (not possible)
- Third-party providers (Google/Outlook)
- Complex conflict resolution beyond "system is source of truth"

## Architecture
Three-layer model:
1) **UI layer (apps/web)**
   - Calendar component displays and edits events.
   - All CRUD calls go through a unified IPC API (e.g., `calendar.getEvents`, `calendar.createEvent`, `calendar.updateEvent`, `calendar.deleteEvent`).
2) **Electron main process (bridge)**
   - Calendar service provides unified API and handles permissions.
   - Converts platform events to a common `CalendarEvent` model.
   - Emits update notifications to renderer when system calendar changes.
3) **Platform native layer**
   - macOS: EventKit (Objective-C/Swift bridge)
   - Windows: WinRT Calendar APIs (C++/C# bridge)

## Data Model
A shared event model aligns with UI expectations:
- id (system event id)
- title
- start / end
- allDay
- description
- location
- color
- calendarId
- recurrence

## Sync Strategy
- **Read**: Load events for a scoped time range (current month + buffer).
- **Write**: Create/update/delete is executed directly on the system API, returning the canonical event to UI.
- **Listen**: Subscribe to OS calendar change notifications. On change, refresh the active range and push updates to UI.

## Permissions and UX
- On first access, detect and request calendar permissions.
- If denied, show a non-blocking empty state with "Re-authorize" action.
- Show calendar list from the system with toggleable visibility.
- Keep UI timezone aligned with system timezone.

## Error Handling
- Explicit error codes: permission denied, read-only calendar, event not found, calendar removed.
- UI shows concise error messages and stays responsive.
- On refresh failure, allow retry without blocking edits.

## Implementation Notes (High Level)
- Replace localStorage use in calendar component with IPC-based data fetching.
- Implement native bridge per OS and unify to a common JS interface.
- Listen for OS change events and broadcast updates to renderer.

## Testing
- Manual verification on macOS and Windows:
  - Read, create, edit, delete events from UI and verify in system calendar app
  - Modify events in system calendar app and verify UI updates
  - Permission deny/allow flows

## Open Questions
- Exact time range policy for initial fetch and navigation-based reload
- Multi-calendar color mapping rules

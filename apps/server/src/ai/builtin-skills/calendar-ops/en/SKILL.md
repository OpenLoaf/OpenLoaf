---
name: calendar-ops-skill
description: >
  Triggers when the user wants to query or modify real calendar data: checking today's or this week's agenda, spotting conflicts, creating meetings, rescheduling, or deleting events. Typical phrasings include "what time is my meeting tomorrow", "book xx for me", or "schedule a meeting". **Do not use for**: casually mentioning times or countdowns in conversation (→ answer directly), or recurring background jobs like "run this script at 9am every day" (→ schedule-ops-skill).
---

# Calendar Operations Skill

## Tool Roster

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `CalendarQuery` | Query calendar sources / items (mode: `list-sources` / `list-items` / `get-event`, etc.) | Yes |
| `CalendarMutate` | Create / update / delete calendar items (`kind: event` or `reminder`) | No |

> **Loading**: Both are deferred tools. Activate their schemas with `ToolSearch(names: "CalendarQuery,CalendarMutate")` before calling.

## Decision Flow: What Does the User Want?

### Path A — Review schedule / check availability

1. **Anchor the time first**: run `date '+%Y-%m-%dT%H:%M:%S%z'` via `Bash` to capture the current moment and timezone.
   Why? Relative expressions like "today" or "next Tuesday" only make sense once pinned to a concrete timezone — "10 AM" means entirely different instants for someone in Beijing versus New York, and an ISO 8601 string without an offset will silently drift between systems.
2. **Query the schedule**: use `CalendarQuery` (mode: `list-items`) with `rangeStart` / `rangeEnd` (ISO 8601 **must include the timezone offset**, e.g. `+08:00`).
   If the user just says "show me today's agenda", the range is 00:00:00 to 23:59:59 of today; for "what's on this week", expand to the full week. Better to query slightly wider than to miss events at the edges.
3. **Sort by time when presenting**, and call out conflicts and free slots. When the user asks "am I free", derive the free intervals from the query result.
4. If multiple calendar sources are involved, you can pass `sourceIds` to filter specific calendars and avoid unrelated clutter (e.g. holiday calendars).

### Path B — Create an event or reminder

Why must conflicts be checked before creating? Because double-booking wastes everyone's time and makes the user look unprofessional.

1. **Fetch the sourceId**: call `CalendarQuery` (mode: `list-sources`) first to get the list of available calendar sources.
   Why? `sourceId` is a required field at creation time — guessing it will always fail. If a sourceId was already obtained earlier in the conversation and is still valid, you may reuse it.
2. **Check for conflicts**: use `CalendarQuery` (mode: `list-items`) to see whether the target time slot is already taken.
3. **Conflict found** → tell the user the conflict details and suggest an alternative slot. **Never silently skip the conflict and create anyway.**
   A good approach is to recommend the nearest free slots before and after the conflict so the user can choose with one tap.
4. **No conflict** → create with `CalendarMutate` (action: `create`).
   Pick `kind`: `event` (a scheduled item with clear start/end times) or `reminder` (better suited to to-do-style content).

### Path C — Modify an event

1. **Locate the target first**: search with `CalendarQuery` (mode: `list-items`) to confirm the `itemId`.
   Why? When the user says "move the afternoon meeting to 3 PM", you need to pinpoint which specific event is meant — fuzzy matching may alter the wrong item.
2. **If the change involves timing**, check the new slot for conflicts — same rationale as Path B.
3. Call `CalendarMutate` (action: `update`) with the `itemId` plus only the fields to change. Only send the fields that actually change; do not resubmit everything.

### Path D — Delete an event

1. Locate the target first and confirm the `itemId`.
2. **Confirm with the user** before running `CalendarMutate` (action: `delete`).
   Deletion is irreversible and requires explicit consent. If multiple similar events match, list the candidates and let the user pick.

### Path E — Toggle completion state

Use `CalendarMutate` (action: `toggle-completed`) with an `itemId` and a `completed` boolean. Primarily intended for `reminder`-type items.

## Common Pitfalls

### Timezone confusion (the most frequent mistake)

All times **must** use ISO 8601 **with an explicit timezone offset** (e.g. `+08:00`, `-05:00`). Always run `date` via `Bash` first to determine the current time and timezone — never assume UTC or any default. A bare `2026-03-20T10:00:00` without an offset will be interpreted differently by different systems, and events will land at the wrong time.

### Relative time references

"Next Tuesday", "the day after tomorrow in the afternoon", "end of this month" — run `date` via `Bash` first, then compute the absolute time yourself. Note that "next Tuesday" means different dates depending on whether you say it on Monday or Wednesday, and month/year boundaries are easy to miscalculate. When an expression is ambiguous, ask the user to clarify.

### Forgetting to look up sourceId

The `create` action of `CalendarMutate` **requires** `sourceId`. Creating without first calling `list-sources` guarantees an error. Users often have several calendar sources (work, personal, shared) — pick the right one.

### All-day events

All-day events need `allDay: true`. Still provide start and end times, covering 00:00:00 to 23:59:59 of that day (with the timezone offset).

### Query range too narrow

When the user says "what's coming up soon", don't query only the current day. Broaden the range appropriately (the next 3–7 days) and group the results by day for clarity.

### Multiple similar events

When the user says "delete that meeting" but the query returns several matches, **you must list the candidates and let the user choose** — never guess. The cost of guessing wrong is far higher than asking once more. The same applies to updates.

### Missing key information on creation

When the user says "book me a meeting" without specifying the time, location, or attendees, do not fill in defaults — proactively ask for the missing critical fields. An incomplete event causes more confusion than no event at all.

## Tool Cheat Sheet

| Tool | Purpose |
|------|---------|
| `CalendarQuery` | Two modes: `list-sources` to list calendar sources, `list-items` to query items by time range |
| `CalendarMutate` | Four actions: `create`, `update`, `delete`, `toggle-completed` |

The `kind` field on `CalendarMutate` create: `event` (calendar event) or `reminder` (reminder item).

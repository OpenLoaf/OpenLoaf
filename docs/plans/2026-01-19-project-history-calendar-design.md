# Project History Calendar Replacement Design

## Goal
Replace the ProjectHistory calendar with a React Aria Components version while preserving date selection, history markers, and future-date disabling.

## Architecture
Create a new `calendar-rac` UI component under `apps/web/src/components/ui` that wraps `react-aria-components` Calendar and exposes a `markedDates` Set for history dots. Update ProjectHistory to manage `DateValue` state, convert it to `Date` for list rendering, and pass `maxValue`/`markedDates` to the new calendar.

## Key Changes
- Add `calendar-rac.tsx` with Calendar/RangeCalendar exports and history marker support.
- Update `ProjectHistory.tsx` to use `react-aria-components` date values, `maxValue`, and the new `markedDates` prop.
- Add dependencies: `@radix-ui/react-icons`, `react-aria-components`, `@internationalized/date`.

## Data Flow
1. ProjectHistory builds `sessionsByDay` and a `Set` of `YYYY-MM-DD` keys from sessions.
2. Calendar renders and uses `markedDates` to show history dots.
3. On date change, ProjectHistory converts the `DateValue` to a `Date` for the list header and session grouping.

## Error Handling
No new error paths beyond existing empty/loading states.

## Testing Notes
Per project rules, skip TDD. Manual checks: verify history dots render, future dates are disabled, and list updates when selecting different dates.

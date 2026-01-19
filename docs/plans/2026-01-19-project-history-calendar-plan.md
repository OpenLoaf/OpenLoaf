# Project History Calendar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the ProjectHistory calendar with a React Aria Components version while preserving date selection, history markers, and future-date disabling.

**Architecture:** Add a new `calendar-rac` UI component that wraps React Aria Calendar and supports a `markedDates` set for history dots. Update ProjectHistory to use `DateValue`, convert to `Date` for list rendering, and pass `maxValue` and `markedDates` to the calendar.

**Tech Stack:** React, TypeScript, Tailwind CSS, react-aria-components, @internationalized/date, @radix-ui/react-icons

## Notes
- Per project rule, skip TDD and worktree steps.
- Keep comments: method comments in English, logic comments in Chinese.

### Task 1: Add React Aria calendar UI component

**Files:**
- Create: `apps/web/src/components/ui/calendar-rac.tsx`

**Step 1: (Skip) Write the failing test**
- Skipped per project rule (no TDD).

**Step 2: Add the calendar UI component**
```tsx
"use client"

import { cn } from "@/lib/utils"
import { getLocalTimeZone, today } from "@internationalized/date"
import { ComponentProps } from "react"
import {
  Button,
  CalendarCell as CalendarCellRac,
  CalendarGridBody as CalendarGridBodyRac,
  CalendarGridHeader as CalendarGridHeaderRac,
  CalendarGrid as CalendarGridRac,
  CalendarHeaderCell as CalendarHeaderCellRac,
  Calendar as CalendarRac,
  Heading as HeadingRac,
  RangeCalendar as RangeCalendarRac,
  composeRenderProps,
} from "react-aria-components"
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons"

interface BaseCalendarProps {
  className?: string
  markedDates?: Set<string>
}

// ...rest of component (CalendarHeader, CalendarGridComponent, Calendar, RangeCalendar)
```

**Step 3: (Skip) Run tests**
- Skipped per project rule (no TDD).

**Step 4: Commit**
```bash
git add apps/web/src/components/ui/calendar-rac.tsx
git commit -m "feat: add react aria calendar component"
```

### Task 2: Add demo component (optional file integration)

**Files:**
- Modify: `apps/web/src/components/ui/demo.tsx`

**Step 1: (Skip) Write the failing test**
- Skipped per project rule (no TDD).

**Step 2: Add Calendar RAC demo export**
```tsx
"use client";

import { Calendar } from "@/components/ui/calendar-rac";
import { getLocalTimeZone, today } from "@internationalized/date";
import { useState } from "react";
import type { DateValue } from "react-aria-components";

// ...existing demo exports

/** Calendar RAC demo. */
function CalendarRacDemo() {
  const [date, setDate] = useState<DateValue>(today(getLocalTimeZone()));

  return (
    <div>
      <Calendar className="rounded-lg border border-border p-2" value={date} onChange={setDate} />
      <p
        className="mt-4 text-center text-xs text-muted-foreground"
        role="region"
        aria-live="polite"
      >
        Calendar -{" "}
        <a
          className="underline hover:text-foreground"
          href="https://react-spectrum.adobe.com/react-aria/DateRangePicker.html"
          target="_blank"
          rel="noopener nofollow"
        >
          React Aria
        </a>
      </p>
    </div>
  );
}

export { CalendarRacDemo };
```

**Step 3: (Skip) Run tests**
- Skipped per project rule (no TDD).

**Step 4: Commit**
```bash
git add apps/web/src/components/ui/demo.tsx
git commit -m "feat: add calendar rac demo"
```

### Task 3: Update ProjectHistory to use Calendar RAC

**Files:**
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1: (Skip) Write the failing test**
- Skipped per project rule (no TDD).

**Step 2: Update imports and date handling**
```tsx
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import type { DateValue } from "react-aria-components";
import { Calendar } from "@/components/ui/calendar-rac";
```

**Step 3: Update state and marked dates**
```tsx
const timeZone = getLocalTimeZone();
const [selectedDate, setSelectedDate] = useState<DateValue>(today(timeZone));

const { sessionsByDay, sessionDateKeys } = useMemo(() => {
  const map = new Map<string, ChatSessionListItem[]>();
  const dateKeys = new Set<string>();

  // 中文注释：按会话创建日期聚合，供日历标记与列表渲染。
  for (const session of sessions) {
    const createdAt = new Date(session.createdAt);
    const key = buildDateKey(createdAt);
    const list = map.get(key);
    if (list) {
      list.push(session);
    } else {
      map.set(key, [session]);
    }
    if (!dateKeys.has(key)) {
      dateKeys.add(key);
    }
  }

  for (const list of map.values()) {
    list.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  return { sessionsByDay: map, sessionDateKeys: dateKeys };
}, [sessions]);

const activeDate = selectedDate.toDate(timeZone);
const activeDateKey = buildDateKey(activeDate);
```

**Step 4: Swap calendar component usage**
```tsx
<Calendar
  aria-label="历史日期"
  value={selectedDate}
  onChange={setSelectedDate}
  maxValue={today(timeZone)}
  markedDates={sessionDateKeys}
  className="w-full rounded-xl border border-border/60 bg-background/80 p-3"
/>
```

**Step 5: (Skip) Run tests**
- Skipped per project rule (no TDD).

**Step 6: Commit**
```bash
git add apps/web/src/components/project/ProjectHistory.tsx
git commit -m "refactor: use react aria calendar in project history"
```

### Task 4: Add dependencies

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Install dependencies**
```bash
pnpm --filter web add @radix-ui/react-icons react-aria-components @internationalized/date
```

**Step 2: Commit**
```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore: add react aria calendar deps"
```

### Task 5: Manual verification

**Files:**
- None

**Step 1: Manual check**
- Open ProjectHistory panel, confirm history dots appear on dates with sessions.
- Select different dates and confirm list updates.
- Confirm future dates are disabled.


---
name: calendar-business-development
description: Use when developing or debugging calendar business logic in this repo, including event/reminder sources, system calendar sync, recurrence handling, and data mapping in packages/ui/src/calendar and apps/web/src/components/calendar.
---

# Calendar Business Development

## Overview

聚焦本项目日历业务逻辑：事件/提醒事项、来源与权限、系统日历同步、重复事件处理、数据映射与导出。仅覆盖业务流，不描述界面/样式。

## 核心数据模型

- **CalendarSource（来源）**：区分 `provider=local` 与系统来源，`kind=calendar|reminder`，`readOnly/isSubscribed` 决定是否允许写入。
- **CalendarItemRecord（持久化记录）**：从 `trpc.calendar.listItems` 返回，字段含 `sourceId/startAt/endAt/recurrenceRule/externalId/completedAt`。
- **CalendarEvent（日历引擎事件）**：`@tenas-ai/ui/calendar` 使用的事件结构，业务字段塞进 `event.data`。
- **重复事件字段**：`rrule/exdates/recurrenceId/uid`，配合 `RecurrenceEditScope` 处理。

## 业务流与规则

### 1) 权限与同步（系统日历）

- `requestCalendarPermission` 只在 Electron 环境有效；Web 端返回 `unsupported`。
- `triggerSync(reason)` 负责系统同步：进入页面、授权、系统变更监听触发；对 `watch` 做 1500ms 限流，防止同步风暴。
- `setCalendarSyncRange` 始终跟随 `activeRange`，确保系统同步范围一致。

### 2) 范围计算与查询

- `buildDefaultRange/buildRangeFromDate` 使用「月起始周-月结束周」扩展范围，避免月视图边界缺事件。
- `handleDateChange` 用 `queueMicrotask` 合并连续日期切换，避免重复请求。
- `activeRange` 既驱动 `listItems` 查询，也驱动系统同步范围。

### 3) 事件映射（持久化记录 ↔ 日历事件）

- `toCalendarEvent`：`CalendarItemRecord -> CalendarEvent`
  - 提醒事项 `end <= start` 时强制 `end = start.endOf("day")` 且 `allDay=true`，避免渲染成跨天块。
  - `event.data` 必须带 `calendarId/kind/completed/externalId/sourceExternalId/provider/readOnly/isSubscribed`。
- `toSystemEvent`：`CalendarEvent -> TenasCalendarEvent`
  - 提醒事项 `allDay` 用本地日期中午作为锚点，避免时区回退。
  - `calendarId` 用 `sourceExternalId`，`id` 用 `externalId`（系统事件必须有）。

### 4) CRUD 与提醒完成

- **本地来源（provider=local）**：仅走 tRPC `createItem/updateItem/deleteItem`。
- **系统来源**：
  - `create/update/delete` 必须先走 Electron API，再把返回结果落库（否则列表刷新后会丢）。
  - `readOnly/isSubscribed` 一律禁止写入。
- **提醒完成**：系统来源先 `updateSystemReminder`，再 `toggleReminderCompleted` 落库。

### 5) 重复事件

- `generateRecurringEvents` 使用 “Floating Time” 处理，确保按用户本地日期规则计算。
- `updateRecurringEvent/deleteRecurringEvent` 依赖 `scope`：
  - `this`：给基准事件加 `EXDATE`，并创建 `recurrenceId` 的单次覆盖。
  - `following`：旧系列 `UNTIL` 截断，新建新系列（新 UID）。
  - `all`：直接更新或删除整个系列。

### 6) iCalendar 导出

- `exportToICalendar` 负责 RRULE/EXDATE/RECURRENCE-ID 输出，`filterEvents` 过滤重复输出。

## 实战检查清单（修改业务逻辑时）

- 系统事件必须携带 `externalId/sourceExternalId`，否则更新/删除会失败。
- 提醒事项需要处理 `end <= start` 的边界，避免日历引擎误判。
- 系统事件的写入必须落库，避免刷新后回滚。
- 日期范围变更必须同步 `setCalendarSyncRange`。
- 修改重复事件必须走 `scope` 逻辑，避免破坏原系列。

## Quick Reference

| 目标 | 入口 | 关键注意 |
| --- | --- | --- |
| 拉取来源与事件 | `trpc.calendar.listSources/listItems` | `activeRange` 与 `selectedSourceIds` 必须一致 |
| 同步系统日历 | `syncSystemCalendars` | 仅 Electron，注意 `permissionState` |
| 写入系统事件 | `create/update/deleteSystemEvent` | 先系统写入，再落库 |
| 修改重复事件 | `updateRecurringEvent` | 必须传 `scope` |
| 删除重复事件 | `deleteRecurringEvent` | `following` 需 `UNTIL` 截断 |
| 导出 iCal | `exportToICalendar` | 仅导出过滤后的基准/覆盖事件 |

## 关键文件

- `packages/ui/src/calendar/hooks/use-calendar-engine.ts`
- `packages/ui/src/calendar/features/recurrence/utils/recurrence-handler.ts`
- `packages/ui/src/calendar/lib/utils/export-ical.ts`
- `packages/ui/src/calendar/lib/utils/date-utils.ts`
- `packages/ui/src/calendar/lib/configs/dayjs-config.ts`
- `apps/web/src/components/calendar/use-calendar-page-state.ts`
- `apps/web/src/components/calendar/Calendar.tsx`（仅业务映射与同步逻辑）
- `apps/web/src/lib/calendar/electron-calendar.ts`

## Resources

- `references/calendar-domain.md`：字段约定与数据映射细节

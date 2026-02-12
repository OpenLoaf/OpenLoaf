# Calendar Domain Notes

仅记录业务字段约定与数据映射细节，避免界面描述。

## 数据结构

### CalendarSource

- `provider`: `local` 为本地来源，其他为系统来源。
- `kind`: `calendar` 或 `reminder`。
- `readOnly/isSubscribed`: 任一为 true 时禁止写入。
- `externalId`: 系统日历的外部 ID（写入系统事件时需要）。

### CalendarItemRecord（持久化记录）

- `sourceId`: 对应 `CalendarSource.id`。
- `startAt/endAt/allDay`: ISO 时间字符串 + 全天标记。
- `recurrenceRule`: 字符串或空（目前前端只透传字符串）。
- `externalId`: 系统事件 ID（必须保存，用于后续更新/删除）。
- `completedAt`: 提醒事项完成时间。
- `sourceUpdatedAt`: 系统侧更新时间，用于去重/同步标识。

### CalendarEvent.data（日历事件扩展字段）

业务逻辑必须依赖这些字段完成系统/本地的分流与写入：

- `calendarId`: 对应 `CalendarItemRecord.sourceId`
- `kind`: `"event" | "reminder"`
- `completed/completedAt`: 提醒事项完成状态
- `externalId`: 系统事件 ID
- `sourceExternalId`: 系统日历 ID（创建/更新系统事件必需）
- `provider`: 来源提供者（`local` 或系统）
- `readOnly/isSubscribed`: 禁止写入标记
- `recurrence`: 目前为字符串形式的 RRULE

## 数据映射要点

- `toCalendarEvent`：
  - `recurrenceRule -> data.recurrence`
  - 提醒事项若 `end <= start`，强制 `endOf("day")` + `allDay=true`
- `toSystemEvent`：
  - 提醒事项 `allDay` 使用本地日期中午锚点避免时区回退
  - `calendarId` 取 `sourceExternalId`

## 同步机制

- `triggerSync`：`enter/permission/watch` 三种原因
- `syncInFlight` + `syncQueued`：避免并发，顺序补偿
- `lastSyncAt`：系统变更 1500ms 内只同步一次
- 成功后必须 `invalidate listSources/listItems`，否则前端不会刷新

## 写入规则

- **系统来源**：先调用 Electron API，再落库（`createItem/updateItem/deleteItem`）
- **本地来源**：只落库，不触碰系统 API
- **readOnly/isSubscribed**：直接阻断
- **缺 `externalId`**：系统更新/删除应报错并提示

## AI 工具数据流

AI Agent 通过 `calendarTools.ts` 中的工具操作日历，数据流：

```
LLM → calendar-query/calendar-mutate → appRouter.createCaller(ctx).calendar → tRPC routers → Prisma → SQLite
```

### 返回字段精简策略

AI 工具返回精简视图，去掉对 LLM 无用的系统字段：

- **SourceView**：`id/provider/kind/title/color/readOnly`（去掉 workspaceId/externalId/isSubscribed/createdAt/updatedAt）
- **ItemView**：`id/sourceId/kind/title/description/location/startAt/endAt/allDay/completedAt`（去掉 workspaceId/externalId/recurrenceRule/sourceUpdatedAt/deletedAt/createdAt/updatedAt）

### update 合并逻辑

`executeUpdateItem` 先通过 `listItems` 查询现有 item（使用极大时间范围），找到后将用户传入字段与现有数据合并，再调用 `updateItem`。LLM 只需传 `itemId` + 要修改的字段。

### 不暴露的能力

- `syncFromSystem`：系统同步由 Electron 层触发，AI 不应干预
- `recurrenceRule`：重复规则对 LLM 太复杂，暂不暴露

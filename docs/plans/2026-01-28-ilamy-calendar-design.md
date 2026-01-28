# ilamy Calendar 替换设计

## 目标
- 将 `apps/web/src/components/calendar/Calendar.tsx` 从 `@tenas-ai/ui/calendar` 切换为 `@ilamy/calendar` 的 `IlamyCalendar`。
- 采用最小化集成：仅传入空 `events`，不引入 dayjs 插件或示例事件。
- 保持现有页面结构与样式稳定，避免影响其它调用方。

## 方案概述
- 继续保持客户端组件（`"use client"`）。
- 移除 `selected` 状态和 `onSelect`，改为 `IlamyCalendar` 事件驱动模型。
- 在组件内部声明空事件数组并附加类型注解，例如 `const events: IlamyCalendarProps['events'] = []`。
- 仅传入 `events`；其他参数使用默认值，减少行为差异。

## 组件结构
- 外层容器保留：`<div className="h-full w-full p-4">`。
- 标题文案保留：`日历`。
- 主体替换为：`<IlamyCalendar events={events} />`。

## 数据流与扩展
- 当前事件源为空数组；后续只需替换 `events` 数据即可接入真实事件。
- 组件 API 兼容后续扩展（如 `firstDayOfWeek`、`dayMaxEvents` 等）。

## 错误处理
- 由于 `events` 始终为数组，组件渲染不会因 `undefined` 产生异常。

## 测试与验证
- 由于最小化替换，无新增业务逻辑，验证重点为：页面正常渲染、无控制台错误。


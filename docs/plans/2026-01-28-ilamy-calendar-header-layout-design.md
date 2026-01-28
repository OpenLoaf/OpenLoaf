# ilamy Calendar 头部对齐与高度设计

## 目标
- 日历区域高度占满页面可用高度（100%）。
- 移除“日历”标题文案。
- 头部布局：日期选择区域左对齐，功能按钮区域右对齐。

## 方案概述
- 保持 `CalendarPage` 为客户端组件。
- 外层容器保持 `h-full w-full`，内部增加 `h-full min-h-0` 包裹层，确保 `IlamyCalendar` 可占满可用高度。
- 使用 `IlamyCalendar` 的 `headerClassName` 覆盖头部默认居中对齐，使左右两组元素分布在两端。

## 组件结构
- 删除标题节点。
- 渲染结构：
  - 外层：`<div className="h-full w-full p-4">`
  - 内层包裹：`<div className="h-full min-h-0">`
  - 日历：`<IlamyCalendar events={events} headerClassName="justify-between" />`

## 兼容性与扩展
- 不引入新依赖、不改动事件数据结构。
- 若后续需要更精细的头部布局，可改用 `headerComponent` 自定义头部。

## 验证点
- 日历视图占满父容器高度。
- 头部左侧日期选择、右侧功能按钮对齐正确。
- 控制台无报错。

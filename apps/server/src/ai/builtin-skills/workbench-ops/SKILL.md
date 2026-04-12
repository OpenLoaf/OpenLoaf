---
name: workbench-ops
description: >
  工作台 Widget 管理——创建/编辑/删除桌面组件。当用户要在工作台上添加或管理
  widget（仪表盘、监控面板、股票行情、天气、时钟、快捷链接、番茄钟等）时激活。
  **不用于**：对话中随口提到时间/倒计时（→直接回答）、数据可视化图表（→visualization-ops）。
---

# 工作台 Widget 管理

本 skill 负责 Widget 生命周期管理（创建脚手架、查询、验证编译）。编码细节（SDK API、组件写法、安全沙箱）在 `generate-dynamic-widget` skill 中，需要写代码时先 `LoadSkill(skillName: "generate-dynamic-widget")`。

## 决策树

```
用户想要 Widget
├── 已有 Widget？
│   ├── 是 → WidgetList → WidgetGet → Read → 了解现状
│   │        └── 需要改代码 → ToolSearch(names: "generate-dynamic-widget")
│   │        └── Edit → WidgetCheck
│   └── 否 → 创建新 Widget（见下方流程）
└── 只是查询/浏览？
    └── WidgetList / WidgetGet 即可
```

## 修改 vs 重建决策

当用户想要变更已有 Widget 时：

- **修改现有**（Edit）：用户说"加个 X 功能"、"改下颜色"、"多显示一个字段" → 在现有代码上增量修改
- **重新创建**（WidgetInit）：根本性变更，例如从"天气组件"变成"股票行情"、整体架构/布局完全不同 → 新建 Widget 替换

## 创建新 Widget（必须按顺序）

1. **`WidgetInit`** — 生成脚手架目录
   - 为什么先 init？因为它创建正确的目录结构（`~/.openloaf/dynamic-widgets/<id>/`）、package.json 和类型桩文件。跳过此步直接写文件会导致编译器找不到类型定义。
2. **`ToolSearch(names: "generate-dynamic-widget")`** — 加载编码规范
3. **`Write`** — 写入 widget.tsx（前端组件）
4. **`Write`** — 写入 functions.ts（服务端函数，按需）
5. **`WidgetCheck`** — 编译 + 触发实时预览
   - 为什么最后必须 check？因为它执行 TypeScript 编译并通知前端刷新预览。不调用 check，用户看到的仍是旧内容。

## 修改已有 Widget

1. `WidgetList` → `WidgetGet` → `Read` — 定位并读取源码
2. `Edit` — 精确替换修改
3. `WidgetCheck` — 编译验证

## WidgetCheck 编译失败恢复

当 `WidgetCheck` 返回编译错误时：

1. **读取错误信息** — 关注 TypeScript 错误行号和描述
2. **常见错误及修复**：
   - `Cannot find module 'xxx'` → widget.tsx 只能 import `react`、`react/jsx-runtime`、`@openloaf/widget-sdk`，删除禁用的导入
   - `Type 'xxx' is not assignable` → 检查 SDK 类型定义，确认 props/state 类型匹配
   - `JSX element type does not have any construct` → 检查组件导出是否正确（必须 `export default`）
3. **用 `Edit` 修复** → 再次 `WidgetCheck`，直到编译通过

## Widget 能力边界

**适合做的事情**：
- 数据展示（图表、统计卡片、列表）
- 简单交互（按钮、切换、输入框）
- 定时轮询 API 获取数据（通过 functions.ts 服务端函数）
- 静态或低频更新内容（天气、日历、待办、时钟、番茄钟）

**不适合做的事情**：
- 复杂多页面流程（应使用独立页面）
- 重计算任务（服务端函数有 10 秒超时限制）
- 实时 WebSocket 长连接（沙箱不支持）
- 需要访问本地文件系统的操作（安全沙箱隔离）

## 关键约束

- Widget 代码目录：`~/.openloaf/dynamic-widgets/<widget-id>/`
- `widget.tsx` 只能 import：`react`、`react/jsx-runtime`、`@openloaf/widget-sdk`
- `functions.ts` 在 Server 端执行，10 秒超时
- 敏感信息（API Key 等）通过 Widget 目录下 `.env` 注入，禁止硬编码

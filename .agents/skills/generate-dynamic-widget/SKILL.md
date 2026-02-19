---
name: generate-dynamic-widget
description: >
  Use when the user asks to create, modify, or inspect dynamic desktop widgets.
  Multi-tool workflow: init → apply-patch → check for new widgets;
  list/get → read-file → apply-patch → check for modifications.
---

# Generate Dynamic Widget

## Overview

动态 Widget 是用户通过 AI 生成的自包含桌面组件，存储在 `~/.tenas/dynamic-widgets/<widget-id>/`。

**多工具协作**：AI 像开发者一样分步操作 — 先创建脚手架，再写入完整代码，最后验证编译。

## When to Use

- 用户要求创建自定义桌面组件（如"帮我做一个特斯拉股票 widget"）
- 用户要求创建数据展示面板（天气、汇率、监控等）
- 用户要求修改已有的动态 widget
- 用户要求查看已有 widget 列表

## 可用工具

| 工具 | 说明 | 需审批 |
|------|------|--------|
| `widget-init` | 创建 widget 目录脚手架 | 是 |
| `widget-list` | 列出所有 widget | 否 |
| `widget-get` | 获取单个 widget 详情 | 否 |
| `widget-check` | 验证 + 编译 + 触发前端预览 | 否 |
| `apply-patch` | 写入/覆盖文件（已有工具） | 是 |
| `read-file` | 读取文件内容（已有工具） | 否 |

## 工作流

### 创建新 Widget

```
1. widget-init → 获得 widgetId + widgetDir + 文件列表
2. apply-patch widgetDir/widget.tsx → 写入完整 React 组件
3. apply-patch widgetDir/functions.ts → 写入完整服务端函数
4. widget-check → 验证编译 + 前端显示预览
```

### 修改已有 Widget

```
1. widget-list 或 widget-get → 找到目标 widget
2. read-file → 读取当前代码
3. apply-patch → 修改文件
4. widget-check → 验证 + 前端显示更新后的预览
```

### 查看 Widget 列表

```
1. widget-list → 返回所有 widget 信息
```

## widget-init 参数

```typescript
{
  actionName: string,        // 本次调用目的
  widgetName: string,        // kebab-case，如 "tesla-stock"
  widgetDescription: string, // 中文描述
  size?: {                   // Desktop Grid 单位（列×行），可选
    defaultW, defaultH, minW, minH, maxW, maxH
  },
  functionNames: string[],   // 仅函数名，不含实现
  envVars?: [{               // 环境变量（可选）
    key, placeholder, comment?
  }],
}
```

## widget.tsx 编写规范

AI 用 `apply-patch` 写入完整的 `widget.tsx` 文件。文件必须：

```tsx
import type { WidgetProps } from '@tenas-ai/widget-sdk'
import { useWidgetData, useWidgetTheme } from '@tenas-ai/widget-sdk'

export default function Widget({ sdk }: WidgetProps) {
  const { data, loading, error } = useWidgetData(sdk, 'functionName', {
    refreshInterval: 60000,
  })
  const theme = useWidgetTheme(sdk)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-xs">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-destructive">
        <div className="text-xs">{error}</div>
      </div>
    )
  }

  return (
    // 你的 UI JSX
  )
}
```

关键规则：
- 根元素保持 `h-full` 填满容器
- 样式使用 Tailwind CSS class
- 可用 CSS 变量：`text-foreground`, `text-muted-foreground`, `bg-background`, `bg-card` 等
- 只能 import `react`、`react/jsx-runtime`、`@tenas-ai/widget-sdk` 这几个外部模块
- 不要导入 `@tenas-ai/ui` 组件或 `react-dom`

## functions.ts 编写规范

AI 用 `apply-patch` 写入完整的 `functions.ts` 文件。文件必须包含：

```typescript
import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
config({ path: resolve(__dirname, '.env') })

export async function myFunction() {
  // 实际实现
  return { /* 可 JSON 序列化的对象 */ }
}

// 入口：根据命令行参数调用对应函数
const functionName = process.argv[2]
const fn: Record<string, () => Promise<unknown>> = { myFunction }
const handler = fn[functionName]
if (handler) {
  handler()
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
} else {
  console.error(`Unknown function: ${functionName}`)
  process.exit(1)
}
```

关键规则：
- 必须返回可 JSON 序列化的对象
- API Key 等敏感信息从 `process.env` 读取
- 不要在 stdout 输出非 JSON 内容
- 所有函数名必须在 `fn` 映射中注册

## SDK Hooks 参考

| Hook | 说明 |
|------|------|
| `useWidgetData(sdk, fnName, opts?)` | 封装 sdk.call + loading/error/refetch + 自动轮询 |
| `useWidgetTheme(sdk)` | 基于 useSyncExternalStore 订阅主题变化 |

## SDK API 参考

| 方法 | 说明 |
|------|------|
| `sdk.call(name, params?)` | 调用 package.json scripts 中定义的函数 |
| `sdk.getTheme()` | 获取当前主题 `{ mode: 'light' \| 'dark' }` |
| `sdk.onThemeChange(cb)` | 监听主题变化，返回取消订阅函数 |
| `sdk.emit(event, payload?)` | 触发自定义事件 |
| `sdk.navigate(target, params?)` | 导航跳转 |
| `sdk.chat(message)` | 触发 AI 聊天 |
| `sdk.openTab(type, params?)` | 打开 tab |

## 完整示例：天气 Widget

### Step 1: widget-init

```json
{
  "actionName": "初始化天气 Widget 脚手架",
  "widgetName": "weather",
  "widgetDescription": "实时天气 Widget",
  "functionNames": ["getWeather"],
  "envVars": [
    { "key": "OPENWEATHER_API_KEY", "placeholder": "your_api_key_here", "comment": "OpenWeatherMap API Key" },
    { "key": "WEATHER_CITY", "placeholder": "Beijing", "comment": "城市名称" }
  ]
}
```

### Step 2: apply-patch widget.tsx

完整的 React 组件代码（参考上方 widget.tsx 编写规范）。

### Step 3: apply-patch functions.ts

完整的服务端函数代码（参考上方 functions.ts 编写规范）。

### Step 4: widget-check

```json
{
  "actionName": "验证天气 Widget",
  "widgetId": "dw_weather_1234567890"
}
```

## 安全与限制

- API Key 只存在 `.env` 中，函数在 Server 端执行
- 脚本执行有 10 秒超时限制
- 不要在 widget.tsx 中发起网络请求，通过 `sdk.call()` 走 Server 端
- 不要在 functions.ts 中访问 widget 目录之外的文件系统

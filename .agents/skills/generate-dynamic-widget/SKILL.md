---
name: generate-dynamic-widget
description: >
  Use when the user asks to create a dynamic desktop widget —
  generates the complete widget folder (package.json, widget.tsx,
  functions.ts, .env) under ~/.tenas/dynamic-widgets/
---

# Generate Dynamic Widget

## Overview

动态 Widget 是用户通过 AI 生成的自包含桌面组件，存储在 `~/.tenas/dynamic-widgets/<widget-id>/`。每个 widget 包含 React UI 组件 + 服务端数据获取脚本 + 配置文件。

## When to Use

- 用户要求创建自定义桌面组件（如"帮我做一个特斯拉股票 widget"）
- 用户要求创建数据展示面板（天气、汇率、监控等）
- 用户要求修改已有的动态 widget

## Widget 文件结构

每个 widget 是一个独立文件夹，包含以下文件：

```
~/.tenas/dynamic-widgets/
  dw_<name>_<timestamp>/
    package.json       # 标准 npm 包 + tenas 扩展字段
    widget.tsx         # React UI 组件（入口）
    functions.ts       # TypeScript 数据获取函数
    .env               # 环境变量（API Key 等）
```

## 生成规范

### 1. Widget ID 命名

格式：`dw_<snake_case_name>_<timestamp>`

示例：`dw_tesla_stock_1707123456789`

### 2. package.json 规范

```json
{
  "name": "dw-<kebab-case-name>",
  "version": "1.0.0",
  "description": "简短中文描述",
  "main": "widget.tsx",
  "scripts": {
    "<functionName>": "npx tsx functions.ts <functionName>"
  },
  "tenas": {
    "type": "widget",
    "defaultSize": "4x2",
    "constraints": {
      "defaultW": 4, "defaultH": 2,
      "minW": 2, "minH": 2,
      "maxW": 6, "maxH": 4
    },
    "support": { "workspace": true, "project": true }
  }
}
```

关键规则：
- `scripts` 中每个 key 是函数名，value 是执行命令
- TypeScript 函数统一用 `npx tsx functions.ts <functionName>`
- Python 脚本用 `python3 <script>.py <function>`
- Shell 脚本用 `bash <script>.sh`
- `tenas.constraints` 根据内容复杂度调整尺寸

### 3. widget.tsx 规范

```tsx
import { useEffect, useState } from 'react'
import type { WidgetProps } from '@tenas-ai/widget-sdk'

export default function MyWidget({ sdk }: WidgetProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await sdk.call('getFunctionName')
        setData(result)
      } catch (err) {
        console.error('Widget fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    // 如需轮询，添加 setInterval
    const timer = setInterval(fetchData, 60000)
    return () => clearInterval(timer)
  }, [sdk])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-xs">加载中...</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-4">
      {/* Widget 内容 */}
    </div>
  )
}
```

关键规则：
- 必须 `export default` 一个 React 组件
- Props 类型为 `WidgetProps`，从 `@tenas-ai/widget-sdk` 导入
- 通过 `sdk.call('functionName')` 调用服务端函数
- 样式使用 Tailwind CSS class（与主应用共享）
- 可用的 CSS 变量：`text-foreground`, `text-muted-foreground`, `bg-background`, `bg-card`, `text-destructive`, `border-border` 等
- 根元素保持 `h-full` 填满容器
- 不要导入任何 `@tenas-ai/ui` 组件，只用原生 HTML + Tailwind
- 不要导入 `react-dom`

### 4. functions.ts 规范

```typescript
import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// 加载同目录下的 .env
const __dirname = resolve(fileURLToPath(import.meta.url), '..')
config({ path: resolve(__dirname, '.env') })

// 导出的函数
export async function getStockPrice() {
  const apiKey = process.env.MY_API_KEY
  const res = await fetch('https://api.example.com/data', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  const data = await res.json()
  // 必须返回可 JSON 序列化的对象
  return { price: data.price, change: data.change }
}

// 入口：根据命令行参数调用对应函数
const functionName = process.argv[2]
const fn = { getStockPrice }[functionName]
if (fn) {
  fn().then((result) => {
    console.log(JSON.stringify(result))
  }).catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
} else {
  console.error(`Unknown function: ${functionName}`)
  process.exit(1)
}
```

关键规则：
- 使用 `dotenv` 从同目录 `.env` 读取环境变量
- 每个函数必须返回可 JSON 序列化的对象
- 文件末尾必须有入口分发逻辑（根据 `process.argv[2]` 调用函数）
- 结果通过 `console.log(JSON.stringify(result))` 输出到 stdout
- 错误通过 `console.error` + `process.exit(1)` 报告
- 不要在 stdout 输出非 JSON 内容（如 debug log），会导致解析失败
- API Key 等敏感信息从 `.env` 读取，不要硬编码

### 5. .env 规范

```
# 在此填入你的 API Key
MY_API_KEY=your_api_key_here
```

- 每个需要的 API Key 都给出占位符和注释说明
- 用户需要手动替换为真实值

## 生成流程

1. 确定 widget ID：`dw_<name>_<Date.now()>`
2. 确定需要的数据源和 API
3. 生成 4 个文件，写入 `~/.tenas/dynamic-widgets/<widget-id>/`
4. 告知用户：
   - 如需 API Key，提示编辑 `.env` 文件
   - Widget 已创建，可在桌面组件库的"AI 生成"区域找到并添加

## 编译与加载机制

### esbuild 编译

服务端 `widgetCompiler.ts` 使用 esbuild 编译 `widget.tsx`，将 `react`、`react-dom`、`react/jsx-runtime`、`@tenas-ai/widget-sdk` 标记为 external。产物是 ESM 格式，保留裸模块标识符（如 `from 'react'`）。

### Blob URL Shim（widget-externals.ts）

浏览器通过 Blob URL `import()` 加载编译产物时，无法解析裸模块标识符。共享模块 `widget-externals.ts` 提供 shim 层：

- `ensureExternalsRegistered()` — 将 React 等模块注册到 `window.__TENAS_WIDGET_EXTERNALS__`
- `patchBareImports(code)` — 用正则将 `from 'react'` 等替换为 Blob URL shim

**两个加载入口都使用此 shim**：
- `useLoadDynamicComponent.ts`（桌面 `DynamicWidgetRenderer` 场景）
- `WidgetTool.tsx`（AI 聊天预览场景）

### widget.tsx 编写注意事项（与 shim 相关）

- 只能 import `react`、`react/jsx-runtime`、`react-dom`、`@tenas-ai/widget-sdk` 这四个外部模块
- 不要 import `@tenas-ai/ui` 组件（不在 shim 列表中，会导致加载失败）
- 不要 import `react-dom/client` 等子路径（只有 `react-dom` 被 shim）
- 如需新增外部依赖，必须同时更新 `widget-externals.ts` 的 shim 列表

## AI 聊天中的 Widget 预览（WidgetTool.tsx）

当 AI 通过 `generate-widget` 工具生成 widget 时，聊天界面通过 `WidgetTool.tsx` 渲染预览：

- 工具执行完成后（`part.state === 'output-available'`），自动编译并渲染 widget
- 提供"打开文件夹"按钮（在 stack 中打开 folder-tree-preview）
- 提供"添加到桌面"按钮（跨 tab 事件桥接到 DesktopEditToolbar）

### "添加到桌面"流程

1. 从 `useTabRuntime.getState().runtimeByTabId` 查找 `component === 'workspace-desktop'` 的 tab
2. 切换到桌面 tab（`useTabs.getState().setActiveTab`）
3. 延迟一帧后派发 `DESKTOP_WIDGET_SELECTED_EVENT`（detail 中 tabId 为桌面 tab ID）
4. `DesktopEditToolbar` 接收事件并创建 widget item

## SDK API 参考

Widget 组件通过 `sdk` prop 与主应用交互：

| 方法 | 说明 |
|------|------|
| `sdk.call(name, params?)` | 调用 package.json scripts 中定义的函数 |
| `sdk.getTheme()` | 获取当前主题 `{ mode: 'light' \| 'dark' }` |
| `sdk.onThemeChange(cb)` | 监听主题变化，返回取消订阅函数 |
| `sdk.emit(event, payload?)` | 触发自定义事件 |
| `sdk.navigate(target, params?)` | 导航跳转 |
| `sdk.chat(message)` | 触发 AI 聊天 |
| `sdk.openTab(type, params?)` | 打开 tab |

## 安全与限制约束

- API Key 只存在 `.env` 中，函数在 Server 端执行，Key 不会发送到前端
- 脚本执行有 10 秒超时限制
- 不要在 widget.tsx 中发起网络请求，所有数据获取通过 `sdk.call()` 走 Server 端
- 不要在 functions.ts 中访问 widget 目录之外的文件系统
- widget.tsx 只能 import 被 shim 的外部模块（react、react-dom、react/jsx-runtime、@tenas-ai/widget-sdk），import 其他包会导致运行时 `Failed to resolve module specifier` 错误

## 示例：天气 Widget

### package.json
```json
{
  "name": "dw-weather",
  "version": "1.0.0",
  "description": "实时天气 Widget",
  "main": "widget.tsx",
  "scripts": {
    "getWeather": "npx tsx functions.ts getWeather"
  },
  "tenas": {
    "type": "widget",
    "defaultSize": "4x2",
    "constraints": { "defaultW": 4, "defaultH": 2, "minW": 2, "minH": 2, "maxW": 6, "maxH": 4 },
    "support": { "workspace": true, "project": true }
  }
}
```

### widget.tsx
```tsx
import { useEffect, useState } from 'react'
import type { WidgetProps } from '@tenas-ai/widget-sdk'

export default function WeatherWidget({ sdk }: WidgetProps) {
  const [weather, setWeather] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await sdk.call('getWeather')
        setWeather(data)
      } finally {
        setLoading(false)
      }
    }
    fetch()
    const timer = setInterval(fetch, 300000)
    return () => clearInterval(timer)
  }, [sdk])

  if (loading) return <div className="flex h-full items-center justify-center text-muted-foreground text-xs">加载中...</div>
  if (!weather) return <div className="flex h-full items-center justify-center text-destructive text-xs">加载失败</div>

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="text-sm text-muted-foreground">{weather.city}</div>
      <div className="text-3xl font-bold">{weather.temp}°C</div>
      <div className="text-sm text-muted-foreground">{weather.description}</div>
    </div>
  )
}
```

### functions.ts
```typescript
import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
config({ path: resolve(__dirname, '.env') })

export async function getWeather() {
  const apiKey = process.env.OPENWEATHER_API_KEY
  const city = process.env.WEATHER_CITY || 'Beijing'
  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric&lang=zh_cn`
  )
  const data = await res.json()
  return {
    city: data.name,
    temp: Math.round(data.main.temp),
    description: data.weather?.[0]?.description || '',
    humidity: data.main.humidity,
    wind: data.wind.speed,
  }
}

const functionName = process.argv[2]
const fn: Record<string, () => Promise<unknown>> = { getWeather }
const handler = fn[functionName]
if (handler) {
  handler().then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e.message); process.exit(1) })
} else {
  console.error(`Unknown function: ${functionName}`)
  process.exit(1)
}
```

### .env
```
# OpenWeatherMap API Key (https://openweathermap.org/api)
OPENWEATHER_API_KEY=your_api_key_here
# 城市名称
WEATHER_CITY=Beijing
```

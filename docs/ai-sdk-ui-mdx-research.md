# AI SDK v6 + ai-sdk-ui 渲染机制与 MDX 输出方案（研究记录）

本文基于 AI SDK v6（`ai@6.0.0-beta.128`）与 AI SDK UI 文档整理，目标是回答：

1. `ai-sdk-ui` 如何把 AI 返回的数据渲染到前端？
2. 如果希望 AI 直接输出 **MDX/Markdown**，前端推荐用什么组件渲染？

---

## 1. ai-sdk-ui 在 v6 的渲染模型

AI SDK UI 是一组框架无关的 UI hooks（React/Next/Vue/Svelte 均可用），v6 主推三类交互：

- `useChat`：聊天（消息流、工具调用、附件、来源等）
- `useCompletion`：纯文本补全（流式）
- `useObject`：结构化对象/JSON（流式）

这些 hooks 的共同点：**返回可渲染的 UI 状态，并在流式 chunk 到达时自动更新状态触发重渲染**。

### 1.1 `useChat`：`messages` + `parts` 分段渲染

v6 的 UI 消息（UIMessage）推荐使用 `parts` 渲染而非 `content`：

- `message.content`：旧式整段文本。
- `message.parts`：**分段结构**，每段都有 `type`，支持：
  - `text`：普通文本
  - `tool-*`：工具调用或工具结果（typed tool parts）
  - `source-url` / `source-document`：来源
  - `file` / attachments：文件与图片等

典型渲染逻辑：

1. `messages.map(message => ...)`
2. 对每条消息 `message.parts.map(part => switch(part.type){...})`
3. 每种 `part.type` 对应一个 React 组件/渲染分支。

### 1.2 工具调用的 typed parts + 流式状态

当你在服务端给模型提供 tools 时，assistant 消息的 `parts` 里会出现工具相关片段：

- 类型命名采用 `tool-${toolName}` 的强类型约定（v5+ 延续到 v6）。
- 开启 tool-call streaming 后，工具调用参数会边生成边到达前端。

渲染要点：

- 通过遍历 `parts` 判断是否出现某个 `tool-*` part。
- 使用 `part.state` 区分 `partial`（中间态）和 `done`（最终态）：
  - `partial`：渲染 skeleton/loading
  - `done`：渲染最终工具组件（传入 `part.args` / `part.result`）

### 1.3 `useCompletion` / `useObject`：按 chunk 更新

- `useCompletion` 默认每收到一个 chunk 就更新 `completion` 并触发 render。
  - 可用 `experimental_throttle` 限制 UI 更新频率。
- `useObject` 同理，每个 chunk 会更新对象状态（适合 JSON/表单/结构化 UI）。

### 1.4 与 RSC “Generative UI” 的关系

v6 还提供 `@ai-sdk/rsc` 路线：

- 服务端用 `createStreamableUI()` 生成可流式更新的 React UI。
- 客户端拿到 `.value` 后像普通组件一样渲染。

这与 `ai-sdk-ui` hooks 的差异：

- `ai-sdk-ui`：前端渲染 **消息/parts 状态**。
- `@ai-sdk/rsc`：模型/工具在服务端直接产出 **React 元素流**。

两者可组合：例如 tool 结果用 RSC 流式 UI 输出，前端通过 `tool-*` part 渲染该 UI。

---

## 2. 让 AI 输出 MDX/Markdown 的前端渲染方案

### 2.1 推荐优先：把 AI 输出当 Markdown 渲染（不执行 JSX）

原因：AI 内容不可完全信任，MDX 会执行 JSX，存在 XSS/任意组件调用风险。

推荐组件组合（React/Next）：

- `react-markdown`：Markdown to React
- `remark-gfm`：表格/任务列表/脚注等 GFM 支持
- `rehype-sanitize`：HTML 白名单净化（强烈建议开启）
- 代码高亮：
  - 轻量：`rehype-highlight`
  - 更好看：`shiki`（可在自定义 `code` 渲染器中接入）

使用方式：

- 约束 AI 输出为 “Markdown + 约定的 fenced code block/标记”。
- 在 `react-markdown` 的 `components` 里对特定 block 做映射，例如：
  - ```chart``` → `<Chart />`
  - ```callout``` → `<Callout />`

优点：安全、简单、流式渲染友好（chunk 拼接后整体渲染）。

### 2.2 确实需要运行 MDX（允许 JSX/自定义组件）

适用场景：你希望模型输出 `<MyCard />`、`<Quiz />` 这类交互组件，并由前端执行。

推荐组件/库（Next.js）：

- `next-mdx-remote`（含 RSC 版本 `next-mdx-remote/rsc`）
- 或底层自行用：
  - `@mdx-js/mdx` / `xdm` 编译 MDX → JS
  - `@mdx-js/react` 提供组件映射

安全注意：

- **只允许白名单组件**（`components` 映射里限定可用组件）。
- 对原始 MDX 做 sanitize/过滤（至少禁用 `<script>`、事件属性、未知标签）。
- 不要把 AI 的 MDX 直接 `eval`/`new Function` 执行。

在 v6 的 `useChat` 中落地：

- AI 输出走 `text` part（或你自定义的 `tool-mdx` part）。
- 最终在对应 part 渲染器里用 MDX 渲染组件解析。

---

## 3. 结合 ai-sdk-ui 的落地建议

1. **短期上线：Markdown 渲染即可**
   - 对 AI 提示词加约束：只输出 Markdown，不输出 JSX。
   - 前端用 `react-markdown` 渲染 `text` parts。

2. **需要结构化/复杂 UI：走 tools + typed parts**
   - 模型只输出工具调用。
   - 工具返回结构化数据或 RSC UI。
   - 前端根据 `tool-*` part 渲染对应组件。

3. **要 MDX 组件能力：先限定语法与白名单**
   - 定义一套 “允许的 MDX 组件 API” 文档给模型。
   - 用 `next-mdx-remote` 渲染，并严格白名单与 sanitize。

---

## 4. 参考

- AI SDK UI overview / chatbot / tool usage / generative UI 文档（v6 对齐）。
- AI SDK RSC：`createStreamableUI`、`useUIState`、`useActions` 相关章节。


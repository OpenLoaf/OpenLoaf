# 嵌入浏览器 + AI 自动化（Electron 方案为主）

本文记录“在前端显示一个嵌入浏览器，并让 AI 操作同一个浏览器实例”的可行技术方案，重点展开 **Electron（VS Code 类）**实现路径，并解释为什么在 Tauri 上做“同一个 WebView 的通用 CDP 自动化”存在平台差异与工程风险。

> 目标：用户在前端看到一个“浏览器标签页/面板”，AI 的所有操作（打开网页、点击、输入、抓取信息、截图）都作用于这个正在显示的浏览器，而不是另起一个不可见的浏览器。

---

## 1. 背景：VS Code 的“嵌入浏览器”是什么

VS Code Desktop 基于 **Electron**。Electron 自带 Chromium，因此它可以在应用内部创建并承载多个 **WebContents**（每个 WebContents 都是一份独立的浏览器页面/标签页实例），再把它们布局到工作台 UI 里（类似编辑器区、预览区）。

VS Code 的 Webview 文档也强调：Webview 在概念上类似 iframe（隔离、CSP、通过消息传递通信），但它运行在 VS Code/Electron 的 Chromium 环境中。

结论：VS Code 能做“嵌入浏览器标签页”，本质是 **应用自带 Chromium 引擎并承载 WebContents**。

---

## 2. Tauri 是否提供 CDP？

### 2.1 默认情况：不提供“通用 CDP”

Tauri（通过 `wry`）默认使用系统 WebView：

- macOS：WKWebView（WebKit）
- Windows：WebView2（Chromium，但 API 体系是 WebView2 COM）
- Linux：WebKitGTK

CDP（Chrome DevTools Protocol）是 Chromium 的协议，因此 **Tauri 并不具备跨平台一致的“CDP 控制同一个 WebView”的开箱能力**。

### 2.2 Windows 特例：WebView2 可能支持 DevTools Protocol

在 Windows 上，WebView2 提供与 DevTools Protocol 相关能力（可以认为是“能发 CDP 方法”的一条路径），但这通常需要你自行：

- 写 Tauri Rust 插件/自定义 command
- 将 WebView2 的 DevTools Protocol 调用能力封装为 JS 可调用接口

同时，这条路对 macOS/Linux 并不等价（WebKit 的远程调试协议不同且偏调试用途），因此跨平台一致性与自动化覆盖面存在较大不确定性。

---

## 3. 最接近 VS Code 的方案：Electron + 内嵌 WebContents + CDP 自动化

### 3.1 核心思想

1) 在 Electron 中创建“浏览器面板/标签页”：每个 tab 对应一个 `WebContents`（推荐用 `WebContentsView` 承载，旧的 `BrowserView` 趋于被替代/弃用）。

2) AI 自动化不再依赖外部浏览器，而是直接对“正在显示的那个 WebContents”附加调试器并发送 **CDP** 指令（Electron 提供 `webContents.debugger`）。

这保证了：**AI 操作的对象与用户看到的对象是同一个**。

### 3.2 你会得到哪些能力（对应需求）

基于 CDP（Chrome DevTools Protocol），可以实现：

- 打开网页：`Page.navigate`
- 等待加载：`Page.loadEventFired` / `Page.lifecycleEvent` / `Network.*` 等事件
- 点击/输入：`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`
- 读取页面信息：
  - DOM：`DOM.getDocument` / `DOM.querySelector` / `DOM.getOuterHTML`
  - JS：`Runtime.evaluate`
  - 可访问性树（适合喂给 LLM 做“语义选择”）：`Accessibility.getFullAXTree`
- 截图：`Page.captureScreenshot`
- 网络/控制台：`Network.*` / `Runtime.consoleAPICalled`（用于审计与调试）

### 3.3 架构拆分（建议与现有 monorepo 对齐）

建议将“AI 决策层”与“浏览器执行层”分离：

#### A) `apps/server`：Agent/对话/工具编排（LLM 决策）

- 负责：对话（SSE）、历史记录、工具调用编排
- 新增：`browser_*` 工具，但这些工具不在 server 内直接启动浏览器
- 改为：将工具调用请求转发给 Electron 客户端（因为浏览器在客户端里）

#### B) Electron App：UI + BrowserTabManager（执行层）

Electron 主进程维护一个 `BrowserTabManager`（概念名）：

- 创建 tab：`createTab(url, profileId?)`
- 激活 tab：`activateTab(tabId)`
- 设置 tab 视图位置/大小：`setTabBounds(tabId, rect)`
- 发送 CDP：`cdpSend(tabId, method, params)`
- 订阅事件：`cdpOn(tabId, eventName, handler)`（把 Page/Network/Console 等事件回传）

Electron 渲染进程（你的 React UI）负责：

- 渲染 Plant 页面与浏览器容器区域
- 计算容器 DOMRect，通知主进程更新 bounds，实现“嵌入效果”
- 展示 tab UI（地址栏、前进后退、关闭等）——可选

#### C) `apps/server` ↔ Electron 通信（推荐 WebSocket）

建立一条常驻双向通道：

- Electron 启动后主动连接 server：`registerClient({ clientId, capabilities })`
- server 下发动作：`browser.action({ sessionId, tabId, action, payload })`
- Electron 回传结果：`browser.result({ actionId, ok, screenshot?, a11yTree?, url?, title?, logs? })`

优势：

- 适合流式/事件推送（页面加载、网络事件、console）
- 断线重连策略简单（Electron 是“执行端”）

### 3.4 “嵌入到 React 组件里”的实现要点（非 DOM 的视图嵌入）

由于 `WebContentsView` 是原生层视图，不在 DOM 树里，所谓“嵌入”通常采用对齐坐标系的方式：

1) React 页面中留一个“浏览器容器”占位元素（div）
2) 使用 `getBoundingClientRect()` 读取它在窗口中的 `x/y/width/height`
3) 加上 DPI/缩放（devicePixelRatio）与窗口偏移（如有）
4) 通过 IPC 通知 Electron 主进程：更新对应 tab 的 `WebContentsView` bounds
5) 监听布局变化（ResizeObserver / window resize / panel collapse 等）持续更新

结果：浏览器视图看起来像“嵌在组件里”。

### 3.5 AI 操作策略：不要只依赖坐标点击

为了更稳，建议采用“两层策略”：

- **语义定位优先**：拉取 Accessibility Tree（或压缩版 DOM 语义摘要），由 LLM 选择目标（如“登录按钮”），再用选择器/JS 执行 click 或计算元素 box
- **事件派发兜底**：当直接 click 不生效（某些站点反自动化/自定义事件），使用 CDP `Input.dispatch*` 模拟真实输入

这样可显著减少“坐标错位、元素不可点击、遮罩层”等问题。

### 3.6 会话/登录态隔离（profile/partition）

你需要明确“登录态属于谁”：

- 按 `sessionId` 隔离：每个会话一个存储分区（cookie/localStorage 不串）
- 全局共享：更像“用户浏览器”，但多会话/多用户易串号

Electron 支持按 partition/session 隔离存储。建议先按 `sessionId` 隔离，便于审计与回放。

---

## 4. 与 Playwright 的关系：要不要同时用？

Electron CDP 能覆盖核心动作与抓取需求，因此可以先 **不引入 Playwright**，降低复杂度。

如果未来希望复用 Playwright 的“高层语义 API”（locator、自动等待等），可考虑：

- 让 Playwright 通过 CDP 连接到 Electron/Chromium（需要确保连接到正确的实例/上下文）
- 但这会引入更多工程与调试复杂度，建议在 Electron CDP MVP 稳定后再评估

---

## 5. 取舍总结

Electron 方案的核心 trade-off：

- ✅ 最接近 VS Code：真正的“内嵌浏览器 tab”，且可对同一个 tab 做 CDP 自动化
- ✅ 跨域/复杂网页自动化能力强（CDP 处在浏览器内部）
- ❌ 相比 Tauri 包体与资源占用更高
- ❌ 需要桌面端换壳或新增 Electron 运行时（工程结构需调整）

如果目标是“像 VS Code 一样的嵌入浏览器 + AI 操作同一个浏览器”，Electron 是目前最直接、落地风险最低的路线。


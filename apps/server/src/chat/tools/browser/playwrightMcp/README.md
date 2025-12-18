# PlaywrightMcp（Server 侧 CDP 工具实现）

本目录用于承载 `apps/server/src/chat/tools/browser/playwrightMcp.ts` 相关的拆分实现：在 **Node(server)** 里通过 **Playwright 的 `chromium.connectOverCDP`** 连接到 **Chromium CDP WebSocket**，并以 **CDP 命令/事件** 为主完成浏览器自动化能力（点击、输入、导航、抓取 network/console 等）。

> 重要背景：本项目的页面通常由 `open-url` 在 Electron 侧打开；server 侧不负责创建新 tab，只负责 **attach 到已存在页面** 并进行操作。

## 整体工作流

1. `open-url` 打开页面，并在 server 侧登记 `pageTargetId -> { url, tabId, cdpTargetId... }`
2. 任一 `playwright-*` 工具调用时：
   - 先校验 `pageTargetId` 是否归属当前 `activeTab`
   - 从 `@teatime-ai/config` 提供的 `versionUrl` 拉取 `/json/version`，拿到 `webSocketDebuggerUrl`
   - `playwright-core` 使用 `chromium.connectOverCDP(wsUrl)` 连接浏览器
   - 在已有 contexts/pages 中挑选匹配页面（优先 `cdpTargetId`，兜底 URL includes）
   - 为该页面创建 `newCDPSession(page)`，并安装 network/console 事件收敛器（写入进程内缓存）
   - 执行对应工具逻辑（CDP `send` / Playwright `page.*`）

## 目录模块说明

- `withCdpPage.ts`
  - **职责**：统一的 CDP 连接与页面 attach 封装（校验、connect、pick page、建 session、装 collectors、finally 关闭 browser）
  - **原因**：避免每个 tool 重复写连接/清理/错误处理
- `cdpWs.ts`
  - **职责**：从 `/json/version` 获取 `webSocketDebuggerUrl`
  - **依赖**：`@teatime-ai/config` 的 `getCdpConfig(process.env)`
- `pagePicker.ts`
  - **职责**：在 `connectOverCDP` 后的 browser 中挑选“已存在页面”
  - **策略**：优先按 `Target.getTargetInfo` 匹配 `cdpTargetId`，否则按 URL includes 兜底
  - **约束**：禁止新页面（popup/new tab）会被自动关闭
- `collectors.ts`
  - **职责**：监听 CDP 事件，把 network / console 收敛成“短摘要”写入进程内缓存
  - **目的**：避免把大字段写进对话上下文，同时支持 `list/get` 这类“查询缓存”工具
- `stores.ts`
  - **职责**：进程内缓存结构（network/console）
  - **注意**：缓存只在当前 Node 进程有效，重启会清空
- `dom.ts`
  - **职责**：DOM 相关辅助（解析 `uid/backendDOMNodeId`、计算中心点、派发鼠标事件）
  - **实现**：主要基于 CDP `DOM.*` 与 `Input.dispatchMouseEvent`
- `axSnapshot.ts`
  - **职责**：把 Accessibility Tree 收敛为可读文本（含 `uid` 列表），避免超长输出
- `guards.ts`
  - **职责**：复用校验逻辑：`pageTargetId` 是否存在且归属当前 `activeTab`
  - **使用场景**：只读取缓存的工具（network/console 列表与详情）
- `networkSummary.ts`
  - **职责**：将 headers 做摘要（keys + 常见关键 header），避免超长返回
- `text.ts`
  - **职责**：文本/JSON 体积控制（`truncateText`、`safeJsonSize`）

## 与入口文件的关系

真正的 tool 定义仍集中在：

- `apps/server/src/chat/tools/browser/playwrightMcp.ts`

该文件负责：

- 导出所有 `playwright*Tool`（供 `apps/server/src/chat/tools/browser/tools.ts` 注册）
- 组合调用本目录的模块完成具体行为

## 关键约束与注意事项

- **不会创建新 tab/page**：只 attach 到 `open-url` 打开的页面；因此必须先调用 `open-url` 获得 `pageTargetId`
- **事件缓存为进程内**：`listNetworkRequests/listConsoleMessages` 等读取的是内存缓存，不是持久化数据
- **输出长度控制**：工具返回值会进入对话历史，必须对超大对象/字符串做截断或摘要
- **类型与 DOM**：server 端 tsconfig 不包含 DOM lib，入口文件里用 `declare const window/document` 兜底（用于 `page.evaluate`/`waitForFunction` 的函数体）

## 新增/调整工具的建议做法

如果要新增一个 CDP/Playwright 工具：

1. 优先把“通用能力”放到本目录模块（例如：新的 collector、DOM helper、摘要逻辑）
2. 在 `apps/server/src/chat/tools/browser/playwrightMcp.ts` 里新增导出的 tool，并尽量复用 `withCdpPage`
3. 在 `apps/server/src/chat/tools/browser/tools.ts` 注册 toolId -> tool
4. 若返回数据可能很大，务必用 `truncateText` / `safeJsonSize` 做保护


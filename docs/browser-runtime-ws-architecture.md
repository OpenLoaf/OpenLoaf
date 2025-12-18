# Browser Runtime WS 架构方案（Electron / Headless 统一）

> 目标：把“打开网页并获得可控 targetId”从当前 `open-url(UI) + playwright(CDP attach)` 的两段式流程，升级为“server 统一调度 + runtime 执行”的一段式流程；同时保留现有 Tab/Stack 的产品模型，并为未来 VNC/远程浏览预留扩展点。

## 1. 背景与现状（当前项目实际结构）

### 1.1 产品模型（应用 Tab vs 网页）

- **应用级 Tab**：`Tab`（`packages/api/src/common/tabs.ts`）是应用内的工作单元，每个 Tab 有自己的：
  - `chatSessionId`（右侧聊天会话/Agent 的身份）
  - `stack: DockItem[]`（左侧的 overlay 堆栈，可打开多个网页面板）
- **网页面板（stack item）**：通过 `DockItem.component = "electron-browser-window"` 渲染 `ElectrronBrowserWindow`，该组件不是 iframe，而是通过 Electron `WebContentsView` 嵌入网页。

### 1.2 当前“打开网页 + 控制网页”的链路（痛点来源）

- 打开网页：server 工具 `open-url` 通过 SSE `data-ui-event` 推送 `uiEvents.pushStackItem`，前端在某个 `tabId` 的 LeftDock 里新增 stack item。
- 渲染网页：Web UI 每帧计算容器 rect，并通过 preload IPC 调用 `upsertWebContentsView({ key, url, bounds })`，Electron main 创建/更新 `WebContentsView` 并 `setBounds`。
- 控制网页：server 工具 `playwright-*` 通过 `chromium.connectOverCDP` 连接 Electron 的 remote debugging 端口，并在已存在 pages 中按 URL 规则猜测页面（`pickExistingPage`）。

痛点：
- 需要强制两段式工具调用：`open-url` → `playwright-*`，对 Agent 使用不友好。
- 多 stack/多 tab/同 URL 情况下，按 URL 猜 page 有串页风险。
- 后台运行或非 Electron 客户端（没有 activeTab/没有 UI writer）无法“打开 stack”，只能失败或走非预期路径。

## 2. 新需求（本方案的约束）

### 2.1 统一调度

- server 需要一个“指定打开网页的方法”的统一入口：根据运行环境与策略，选择 Electron 可视化打开，或 Headless 打开。

### 2.2 身份与隔离

- Electron main 会生成并持久化 `electronClientId`。
- Web 侧会生成 `webClientId`（稳定），并在 `/chat/sse` 请求时把 `webClientId`（以及 Electron 环境下的 `electronClientId`）传给 server。
- server 需要基于账号/绑定关系校验 `electronClientId` 是否允许（未来有认证服务时实现；MVP 可先留接口）。

### 2.3 多端策略（预留）

- 非 Electron 访问（HTTP web/手机）默认走 Headless。
- 允许用户配置策略：例如“手机优先使用 VNC”或“手机优先使用 PC 上在线的 Electron runtime”。
- VNC/远程可视化先不做，但需要预留协议与数据模型。

## 3. 总体方案：单一 WS Hub + 多种 Runtime Client

### 3.1 核心思想

- server 启动一个 **Browser Runtime Hub（WebSocket）**。
- 多种 runtime client 都连接到同一个 Hub：
  - Electron runtime client（运行在 Electron main）
  - Headless runtime client（可选：独立进程；也可先由 server 本进程直接 headless，后续再外置）
- server 的 AI/工具不直接“创建 WebContentsView”，而是：
  1) 通过 Hub 下发统一命令（例如 `openPage`）
  2) runtime 执行并返回结果（尤其是 `cdpTargetId`）
  3) 若需要可视化，再由 runtime 驱动前端创建 stack 容器（IPC → renderer），并由 renderer 持续同步 bounds 到 Electron。

### 3.2 为什么不拆成 electron/headless 两个 WS 服务

- Hub 的事件/命令可以做到协议一致（同一个 `openPage`，不同 runtime 选择性支持更多能力）。
- server 的调度逻辑更简单：同一套路由/鉴权/重试/超时策略。

## 4. 关键数据与术语

### 4.1 Client IDs

- `electronClientId`：由 Electron main 生成并持久化，用于标识一台“可视化 runtime 设备”。
- `webClientId`：由 Web UI 生成并稳定化，用于标识某次 UI 连接（可复用现有 SSE `clientId` 的机制）。

### 4.2 Browser Session（建议新增的 server 内存态 registry）

> 目的：统一把 “pageTargetId → 归属 + 选择器 + backend” 固化为单一真相，确保权限边界与稳定 attach。

建议的 session 关键字段：
- `pageTargetId`：网页会话唯一 id（建议由 server 生成 UUID/ULID；允许外部传入但必须防碰撞）。
- `ownerAccountId`：未来认证系统落地后加入（MVP 可空）。
- `ownerChatSessionId`：当前 AI 会话（server `/chat/sse` 的 `sessionId`）。
- `ownerTabId?`：可视化模式下绑定到具体应用 Tab（保证“tab 内网页只被该 tab 的 agent 控制”）。
- `backend`：`"electron"` / `"headless"` / `"vnc"`（预留）。
- `electronClientId?`：backend=electron 时绑定到具体设备。
- `cdpTargetId?`：backend=electron 时必填，用于 Playwright/CDP 精确定位 page。
- `url` / `createdAt` / `lastSeenAt`：用于调试与 TTL 回收。

## 5. 通信协议设计（tRPC WebSocket 推荐形态）

> 目标：同一套消息结构同时支持 Electron 与 Headless runtime；支持 request/response（带 requestId）与 server 推命令。

### 5.1 Runtime → Server：注册（hello）

- `runtime.hello`（mutation）
  - 入参：`{ runtimeType, electronClientId?, instanceId, capabilities, auth }`
  - 返回：`{ ok: true, serverTime, policyHints? }`

说明：
- Electron runtime 必须上报 `electronClientId`。
- Headless runtime 可上报 `instanceId`（用于调度）。
- `auth` 用于鉴权（MVP 可先用共享 token；后续接入账户体系）。

### 5.2 Server → Runtime：命令流（subscription）

- `runtime.subscribeCommands`（subscription）
  - 入参：`{ instanceId }`（或 `{ electronClientId }`）
  - 输出：统一 `RuntimeCommand`：
    - `openPage`
    - `closePage`
    - `setBounds`（仅 electron runtime 用；也可继续沿用现有 renderer→Electron 的 `upsertWebContentsView`）
    - `screenshot`（预留）
    - `vncConnect`（预留）

### 5.3 Runtime → Server：命令回执（mutation）

- `runtime.ackCommand`（mutation）
  - 入参：`{ requestId, ok, result?, error? }`

`openPage` 的 `result` 建议包含：
- `{ pageTargetId, cdpTargetId?, webContentsId?, backend }`

## 6. 打开网页的端到端时序（Electron 可视化路径）

### 6.1 AI/工具触发（server）

1) `/chat/sse` 请求携带：
   - `activeTab`（已有）
   - `webClientId`（新增）
   - `electronClientId`（Electron 环境新增）
2) server 侧工具调用 “打开网页”入口（可继续叫 `open-url`，但语义升级为 `browserOpen`）：
   - 生成 `pageTargetId`
   - 创建 `BrowserSession`（ownerChatSessionId/ownerTabId/electronClientId）
   - 通过 Hub 向 electron runtime 下发 `openPage`
   - 等待 `ack(openPage)` 返回 `cdpTargetId`

### 6.2 Electron runtime 执行（Electron main）

1) 收到 `openPage`：
   - 创建/复用 `WebContentsView`（key 推荐直接使用 `browser-window:${pageTargetId}`）
   - `loadURL(url)`
   - 用 `webContents.debugger` attach 并获取 `cdpTargetId`
2) 回 server：`ackCommand`（带 `cdpTargetId`）
3) 触发 UI 显示（关键改动点）：
   - Electron main 通过 `win.webContents.send("teatime:ui-event", UiEvent)` 推送 `UiEventKind.PushStackItem`
   - renderer 收到后更新 `useTabs`，从而在对应 `tabId` 的 stack 里渲染 `ElectrronBrowserWindow` 容器

### 6.3 Renderer 同步 bounds（现有逻辑复用）

- `ElectrronBrowserWindow` 仍然用 rAF 每帧计算 DOM rect，并 `upsertWebContentsView({ key, bounds, visible })` 同步给 Electron。
- Electron main 仍然 `view.setBounds(bounds)` 实现“窗口/布局变化时网页跟随变化”。

## 7. 非 Electron / 后台运行（Headless 路径，先不做 VNC）

### 7.1 选择策略（server）

- 当 client context 不含 `electronClientId`，或账户策略指定不使用 Electron 时：
  - `BrowserSession.backend = "headless"`
  - 由 server 本进程启动 headless Playwright，创建 page 并 `goto(url)`
  - 返回 `pageTargetId`

> 预留：未来把 headless 外置为 runtime client 时，协议复用 `openPage/ackCommand` 即可。

### 7.2 UI 渲染策略（建议）

非 Electron 客户端默认不渲染真实网页，可渲染一个 “Browser Session 卡片”：
- 展示 URL、运行状态、最后截图时间
- 提供按钮：刷新截图/停止任务/复制链接

## 8. Playwright/CDP 工具层的适配建议

目标：控制工具不再依赖 URL 猜测，而是优先用 `cdpTargetId` 精确选择 page。

建议调整点（概念层，不写代码）：
- 现有 `pageTargets` 升级为 `BrowserSessionRegistry`（见 4.2）
- `withCdpPage(pageTargetId, fn)`：
  - 校验 `ownerChatSessionId === requestContext.sessionId`
  - backend=electron 时：
    - `connectOverCDP`
    - 枚举 pages → 为每个 page 取其 targetId → 匹配 `cdpTargetId`
  - backend=headless 时：
    - 直接使用 session 中保存的 headless page 引用执行

## 9. 安全与认证（MVP 与后续）

### 9.1 MVP 最小安全要求

- runtime 连接 Hub 必须带 `auth`（共享 token 或本机密钥），避免任意进程伪装 runtime。
- `/chat/sse` 传来的 `electronClientId` 不能直接信任；至少要验证该 `electronClientId` 当前在线，且与该账号/设备绑定关系匹配（后续认证服务落地后补齐）。

### 9.2 后续认证服务接入点

- server 在执行 `openPage` 前做：
  - `accountId` 下是否绑定该 `electronClientId`
  - 是否允许该 `webClientId` 发起对该 `electronClientId` 的控制请求

## 10. 详细改动建议清单（按仓库结构分组）

> 注意：本清单只描述“需要改哪里/改什么”，不包含代码实现。

### 10.1 `packages/api`（协议与类型单一事实来源）

- `packages/api/src/types/event.ts`
  - 扩展 `ClientContext`：新增 `webClientId`、`electronClientId?`、`runtime?`
  - （可选）为 Electron IPC UI 消息复用 `UiEvent` 结构，不新增新的 kind
- 新增 `packages/api/src/types/runtime.ts`（建议）
  - 定义 `RuntimeHello`、`RuntimeCommand`、`RuntimeAck` 的 zod schema 与 TS 类型
  - 定义 `runtimeType`、`capabilities`、`requestId` 约定

### 10.2 `apps/web`（把 clientId 传给 server + 接 IPC UI 事件）

- `apps/web/src/lib/chat/transport.ts`
  - 在 `data-client-context` 里附加 `webClientId`（可复用 `getStableClientStreamClientId()` 的值）
  - Electron 环境下附加 `electronClientId`（由 preload 暴露给 renderer 获取）
- `apps/web/src/lib/chat/ui-event.ts`
  - 复用现有 handler：新增一个入口从 Electron IPC 收到 `UiEvent` 后直接 `handleUiEvent(event)`
- `apps/web/src/types/electron.d.ts`
  - 扩展 `window.teatimeElectron`：提供读取 `electronClientId` 的只读方法/字段（例如 `getElectronClientId()`）

### 10.3 `apps/electron`（runtime client + IPC 推 UI event）

- `apps/electron/src/main`
  - 新增 runtime client 模块：启动时连接 Hub（地址从 serverUrl 推导或环境变量配置）
  - 支持 `hello` 与 `subscribeCommands`
  - 实现 `openPage`：创建/复用 `WebContentsView`、获取 `cdpTargetId`、回 ack
  - 通过 `win.webContents.send` 推 `UiEvent` 给 renderer（用于创建 stack 容器）
- `apps/electron/src/preload/index.ts`
  - 新增 `ipcRenderer.on("teatime:ui-event", ...)`，把事件桥接给 renderer（例如 `window.dispatchEvent(new CustomEvent("teatime:ui-event", { detail }))`）
  - 暴露 `getElectronClientId()` 给 renderer

### 10.4 `apps/server`（Hub + Provider + registry + 选择策略）

- 新增 Browser Runtime Hub（tRPC ws）
  - 注册 runtime：维护在线 runtime 列表（按 `electronClientId/instanceId` 索引）
  - 命令下发与回执：维护 pending requestId，做超时/断线失败处理
- 新增/升级 BrowserSessionRegistry
  - 替代或扩展现有 `pageTargets`，保存 owner 与 backend 选择器（cdpTargetId）
- 升级“打开网页”工具（现有 `open-url` 或新 `browser-open`）
  - 根据 client context + 用户策略选择 backend
  - 走 electron 时通过 Hub 下发 `openPage` 并等待 `cdpTargetId`
  - 走 headless 时在 server 内启动 headless（MVP），返回 `pageTargetId`
- 升级 `playwrightMcp`
  - electron backend：按 `cdpTargetId` 精确选 page（替换 URL includes 匹配）
  - headless backend：直接使用 session 的 headless page

## 11. 迁移与兼容建议（分阶段）

### Phase 1（最小闭环）

- 引入 `electronClientId/webClientId` 传递
- Hub 上线（electron runtime 只实现 `openPage`）
- Electron main `openPage` 返回 `cdpTargetId`，并通过 IPC 触发 renderer `pushStackItem`
- `playwrightMcp` 仍可暂时保留 URL 匹配作为 fallback，但优先用 `cdpTargetId`

### Phase 2（后台与多端策略）

- server 增加策略配置：非 Electron 客户端默认 headless；可配置“优先使用某个 electronClientId”
- 完善账户绑定校验与授权

### Phase 3（VNC/远程可视化，预留）

- headless runtime client 实现 `openPage/screenshot/vncConnect`
- Web/手机端 stack 面板支持 VNC 画面或截图刷新

---

## 12. 关键注意事项（避免踩坑）

- **不要信任浏览器传入的 `electronClientId`**：必须走账号绑定校验（你们后续会做认证服务，这里要预留接口）。
- **UI 显示与网页创建分离**：electron runtime 打开页面可以先创建 view，但真正“显示在哪”仍由 renderer 计算 bounds 决定。
- **pageTargetId 必须全局唯一**：建议 server 生成 UUID/ULID，避免多端/多会话碰撞导致串页。
- **断线处理**：Hub 需要处理 runtime 断线时 pending `openPage` 超时失败；BrowserSessionRegistry 需要 TTL 清理。


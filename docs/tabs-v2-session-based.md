# Tabs V2（会话式标签页）方案

## 1. 目标与范围

### 1.1 目标
1) 标签页切换后，自动化任务持续运行，浏览器操作不中断。  
2) 支持 Electron 壳形态与未来 SaaS 形态的统一抽象。  
3) 标签页持久化仅保存最小必要信息，避免与 UI 组件结构耦合。  

### 1.2 范围
- 本文档定义业务概念、运行模式、模块边界、数据模型与通信协议。  
- 不依赖现有前端组件实现；允许在新路径中独立实现一套 TabsV2。  

---

## 2. 部署模式（A/B/C）与兼容要求

### 2.1 模式定义
**A：`electron + web + server(本地)`**
- Electron 作为壳，UI 为 Web（renderer）。
- `server`（AI + SSE）运行在本机。
- 自动化执行在 Electron 主进程（可使用 IPC/CDP）。

**B：`electron + web + server(云端)`**
- Electron 作为壳，UI 为 Web（renderer）。
- `server`（AI + SSE）运行在云端。
- 自动化执行仍在 Electron 主进程（可使用 IPC/CDP）。
- 云端无法直接访问本机 IPC/CDP，需要本机执行端与云端建立反向通道。

**C：`web + server(云端)`（暂不实现，需预留）**
- 纯浏览器访问（无 Electron）。
- 自动化执行在云端 Browser Worker 控制远端浏览器。
- 预览通过截图或视频流在 Web UI 中显示。

### 2.2 兼容要求
**B 必须兼容 A**：从设计开始即将 `server` 视为独立进程/独立服务，Electron 仅通过 `SERVER_URL` 访问：
- A：`SERVER_URL=http://localhost:xxxx`
- B：`SERVER_URL=https://api.yourdomain.com`

---

## 3. 核心概念与约定

### 3.1 ChatSession（对话会话）
ChatSession 表示一次 AI 对话上下文，用于归属与组织资源实例。

- `chatSessionId`：对话会话唯一标识（由 server 侧生成/管理）

### 3.2 Resource（可控制资源）
Resource 表示可被 AI 工具调用控制的“运行实体”，例如浏览器页、终端实例、程序服务实例等。

- `resourceType`：资源类型，例如 `browser`、`terminal`、`service`
- `index`：同一 `chatSessionId` 下的序号（从 0 或 1 开始，按实现约定）
- `resourceId`：资源唯一标识，采用统一命名规则：`{type}_{chatSessionId}_{index}`

约定示例：
- 浏览器页：`browser_{chatSessionId}_{index}`
- 终端：`terminal_{chatSessionId}_{index}`
- 程序服务：`service_{chatSessionId}_{index}`

Electron 侧约定：
- `WebContentsView` 标识：`browser_{chatSessionId}_{index}`
- 一个浏览器页 Resource 对应一个独立的 `WebContentsView` 与一份独立的 `webContents`
- 一个 `chatSessionId` 可对应多个浏览器页 Resource（多个 `WebContentsView`）

### 3.3 Tab（标签页）
Tab 表示一个 Resource 的 UI 入口，仅负责：
- 顺序、激活状态、标题、图标、固定等
- 绑定 `resourceId`

Tab 约定：
- `tabId` 为随机 ID（例如 UUID），不与 `chatSessionId` 或 `resourceId` 复用

Tab 不负责：
- 自动化动作执行（click/type/navigate 等）
- Resource 的生命周期（创建/销毁/连接）

### 3.4 BrowserAdapter（浏览器适配器）
BrowserAdapter 提供统一的自动化动作 API，以屏蔽不同运行形态的差异。
- Electron：`ElectronAdapter`（`webContents` + CDP/IPC）
- SaaS：`RemoteAdapter`（远端浏览器 + CDP，例如 Playwright/CDP）

### 3.5 Preview（预览）
Preview 表示用户看到的浏览器画面。
- Electron：通过 `WebContentsView` 直接渲染。
- SaaS：通过截图或视频流渲染。

---

## 4. 关键设计原则

1) Tab 仅保存 `resourceId`，不保存 UI 组件配置树。  
2) 所有自动化动作必须携带 `resourceId`，不得依赖“当前激活 tab”。  
3) 执行端常驻：自动化执行逻辑必须运行在不可随 UI 卸载的进程（Electron 主进程或云端 Worker）。  
4) 同一 `resourceId` 的动作串行执行，避免并发冲突。  

---

## 5. 数据模型（建议）

### 5.1 TabsV2（持久化模型）
```ts
export type TabV2 = {
  tabId: string;
  workspaceId: string;
  resourceId: string; // {type}_{chatSessionId}_{index}
  title?: string;
  icon?: string;
  pinned?: boolean;
  createdAt: number;
  lastActiveAt: number;
};
```

### 5.2 Electron 运行时映射
Electron 主进程维护运行时映射：
- `resourceId -> webContents`

---

## 6. 系统模块

### 6.1 通用模块（A/B/C 共用抽象）

**ResourceRegistry**
- 存储资源元数据：`resourceId -> resourceType/chatSessionId/index/adapterType/status/lastUrl/...`

**ResourceRunner**
- 接收工具动作（tool calls）
- 按 `resourceId` 串行执行
- 输出事件：日志、进度、错误、截图（可选）

**BrowserAdapter**
```ts
export interface BrowserAdapter {
  ensure(resourceId: string, options?: { url?: string }): Promise<void>;
  click(resourceId: string, args: { selector: string }): Promise<unknown>;
  type(resourceId: string, args: { selector: string; text: string }): Promise<unknown>;
  navigate(resourceId: string, args: { url: string }): Promise<unknown>;
  waitFor(resourceId: string, args: { selector: string; timeoutMs?: number }): Promise<unknown>;
  screenshot(resourceId: string): Promise<{ mime: "image/png"; dataBase64: string }>;
}
```

**Event Bus**
- 将 Runner 事件发送给 UI：`resource.log/resource.progress/resource.screenshot/resource.stateChanged`
- 传输方式：SSE / WebSocket / 轮询（按实现选择）

---

## 7. A/B 模式实现：Local Agent（本机执行端）

### 7.1 定义
Local Agent 常驻在 Electron 主进程，承担所有自动化执行职责。

### 7.2 职责
1) 维护 `ResourceRegistry` / `ResourceRunner`  
2) 维护 `resourceId -> webContents` 映射  
3) 执行来自 `server` 的工具调用并回传结果  
4) 产生并上报资源事件（可选）  

### 7.3 Server 与 Local Agent 的交互（统一 A/B）
server 侧仅面向 `resourceId` 下发指令，Local Agent 负责执行并回传结果。

**消息（建议）**
```json
{ "type":"tool.call", "id":"tc_001", "chatSessionId":"chat_123", "resourceId":"browser_chat_123_0", "tool":"browser.click", "args":{ "selector":"#login" } }
```
```json
{ "type":"tool.result", "id":"tc_001", "resourceId":"browser_chat_123_0", "ok":true, "result":{ "clicked":true } }
```
```json
{ "type":"resource.event", "resourceId":"browser_chat_123_0", "event":"log", "data":{ "message":"clicked #login" } }
```

### 7.4 连接方式
**A（本地 server）**：Local Agent 连接本地 `SERVER_URL`。  
**B（云端 server）**：Local Agent 主动建立反向通道（建议 WebSocket），server 通过该通道下发工具调用。  

---

## 8. Electron 自动化实现：Remote Debugging Port（用于调试与标准化）

### 8.1 目的
在 Electron 中启用 remote debugging port，基于标准 CDP WebSocket 完成自动化，便于调试与复用。

### 8.2 映射关系
- 一个浏览器页 Resource（`browser_{chatSessionId}_{index}`）对应一个独立 `webContents`
- 一个 `webContents` 对应一个 CDP target（可通过 `/json/list` 获取）

### 8.3 关键流程（按 `resourceId` 定位目标）
1) Local Agent 根据 `resourceId -> webContents` 确定目标实例。  
2) 通过 remote debugging port 查询 target 列表（`/json/list`）。  
3) 将目标 `webContents` 与 target 对齐，获得 `webSocketDebuggerUrl`。  
4) 连接 target WS 并执行 CDP 命令。  

目标对齐需要可判定的标识，例如：
- 在目标页面设置 `document.title` 或 URL 标记包含 `resourceId`，以便从 target 列表中匹配；或  
- 通过可稳定映射的 target 选择规则定位目标。  

---

## 9. C 模式预留：Browser Worker（云端执行端）

### 9.1 定义
Browser Worker 在云端运行，负责控制远端浏览器并向 Web UI 输出预览。

### 9.2 关键差异
- 执行端不在用户设备上，无法使用 `WebContentsView`
- 预览通过截图或视频流
- 用户交互（可选）通过坐标/事件回传到 Worker 执行

---

## 10. 标签页行为定义

### 10.1 切换 Tab
- UI：切换激活 tab
- Electron：切换 `WebContentsView` attach/detach（不影响 `ResourceRunner`）
- SaaS：切换订阅的 `resourceId` 预览流（不影响 `ResourceRunner`）

### 10.2 关闭 Tab
建议选择一种明确语义：
1) 关闭 Tab 即释放对应 Resource（释放浏览器/终端/服务资源）  
2) 关闭 Tab 仅关闭 UI，Resource 继续后台运行（任务语义）  

为简化实现，优先采用 (1)。如需支持 (2)，建议通过 pinned/keep-running 标记控制。

### 10.3 断线与恢复
- UI 重连后按 `resourceId` 重新订阅事件/预览
- 执行端（Local Agent 或 Browser Worker）继续持有资源实例与队列

---

## 11. 实施步骤（A/B 优先，C 预留）

### 11.1 第 1 阶段（A/B 基础能力）
1) 实现 Local Agent（Electron 主进程常驻）  
2) 实现 `ResourceRunner`（队列 + 串行执行）  
3) 实现 `ElectronAdapter`（remote debugging port + CDP）  
4) 实现 TabsV2 持久化（仅保存 `resourceId`）  
5) 打通 server 工具调用链路：`tool.call -> Local Agent -> tool.result`  

### 11.2 第 2 阶段（预览与可观测性）
1) Electron：激活 tab attach view，非激活 tab detach view  
2) 增加 session 事件：log/progress/error（可选截图）  

### 11.3 第 3 阶段（C 预留）
1) 定义 Worker 接口与 `RemoteAdapter` 占位实现  
2) 定义截图/流预览协议与 UI 订阅方式  

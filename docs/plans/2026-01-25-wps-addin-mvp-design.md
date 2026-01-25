# WPS 加载项 MVP 技术方案与设计文档

日期：2026-01-25

## 1. 背景与目标

背景：
- Tenas 需要在双击 doc/xls/ppt 时直接打开 WPS，并自动加载 Tenas AI 加载项。
- 通过 TaskPane 在 WPS 内展示最小信息（当前文件名 + 服务健康提示），为后续 AI 控制打底。

目标：
- 使用 publish 模式自动安装加载项，避免 oem.ini 方案限制。
- apps/web（Electron 渲染进程）负责调用 WpsInvoke 启动 WPS，并调用加载项入口函数。
- TaskPane 由 `apps/wps` 承载，固定 `http://127.0.0.1:28888/taskpane`。
- 读取 WPS 当前文档名称并展示。
- health 检测通过 `apps/server` 的 tRPC `health` 完成。

非目标：
- 不做 AI 控制能力。
- 不做多进程/多用户模式。
- 不做 Office 支持（后续阶段）。
- 不做复杂 UI，仅提示与文件名展示。

## 2. 总体架构

MVP 采用 WPS 加载项 + 本地静态服务的形态：WPS 加载项基于 Web 技术，WPS 内置 Chromium 负责加载网页并通过 JS API 与文档交互。加载项包含 `ribbon.xml` 与 `main.js`，并通过 `Application.CreateTaskPane(url)` 打开任务窗格。任务窗格页面由 `apps/wps` 提供，托管在 Electron 主进程启动的 `http://127.0.0.1:28888` 静态服务上，页面仅展示当前文件名与后端健康状态提示，不包含 AI 控制逻辑。

文件双击打开链路在 Electron 渲染进程（`apps/web`）内完成：渲染端加载 `wpsjsrpcsdk.js`，以单进程模式调用 `WpsInvoke.InvokeAsHttp` 启动 WPS，并传递加载项名称与打开文件参数；加载项负责接收参数、打开文件并展示任务窗格。加载项统一命名为 `Tenas AI`，同时支持 WPS 文字/表格/演示（`wps/et/wpp`）三类 ClientType，按文件扩展名选择对应类型。加载项采用 publish 模式部署，使用 `wpsjs publish` 生成发布包与 `publish.html`，再通过 `WpsAddonMgr.enable/verifyStatus` 自动安装与启用，确保用户后续直接打开 WPS 仍可加载该加载项。

TaskPane 页面通过 tRPC 调用 `health`（`/trpc/health`）判断 `apps/server` 是否在线，失败则提示“请先启动 Tenas”。后续扩展（AI 控制、命令执行）将基于同一 TaskPane 与服务链路扩展，不改变当前 MVP 的边界。

## 3. 关键流程

本节描述 MVP 的最小闭环流程，覆盖启动静态服务、加载项安装、启动 WPS 与任务窗格展示。

1) 静态服务启动  
Electron 主进程在首次双击文件时启动 `http://127.0.0.1:28888`，托管 `apps/wps` 产物；开发环境可用热更新服务器替代静态资源。TaskPane 页面固定地址为 `http://127.0.0.1:28888/taskpane`。

2) 加载项生成与发布  
`apps/wps` 使用 `wpsjs create` 生成项目，完成后执行 `wpsjs publish` 产出 publish 包与 `publish.html`。publish 模式会在用户机器上生成 `publish.xml`，确保后续 WPS 启动自动加载加载项。

3) 首次自动安装  
首次双击文件时由 apps/web（渲染进程）调用 `WpsAddonMgr.verifyStatus` 校验加载项配置，再调用 `WpsAddonMgr.enable` 安装/启用。安装目标包含加载项名称 `Tenas AI`、`addonType`（wps/et/wpp）与部署 URL。

4) 启动 WPS 并打开文件  
apps/web 加载 `wpsjsrpcsdk.js`，以单进程模式调用 `WpsInvoke.InvokeAsHttp` 启动 WPS，并传入加载项函数名与参数（文件绝对路径）。根据扩展名选择 `ClientType.wps/et/wpp`。

5) 加载项接收参数并创建 TaskPane  
加载项 `main.js` 接收调用参数，完成文件打开后调用 `Application.CreateTaskPane("http://127.0.0.1:28888/taskpane")` 打开任务窗格，并设置停靠与可见性。

6) 任务窗格健康检查  
TaskPane 页面请求 `apps/server` 的 `/trpc/health`，返回 `{ ok: true, timestamp }` 表示服务可用；失败则提示“请先启动 Tenas”，不自动 fallback。

### 3.1 端到端调用时序（首次双击）

1) **渲染进程发起打开请求**  
`apps/web` 监听双击文件，调用 `invokeOpenFile(filePath, serverUrl)`，其中 `filePath` 为绝对路径，`serverUrl` 为 `apps/server` 根地址（用于 TaskPane health 校验）。

2) **Electron 主进程启动 28888 服务**  
首次调用时由主进程启动 `127.0.0.1:28888` 静态服务，开发环境可用热更新服务/代理替代，保证 TaskPane URL 始终固定为 `/taskpane`。

3) **自动安装加载项（首次）**  
渲染进程调用 `WpsAddonMgr.verifyStatus(element)` 校验配置，随后 `WpsAddonMgr.enable(element)` 安装/启用加载项，不保存安装状态，按需触发。

4) **启动 WPS 并调用加载项入口**  
渲染进程调用 `WpsInvoke.InvokeAsHttp(ClientType, "Tenas AI", "openFileFromTenas", payload)`，启动对应 WPS 客户端并执行加载项入口函数。

5) **加载项入口打开文件 + 打开 TaskPane**  
加载项 `main.js` 解析参数，按扩展名选择 `Application.Documents/Workbooks/Presentations.Open(filePath)` 打开文件，随后 `Application.CreateTaskPane` 打开 `http://127.0.0.1:28888/taskpane?serverUrl=...`。

6) **TaskPane 拉起健康检测 + 文件名展示**  
TaskPane 读取当前文档名称（WPS JSAPI），同时调用 `/trpc/health`，展示“已连接/请先启动 Tenas”状态。

### 3.2 端到端调用时序（后续双击）

1) 直接调用 `WpsInvoke.InvokeAsHttp` 打开文件（可保留 `verifyStatus` 作为兜底）。  
2) 由于 publish 模式已持久化加载项，WPS 启动后自动加载 `Tenas AI`。  
3) 入口函数继续复用 `openFileFromTenas`，TaskPane 刷新当前文件名与 health 状态。

### 3.3 异常分支与提示

- **WPS 未安装/启动失败**：`InvokeAsHttp` 回调 `status != 0`，由 `apps/web` toast 提示“WPS 启动失败”。  
- **TaskPane 资源不可用**：`127.0.0.1:28888` 未启动，TaskPane 白屏或 404。  
- **后端未启动**：`/trpc/health` 失败，TaskPane 提示“请先启动 Tenas”。  
- **文件类型未知**：默认按 `wps` 处理（文档打开）。

## 4. MVP 功能与接口

MVP 功能聚焦在“加载项可安装、可启动、可展示当前文件名与服务状态”，不包含 AI 控制能力。

### 4.1 加载项命名与资源

- 加载项名称：`Tenas AI`
- 图标：`apps/wps/assets/tenas-ai.png`（狐狸图标）
- addonType：`wps` / `et` / `wpp`
- 支持的文件扩展名：
  - 文档：`wps`、`wpt`、`doc`、`docx`、`dot`、`rtf`、`xml`、`docm`、`dotm`、`wdoc`、`uof`、`uot3`、`uott3`
  - 表格：`et`、`ett`、`xls`、`xlsx`、`xlsm`、`xlsb`、`xlam`、`xltx`、`xltm`、`xlt`、`xla`、`xlw`、`odc`、`uxdc`、`dbf`、`prn`、`wxls`、`csv`
  - 演示：`dps`、`dpt`、`pptx`、`ppt`、`pptm`、`ppsx`、`pps`、`ppsm`、`potx`、`pot`、`potm`、`wpd`、`wppt`

### 4.2 wpsjs 命令与发布流程

基于 WPS 文档推荐的 wpsjs 工具链：

```bash
# 创建加载项项目
wpsjs create TenasAI

# 开发调试
wpsjs debug

# 发布（publish 模式）
wpsjs publish
```

发布后产物与路径约定：
- `wps-addon-build`：加载项构建产物
- `wps-addon-publish`：包含 `publish.html`
- `publish.xml` 默认写入路径：
  - Windows：`%appdata%/kingsoft/wps/jsaddons`
  - Linux：`~/.local/share/Kingsoft/wps/jsaddons`

### 4.3 apps/web 调用流程（示例代码）

```ts
const ADDIN_NAME = "Tenas AI";
const ADDIN_URL = "http://127.0.0.1:28888";

const DOC_EXTS = new Set([
  "wps",
  "wpt",
  "doc",
  "docx",
  "dot",
  "rtf",
  "xml",
  "docm",
  "dotm",
  "wdoc",
  "uof",
  "uot3",
  "uott3",
]);
const SHEET_EXTS = new Set([
  "et",
  "ett",
  "xls",
  "xlsx",
  "xlsm",
  "xlsb",
  "xlam",
  "xltx",
  "xltm",
  "xlt",
  "xla",
  "xlw",
  "odc",
  "uxdc",
  "dbf",
  "prn",
  "wxls",
  "csv",
]);
const PPT_EXTS = new Set([
  "dps",
  "dpt",
  "pptx",
  "ppt",
  "pptm",
  "ppsx",
  "pps",
  "ppsm",
  "potx",
  "pot",
  "potm",
  "wpd",
  "wppt",
]);

function resolveClientType(ext: string) {
  if (DOC_EXTS.has(ext)) return "wps";
  if (SHEET_EXTS.has(ext)) return "et";
  if (PPT_EXTS.has(ext)) return "wpp";
  return "wps";
}

function buildAddonElement(addonType: string) {
  return {
    name: ADDIN_NAME,
    addonType,
    online: "true",
    url: ADDIN_URL,
  };
}

function invokeOpenFile(filePath: string, serverUrl: string) {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const addonType = resolveClientType(ext);
  const element = buildAddonElement(addonType);

  WpsAddonMgr.verifyStatus(element, () => {
    WpsAddonMgr.enable(element, () => {
      const payload = { filePath, serverUrl };
      WpsInvoke.InvokeAsHttp(
        WpsInvoke.ClientType[addonType],
        ADDIN_NAME,
        "openFileFromTenas",
        JSON.stringify(payload),
        (res: { status: number; message?: string }) => {
          if (res.status !== 0) {
            toast.error(res.message ?? "WPS 启动失败");
          }
        }
      );
    });
  });
}
```

### 4.4 加载项入口函数（main.js）

```js
const TASKPANE_BASE_URL = "http://127.0.0.1:28888/taskpane";
const DOC_EXTS = new Set([
  "wps",
  "wpt",
  "doc",
  "docx",
  "dot",
  "rtf",
  "xml",
  "docm",
  "dotm",
  "wdoc",
  "uof",
  "uot3",
  "uott3",
]);
const SHEET_EXTS = new Set([
  "et",
  "ett",
  "xls",
  "xlsx",
  "xlsm",
  "xlsb",
  "xlam",
  "xltx",
  "xltm",
  "xlt",
  "xla",
  "xlw",
  "odc",
  "uxdc",
  "dbf",
  "prn",
  "wxls",
  "csv",
]);
const PPT_EXTS = new Set([
  "dps",
  "dpt",
  "pptx",
  "ppt",
  "pptm",
  "ppsx",
  "pps",
  "ppsm",
  "potx",
  "pot",
  "potm",
  "wpd",
  "wppt",
]);

function buildTaskPaneUrl(serverUrl) {
  if (!serverUrl) return TASKPANE_BASE_URL;
  const encoded = encodeURIComponent(serverUrl);
  return `${TASKPANE_BASE_URL}?serverUrl=${encoded}`;
}

function openFileFromTenas(rawParam) {
  const param = typeof rawParam === "string" ? JSON.parse(rawParam) : rawParam || {};
  const filePath = String(param.filePath || "");
  const serverUrl = String(param.serverUrl || "");

  if (!filePath) {
    return JSON.stringify({ status: 1, message: "missing filePath" });
  }

  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (DOC_EXTS.has(ext)) {
    Application.Documents.Open(filePath);
  } else if (SHEET_EXTS.has(ext)) {
    Application.Workbooks.Open(filePath);
  } else if (PPT_EXTS.has(ext)) {
    Application.Presentations.Open(filePath);
  } else {
    Application.Documents.Open(filePath);
  }

  const taskPaneUrl = buildTaskPaneUrl(serverUrl);
  const taskPane = Application.CreateTaskPane(taskPaneUrl);
  taskPane.DockPosition = Application.Enum.JSKsoEnum_msoCTPDockPositionRight;
  taskPane.Visible = true;

  return JSON.stringify({ status: 0 });
}

window.openFileFromTenas = openFileFromTenas;
```

### 4.5 TaskPane 页面（apps/wps）

```tsx
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@tenas-ai/api";

const params = new URLSearchParams(window.location.search);
const serverUrl = params.get("serverUrl") ?? "";

const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${serverUrl}/trpc`,
    }),
  ],
});

async function loadHealth() {
  try {
    return await trpc.health.query();
  } catch {
    return null;
  }
}

function resolveActiveFileName() {
  const app = window.Application ?? window.wps?.Application;
  return (
    app?.ActiveDocument?.Name ||
    app?.ActiveWorkbook?.Name ||
    app?.ActivePresentation?.Name ||
    ""
  );
}
```

### 4.6 WpsAddonMgr / WpsInvoke 指令方法

WpsAddonMgr：
- `getAllConfig(callback)`：获取 `publish.xml` 配置
- `verifyStatus(element, callback)`：校验 `ribbon.xml`
- `enable(element, callback)`：安装/启用加载项
- `disable(element, callback)`：禁用加载项

WpsInvoke（单进程模式）：
- `InvokeAsHttp(type, name, func, params, callback, showToFront, jsPluginsXml, silentMode)`
  - `type`：`WpsInvoke.ClientType.wps | et | wpp`
  - `name`：加载项名称（`Tenas AI`）
  - `func`：调用的 JS 函数名（`openFileFromTenas`）
  - `params`：JSON 字符串
  - `callback`：回调函数
  - `showToFront`：是否置前
  - `jsPluginsXml`：可选加载项列表地址
  - `silentMode`：是否静默启动

回调返回格式：
- 成功：`{ status: 0, response: "..." }`
- 失败：`{ status: 1|2|3|4, message: "..." }`

### 4.7 健康检查

复用 `packages/api/src/routers/health.ts`：

- 路径：`/trpc/health`
- 返回：`{ ok: true, timestamp }`
- apps/wps 使用 tRPC client 访问

### 4.8 关键目录与文件职责（建议）

```text
apps/wps/
  assets/tenas-ai.png              # 加载项图标（复制自 apps/web/public）
  public/publish.html              # wpsjs publish 产物
  public/publish.xml               # publish 模式安装配置（自动生成）
  public/ribbon.xml                # Ribbon 配置（可最小化）
  src/main.js                      # 加载项入口（openFileFromTenas）
  src/taskpane/App.tsx             # TaskPane 入口 UI
  src/taskpane/trpc.ts             # tRPC client 封装
  src/taskpane/wps-bridge.ts       # WPS JSAPI 封装（读取文件名）
apps/electron/src/main/
  startWpsServer.ts                # 28888 静态服务启动（函数型模块）
apps/web/src/lib/
  open-wps.ts                      # invoke + 安装逻辑（kebab-case）
apps/web/src/components/setting/
  menus/BasicSettings.tsx          # 文档打开方式设置项
```

### 4.9 publish.xml 与 ribbon.xml（示意）

> publish.xml 与 ribbon.xml 由 `wpsjs publish` 与模板生成，以下为关键字段示意，实际以 WPS 生成的文件为准。

```xml
<!-- publish.xml（示意，关键字段） -->
<jsplugins>
  <jsplugin name="Tenas AI" type="wps" online="true" url="http://127.0.0.1:28888">
    <!-- 加载项入口由 WPS publish 产物引用 -->
  </jsplugin>
</jsplugins>
```

```xml
<!-- ribbon.xml（示意，最小化） -->
<customUI>
  <ribbon>
    <tabs>
      <tab id="tenas-ai" label="Tenas AI">
        <group id="tenas-group" label="Tenas AI" />
      </tab>
    </tabs>
  </ribbon>
</customUI>
```

### 4.10 28888 静态服务（Electron 主进程）

要点：
- 单进程模式，固定端口 `127.0.0.1:28888`。
- 生产环境托管 `apps/wps` 构建产物；开发环境代理到 `apps/wps` 热更新服务。
- TaskPane 访问路径固定 `/taskpane`，开发与生产保持一致。

示意（伪代码）：

```ts
// startWpsServer.ts
// Start local static server for WPS TaskPane.
export async function startWpsServer() {
  // 中文：生产环境使用静态目录，开发环境代理到热更新服务
}
```

### 4.11 TaskPane UI 约束（最小化）

- 页面结构：标题 + 当前文件名 + health 状态。
- health 调用失败时提示“请先启动 Tenas”，不自动 fallback。
- 文件名读取优先级：`ActiveDocument.Name` -> `ActiveWorkbook.Name` -> `ActivePresentation.Name`。
- 依赖：`apps/wps` 需引入 `@trpc/client` 与 `@tenas-ai/api`，复用 `AppRouter` 类型。

### 4.12 设置项与安装检测（MVP）

- 基础设置新增“文档打开方式”：`WPS` / `Microsoft Office`（Office 先不实现）。  
- 检测本机是否安装 WPS/Office，未安装项在 UI 中灰化。  
- 双击文件默认走 WPS，若用户切换为 Office 则提示“暂未支持”。

### 4.13 `openFileFromTenas` 参数约定

```json
{
  "filePath": "C:/path/to/file.docx",
  "serverUrl": "http://127.0.0.1:3000"
}
```

返回：
- 成功：`{ "status": 0 }`
- 失败：`{ "status": 1, "message": "missing filePath" }`

## 5. 平台与版本要求

- WPS 客户端开发在 Windows/Linux/macOS/鸿蒙等平台可用。
- WPS 加载项目前主要适配 Windows/Linux（需确认 macOS 与鸿蒙的实际支持情况）。
- WPS 版本限制：自 `12.1.0.16910` 起限制 oem.ini 方式，需使用 publish 模式。
- publish 模式版本支持（文档给定）：
  - Windows：企业版 20200425 分支之后版本
  - Linux：企业版 20200530 分支之后版本

## 6. 风险与验证

风险：
- macOS/鸿蒙的 WPS 加载项支持度不明确，需验证。
- WpsInvoke 首次启动可能触发用户授权弹窗，若拒绝则调用失败。
- 本地静态服务未启动会导致 TaskPane 白屏。
- WPS 同时打开多个文件时，单进程模式只绑定当前活动窗口。

验证清单：
1) 启动 Tenas，确认 `apps/server` 与 `127.0.0.1:28888` 正常。
2) 执行 `wpsjs publish`，确保 publish 产物生成。
3) 双击 doc/xls/ppt 文件，验证加载项自动安装。
4) WPS 成功启动并打开目标文件。
5) TaskPane 能显示文件名。
6) 停止 `apps/server` 后 TaskPane 显示“请先启动 Tenas”。

## 7. 参考文档链接

- WPS 客户端开发概述：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/wps-integration-mode/wps-client-dev-introduction
- 加载项概述：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/wps-integration-mode/wps-addin-development/addin-overview
- 任务窗格概述：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/addin-api/TaskPane/task-pane-overview
- WPS 加载项开发说明：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/wps-integration-mode/wps-addin-development/wps-addin-development-instructions
- WPS 加载项集成业务系统开发：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/wps-integration-mode/wps-addin-development/wps-addin-integration-business-system-development
- WPS 加载项自定义函数（包含 wpsjs create/debug 示例）：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/wps-integration-mode/wps-addin-development/wps-addin-custome-function
- Documents.Open：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/wps/Documents/member/Open
- Workbooks.Open：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/et/Workbooks/member/Open
- Presentations.Open：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/wpp/Presentations/member/Open
- Application.ActiveDocument / Document.Name：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/wps/Application/member/ActiveDocument
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/wps/Document/member/Name
- Application.ActiveWorkbook / Workbook.Name：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/et/Application/member/ActiveWorkbook
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/et/Workbook/member/Name
- Application.ActivePresentation / Presentation.Name：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/wpp/Application/member/ActivePresentation
  https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/wpp/Presentation/member/Name
- wpsjs 工具包使用：
  https://kdocs.cn/l/cASCu9B0G
- WPS JSAPI 概览（WPS 365 Web JSAPI）：
  https://open.wps.cn/documents/app-integration-dev/wps365/client/web-jsapi/jsapiOverview

# Web Stack Desktop Widget Design

## 目标

为桌面新增网页组件，支持用户输入 URL 与名称后自动创建组件，并在桌面中展示三种形态：

- 1x1：网站 logo + 名称
- 高度为 1、宽度最大 4：左 logo、右标题，第二行简介（自动获取）
- 高度 > 1、最大 4x4：网页预览模式（自动截图）

所有图片附件保存到 `.tenas/desktop` 目录下。点击后打开网页，行为与 `OpenUrlTool.tsx` 一致。

## 设计原则

- UI 只依赖统一的元数据 payload，不感知 Electron/Server 差异。
- Electron 环境优先使用 IPC 抓取（A）；非 Electron 走 Server 抓取（B）。
- 无 project tab 时使用 workspace root 作为存储根。
- 失败时仍创建组件，允许重试抓取。

## 架构与数据流

1. 用户在组件库中选择“网页组件”。
2. 弹出输入框：URL + 自定义名称（必填 URL，名称可选）。
3. 前端调用“网页元数据服务”：
   - Electron 环境：`window.tenasElectron` 调用新 IPC（如 `tenas:web-meta:fetch`）。
   - 非 Electron 环境：调用 server API（Hono router）。
4. IPC/Server 返回统一 payload：
   - `url`
   - `title`
   - `description`
   - `logoPath`（相对路径，指向 `.tenas/desktop/<hash>/logo.png`）
   - `previewPath`（相对路径，指向 `.tenas/desktop/<hash>/preview.jpg`）
   - `siteName`
5. 前端构造 DesktopItem 并写入 `desktop.tenas`，包含以下新增字段：
   - `webUrl`
   - `webTitle`
   - `webDescription`
   - `webLogo`
   - `webPreview`
   - `webMetaStatus`（`ready`/`failed`/`loading`）
6. 点击 widget 时复用 `OpenUrlTool.tsx` 的 stack panel 打开网页。

## 组件与展示形态

### 1x1（最小）
- 展示 logo + 名称（1 行 truncate）。
- logo 缺失时显示占位图。

### 标题模式（高度=1，宽度<=4）
- 左侧 logo，右侧两行文本：
  - 第一行标题（自定义名称优先，否则 meta title）。
  - 第二行简介（meta description，无则显示域名）。
- 宽度小于 2 时降级为 logo + 简短标题。

### 预览模式（高度>1）
- 以 preview 图作为主体（16:9 裁切）。
- 下方或覆盖层显示 logo + 标题 + 简介。
- hover 时显示“打开网页”按钮。

## 存储与路径

- 存储根：
  - 有 project tab：使用 project root
  - 无 project tab：使用 workspace root
- 文件位置：`.tenas/desktop/<hash>/logo.png`、`.tenas/desktop/<hash>/preview.jpg`
- `<hash>` 为 URL hash（便于去重和缓存）。

## 错误处理

- URL 非法：阻止创建并提示。
- 抓取失败：仍创建组件，`webMetaStatus = failed`，显示占位图并提供重试。
- 资源缺失：fallback 使用 favicon URL 或默认占位图。

## 测试与验证

- 前端：三种尺寸下的渲染快照或基础渲染测试。
- Electron：IPC 抓取成功后创建组件并打开网页。
- 非 Electron：Server API 抓取成功后创建组件。
- 最后执行：`pnpm check-types`。

## 涉及的文件（预期）

- `apps/web/src/components/desktop/widgets` 新增 WebStackWidget
- `apps/web/src/components/desktop/types.ts` 增加 widgetKey 与字段
- `apps/web/src/components/desktop/DesktopWidgetLibraryPanel.tsx` 新增入口与表单
- `apps/web/src/components/desktop/DesktopEditToolbar.tsx` 支持新增 widget
- `apps/web/src/components/desktop/DesktopTileContent.tsx` 渲染逻辑
- `apps/web/src/components/desktop/desktop-persistence.ts` 持久化字段
- `apps/server/src/routers` 新增 web metadata router
- `apps/electron/src/main/ipc` 新增 IPC handler
- `apps/web/src/types/electron.d.ts` 增加 IPC 类型


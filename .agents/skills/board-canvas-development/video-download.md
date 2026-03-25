# Video Download & Clip

## 概述

视频下载（yt-dlp）和裁剪（ffmpeg）是 Board 画布中视频节点的核心后端能力。用户可以粘贴视频 URL 下载到画布，在节点上设置播放片段，并导出裁剪后的视频。

## 架构总览

```
用户粘贴 URL → BoardCanvasInteraction.insertVideoFromUrl()
  → POST /media/video-download/start（返回 taskId）
  → 创建 VideoNode（downloadTaskId + downloadUrl）
  → VideoNode 内部轮询下载进度
  → 下载完成 → 回填 sourcePath/posterPath/尺寸并清空下载任务字段
  → 服务端自动触发 HLS 预转码
```

## 关键文件

| 模块 | 文件 | 职责 |
|------|------|------|
| 前端入口 | `apps/web/src/components/board/core/BoardCanvasInteraction.tsx` | `insertVideoFromUrl()` 发起下载 |
| 前端下载服务 | `apps/web/src/components/board/services/video-download.ts` | 下载启动 / 进度查询 / 取消 |
| 前端视频节点 | `apps/web/src/components/board/nodes/VideoNode.tsx` | 下载进度轮询、播放、裁剪 UI、导出 |
| 前端裁剪控件 | `apps/web/src/components/board/nodes/VideoTrimBar.tsx` | 双滑块时间范围选择器 |
| 服务端路由 | `apps/server/src/modules/media/videoDownloadRoutes.ts` | 下载/进度/取消/导出/下载片段路由 |
| 服务端服务 | `apps/server/src/modules/media/videoDownloadService.ts` | yt-dlp 下载 + ffmpeg 海报提取 + 裁剪导出 |
| HLS 转码 | `apps/server/src/modules/media/hlsService.ts` | HLS 分段转码 + 缩略图生成 |

## 视频下载流程

### AI Tool 集成

当前仓库已提供 `video-download` AI tool，用于让 Agent 直接根据 URL 下载视频：

- 工具定义：`packages/api/src/types/tools/videoDownload.ts`
- Server tool：`apps/server/src/ai/tools/videoDownloadTool.ts`
- 注册表：`apps/server/src/ai/tools/toolRegistry.ts`

行为约定：

- 若存在 `boardId` 上下文：下载到 `.openloaf/boards/<boardId>/asset/`
- 若无 `boardId`：下载到 `.openloaf/chat-history/<sessionId>/asset/`
- 返回 `filePath`（相对路径）与 `absolutePath`，便于后续继续用 `file-info`、`video-convert` 等工具处理

说明：AI tool 复用了 `videoDownloadService.ts` 的 yt-dlp 下载任务能力，没有额外引入新的下载内核。

### 服务端 API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/media/video-download/info` | POST | 获取视频元数据（标题、时长、缩略图） |
| `/media/video-download/start` | POST | 启动下载任务，返回 taskId |
| `/media/video-download/progress` | GET | 查询下载进度（status/phase/progress） |
| `/media/video-download/cancel` | POST | 取消下载任务 |

### 下载任务状态机

```
pending → downloading → merging → completed
  ↓           ↓           ↓
failed      failed      failed
```

### 进度阶段（phase）

| phase | 说明 |
|-------|------|
| `extracting` | 解析视频信息（yt-dlp 初始化） |
| `downloading` | 下载视频/音频流 |
| `merging` | ffmpeg 合并音视频流 |
| `done` | 完成 |

### 双流进度计算

yt-dlp 的 `bestvideo+bestaudio` 模式分两次下载再合并：

```
流 0: 0-50%   （视频流下载）
流 1: 50-100% （音频流下载）
合并阶段不计百分比，显示 "合并音视频..."
```

通过 `stderr` 解析 `[download] Destination:` 检测流切换，解析 `[download] XX.X%` 获取进度。

### 下载完成后处理

1. `extractPosterAndMeta()` — ffprobe 获取尺寸 + ffmpeg 提取首帧为 JPEG base64
2. `triggerPreTranscode()` — 自动触发 HLS 720p 预转码（异步，不阻塞）

### 404 自动重启机制

当 `VideoNode` 轮询下载任务收到 404 或其他失败结果时：

1. 从 `VideoNode.downloadUrl` 中取回原始下载 URL
2. 重新发起 `POST /media/video-download/start`
3. 更新 `VideoNode.downloadTaskId`
4. 清空 `downloadError`，重置本地进度显示
5. 若用户主动取消，则直接删除当前占位 VideoNode

## 视频裁剪（Trim/Clip）

### 数据模型

`VideoNodeProps` 扩展了两个可选字段：

```ts
clipStart?: number  // 起始秒数（默认 0）
clipEnd?: number    // 结束秒数（默认 duration）
```

这两个值**不修改原始文件**，只记录播放和导出的时间范围。

### 播放时间段限制

- clipStart/clipEnd 通过 ref 持有（`clipStartRef`/`clipEndRef`），**不放入 useEffect 依赖**，避免拖滑块时重建 HLS 播放
- `MANIFEST_PARSED` 后跳转到 `clipStart`（`video.currentTime = clipStart`）
- `timeupdate` 监听到达 `clipEnd` 时触发 `handleStop()`
- `stoppedRef` 防止 timeupdate + onEnded 双重触发 handleStop

### 裁剪 UI — VideoTrimBar

双滑块时间范围选择器，在工具栏的 Trim 按钮面板中展示：

- 使用 document 级 `pointermove/pointerup` 实现可靠拖拽
- 值通过 ref 传递给 document listener，保证读到最新值
- 显示 `mm:ss` 格式时间标签 + 片段时长/总时长
- 仅在 `duration > 0` 时可用

### 工具栏按钮

| 按钮 | 图标 | 颜色 | 行为 |
|------|------|------|------|
| Play | Play | Green | 打开文件预览对话框 |
| Trim | Scissors | Amber | 展开裁剪面板（双滑块） |
| Export Clip | Download | Green | 导出裁剪片段（仅在有 clip 时显示） |
| Detail | Info | Blue | 打开检查器面板 |

### 服务端裁剪导出

| 端点 | 方法 | 功能 |
|------|------|------|
| `/media/video-clip/export` | POST | ffmpeg 裁剪视频并返回文件路径 |
| `/media/video-clip/download` | GET | 下载裁剪后的文件（限 temp 目录） |

`exportVideoClip()` 流程：

1. 先尝试 `-c copy`（流拷贝，快速但可能关键帧不精确）
2. 失败时自动回退到 `-c:v libx264 -c:a aac -preset fast`（重编码）
3. 输出到 `~/.openloaf/temp/video-clips/`
4. 文件名格式：`{原名}_clip_{startTime}-{endTime}.{ext}`

### 前端导出路径解析

```
board-relative 路径（如 asset/video.mp4）→ 原样发送 + boardId
project-scoped 路径（如 @[proj_xxx]/video.mp4）→ 提取 relativePath + projectId
```

**切勿**传 `resolveProjectRelativePath()` 的结果给服务端——它已包含 board 目录前缀，服务端会再拼一次导致双重路径。

## HLS 预转码

### 错误处理关键点

`ensureManifestTask` 和 `ensureThumbnailTask` 中 ffmpeg 错误**不能 re-throw**：

- 这些任务由 `getHlsManifest()` 启动后不 await（fire-and-forget）
- re-throw 的错误变成 unhandled promise rejection，**直接崩溃进程**
- 正确做法：catch 中 `logger.error()` 并返回空值，让后续请求重新触发

### 文件名中的特殊字符

中文文件名在 HLS 缓存路径中通过 SHA256 hash 转换，不会导致路径问题。但 ffmpeg 输出路径要注意避免系统不支持的字符。

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| `clipStart`/`clipEnd` 放入 useEffect deps | 用 ref 持有，从 deps 中移除，否则拖滑块会重建 HLS |
| timeupdate 和 onEnded 都触发 handleStop | 用 `stoppedRef` 防护，只触发一次 |
| 导出时传 resolveProjectRelativePath 结果 + boardId | 传原始路径 + boardId，服务端自己拼接 |
| pointer capture 设在 handle 上、move 监听在 track 上 | 使用 document 级 listener 或统一到同一元素 |
| ffmpeg 无 `-y` 标志重复导出 | 始终加 `-y` 允许覆盖 |
| Hono 路由用 `new Response(nodeStream)` | 用 `c.body(buffer)` 或正确转换为 Web ReadableStream |
| HLS task 的 catch 中 throw error | 不 re-throw，logger.error 后返回空值 |
| 下载失败后仍保留旧 taskId | 重试时必须写入新的 `downloadTaskId` 并清空 `downloadError` |
| 继续创建独立下载占位节点 | 直接创建 VideoNode，占位与下载进度都放在同一个节点里 |

## Debugging

1. **下载卡住**：检查 `VideoNode.downloadTaskId` 是否存在，看服务端 yt-dlp 日志
2. **下载完成但节点不出现**：检查 `result.fileName` 是否为空、`posterDataUrl` 提取是否成功
3. **HLS 播放不了**：检查服务端 ffmpeg 日志，看 `ensureHlsAssets` 是否报错
4. **裁剪滑块不动**：确认 document 级 pointermove/pointerup listener 已注册
5. **导出片段 404**：检查源文件路径解析是否正确，是否双重拼接了 boardId 前缀
6. **服务崩溃重启**：查 HLS 转码日志，确认 ensureManifestTask catch 没有 re-throw
7. **导出覆盖失败**：确认 ffmpeg 命令包含 `-y` 标志

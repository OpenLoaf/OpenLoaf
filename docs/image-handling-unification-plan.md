# 图片处理统一规范方案（前端）

## 目标

- 统一图片的预览、编辑、保存、拖拽与地址转换规则，减少重复实现与历史逻辑冲突。
- 明确组件职责边界，所有图片流程走同一套工具函数与协议。
- 保障三类拖拽路径可用：
  - 外部程序 -> ChatInput（OS 文件拖拽）
  - Chat -> ChatInput（复用附件）
  - Chat -> 项目视图（FileSystemGrid / Board 等）

## 范围

- 组件：`MessageAi` / `MessageFile` / `MessageHuman` / `ChatInput` / `ChatImageAttachments` / `ImageViewer` / `ChatProvider`
- 拖拽目标：`FileSystemGrid` / `BoardCanvas`
- 协议：相对路径、`data:`、`blob:`、`http(s)`、`file://`

## 现存问题汇总（必须解决）

- 预览/读取逻辑重复：`getPreviewEndpoint`、`fetchBlobFromUri`、`loadImageFromUri` 在多处实现。
- 弹窗尺寸计算重复：`MessageFile` 与 `ChatImageAttachments` 各自实现。
- mask 关联依赖文件名推断，命名不一致时会失配。
- 拖拽协议不统一：部分组件只识别 `Files`，部分只识别自定义 MIME。
- 能力判断散落（`image_edit` / `image_generation`），后续能力枚举替换难度高。

## 统一概念（数据模型）

- **ImageRef**
  - `originUri`：原始输入地址（相对路径 / data / blob / http / file）
  - `previewUrl`：可直接用于 `<img>` 的地址（data/blob/objectUrl）
  - `fetchUrl`：可用于 `fetch()` 的地址（相对路径 -> preview endpoint）
  - `fileName`：用于下载/保存/拖拽的文件名
  - `mediaType`：真实或推断出的媒体类型

- **MaskRef**
  - `maskUri`：与 `ImageRef` 同协议规则
  - `maskFileName`：统一为 `{base}_mask.png`

- **ChatAttachment**
  - `file` + `objectUrl` + `remoteUrl` + `status`
  - `mask`（可选）：同结构
  - `hasMask`：前端 UI 标识

## 统一协议与规则

### 1) 地址规范

- 相对路径：必须通过 `/chat/attachments/preview?path=` 转换为 `blob` 再展示。
- **data:** / **blob:**：可直接展示，无需二次转换。
- **http(s):**：默认直接展示；若跨域失败，需要后端代理（后续扩展）。
- **file://**：仅 Electron 环境可展示；Web 直接报错提示。

### 2) mask 规范

- 前端编辑产物统一命名：`{base}_mask.png`。
- message parts 里 **必须带 `purpose:"mask"`**。
- 不允许依赖“随机文件名”推断 mask；应保持 `base + _mask` 的稳定约定。

### 3) 拖拽协议

统一自定义 MIME（内部拖拽）：

- `application/x-teatime-file-uri`
- `application/x-teatime-file-name`
- `application/x-teatime-file-mask-uri`（可选）

统一拖拽写入方法：

- `setImageDragPayload(dataTransfer, { baseUri, fileName, maskUri })`
- 同步写入 `text/plain` 与 `text/uri-list`（外部目标兼容）

统一拖拽读取方法：

- `readImageDragPayload(dataTransfer)` → `{ baseUri, fileName, maskUri }`

外部 OS 拖拽：

- 统一使用 `event.dataTransfer.files` 走上传流程。

## 组件职责划分（明确边界）

- `MessageFile`（AI 消息）
  - 展示 + 预览
  - 仅负责触发拖拽协议
  - 不再自建 preview/读取逻辑

- `MessageHuman`（用户消息）
  - 展示 + mask 叠加
  - 仅负责触发拖拽协议
  - mask 关联只按标准命名

- `ChatInput`
  - 只处理“附件状态 + 拖拽接收 + 发送”
  - 统一读取 `readImageDragPayload`
  - 生成 `parts` 时添加 `purpose:"mask"`

- `ChatImageAttachments`
  - 只展示附件列表与预览入口
  - 预览统一走 `ImageViewer`

- `ImageViewer`
  - 统一编辑/预览/保存
  - 只返回 `MaskedAttachmentInput`

- `ChatProvider`
  - 只负责上下文与 API 调用，不做图片逻辑

- `FileSystemGrid` / `BoardCanvas`
  - 统一消费 `readImageDragPayload`（支持来自 Chat 的拖拽）
  - 保持 OS 文件拖拽逻辑不变

## 工具模块设计（统一入口）

建议新增（或合并）如下模块，所有组件只调用这些工具：

- `apps/web/src/lib/image/uri.ts`
  - `getPreviewEndpoint(uri)`
  - `fetchBlobFromUri(uri)`
  - `loadImageFromUri(uri)`
  - `resolveFileName(uri, mediaType?)`
  - `resolveBaseName(fileName)`

- `apps/web/src/lib/image/mask.ts`
  - `buildMaskedPreviewUrl(baseBlob, maskBlob)`
  - `resolveMaskFileName(baseFileName)` -> `{base}_mask.png`

- `apps/web/src/lib/image/drag.ts`
  - `setImageDragPayload(dataTransfer, payload)`
  - `readImageDragPayload(dataTransfer)`

## 关键流程（统一版）

### A) 外部程序拖拽到 ChatInput

```text
OS Drag (Files)
  -> ChatInput.onDrop
  -> addAttachments(File[])
  -> /chat/attachments upload
  -> remoteUrl = 相对路径
  -> sendMessage(parts: file + text)
```

### B) Message(AI/Human) 拖拽到 ChatInput

```text
MessageFile/MessageHuman
  -> setImageDragPayload (相对路径 + mask)

ChatInput.onDrop
  -> readImageDragPayload
  -> fetchBlobFromUri
  -> buildMaskedPreviewUrl (可选)
  -> addMaskedAttachment / addAttachments
```

### C) Message 拖拽到 FileSystemGrid / Board

```text
MessageFile/MessageHuman
  -> setImageDragPayload (相对路径 + mask)

FileSystemGrid / Board
  -> readImageDragPayload
  -> fetchBlobFromUri
  -> 保存到项目 / 创建图片节点
```

### D) ImageViewer 编辑后回到 ChatInput

```text
ImageViewer (涂抹编辑)
  -> 生成 {base}_mask.png
  -> buildMaskedPreviewUrl (用于列表展示)
  -> addMaskedAttachment
  -> ChatInput 发送时带 purpose:"mask"
```

## 能力判断统一（为后续模型标签迁移做准备）

统一提供能力判断 helper：

- `supportsTextGeneration`
- `supportsImageGeneration`
- `supportsImageEdit`
- `supportsImageInput`
- `supportsVideoGeneration`
- `supportsToolCall`
- `supportsCode`
- `supportsWebSearch`
- `supportsSpeechGeneration`

所有 UI 与校验逻辑只调用该 helper，避免散落硬编码标签。

## 阶段划分与详细改造内容

### 阶段 1：工具层统一（基础清理）

- 新增 `apps/web/src/lib/image/uri.ts`
  - `getPreviewEndpoint(uri)`
  - `fetchBlobFromUri(uri)`
  - `loadImageFromUri(uri)`
  - `resolveFileName(uri, mediaType?)`
  - `resolveBaseName(fileName)`
- 新增 `apps/web/src/lib/image/mask.ts`
  - `buildMaskedPreviewUrl(baseBlob, maskBlob)`
  - `resolveMaskFileName(baseFileName)` → `{base}_mask.png`
- 新增 `apps/web/src/lib/image/drag.ts`
  - `setImageDragPayload(dataTransfer, payload)`
  - `readImageDragPayload(dataTransfer)`
- 替换重复实现：
  - `MessageFile`：移除本地 preview/filename 逻辑
  - `MessageHuman`：移除本地 preview/filename 逻辑
  - `ChatInput`：移除 `getPreviewEndpoint` / `fetchBlobFromUri` / `buildMaskedPreviewUrl`
  - `ImageViewer`：移除本地 `fetchBlobFromUri` / `loadImageFromUri`
  - `ChatImageAttachments`：移除 `getDialogSize`，统一复用 `MessageFile` 计算逻辑

### 阶段 2：拖拽协议统一（跨区域可用）

- 统一拖拽写入：
  - `MessageFile` / `MessageHuman` / `FileSystemGrid` 全部改为 `setImageDragPayload`
- 统一拖拽读取：
  - `ChatInput` 使用 `readImageDragPayload` 处理内部拖拽
  - `FileSystemGrid` 的 `onEntryDrop` 增加读取逻辑（支持从 Chat 拖入）
  - `BoardCanvas` 增加 `readImageDragPayload` 分支（支持从 Chat 拖入）
- 保持 OS 文件拖拽路径不变，仅新增自定义 MIME 分支

### 阶段 3：mask 关联与展示统一（命名与叠加）

- 强制 mask 命名 `{base}_mask.png`
  - `Chat` 侧上传 mask 前统一改名
  - `ImageViewer` 生成 mask 固定命名
- `MessageHuman` 只按 `{base}_mask.png` 规则匹配 mask
- 统一叠加逻辑（工具方法），避免每处手写叠加代码

### 阶段 4：能力判断集中（标签迁移准备）

- 新增 `supports*` 能力判断 helper
- 替换以下位置的分散判断：
  - `ChatInput`（发送前能力校验）
  - `Chat`（拖拽/附件允许性）
  - `ImageViewer`（进入涂抹编辑前校验）
  - `ChatImageOutputOption`（显示/隐藏）

### 阶段 5：收尾与清理

- 移除废弃 helper / 旧逻辑
- 删除重复的 preview / drag / mask 相关工具函数
- 调整文档与注释，确保流程一致

## 迁移步骤（MVP）

1. 阶段 1 完成后执行一次全局替换与编译，确认无重复实现残留。
2. 阶段 2 完成后验证拖拽链路（Chat -> ChatInput / Chat -> FileSystem / Chat -> Board）。
3. 阶段 3 完成后验证 mask 关联与预览叠加一致性。
4. 阶段 4 完成后替换所有能力判断分支。
5. 阶段 5 做清理与回归。

## 验证清单

- 外部图片拖拽进入 ChatInput 正常上传
- MessageAi 图片拖拽到 ChatInput 可复用附件
- MessageHuman（含 mask）拖拽到 ChatInput，附件列表显示“已调整”
- Message 图片拖拽到 FileSystemGrid 可落盘
- Message 图片拖拽到 Board 可生成图片节点
- ImageViewer 修改后可重新进入编辑，mask 叠加显示一致
- ChatInput 发送携带 `purpose:"mask"` 的 parts

## 说明

该方案只规范前端流程，不改变后端相对路径流程与 S3 上传逻辑；后端 mask 转换（`_alpha.png` / `_grey.png`）仍在服务端文档中执行。

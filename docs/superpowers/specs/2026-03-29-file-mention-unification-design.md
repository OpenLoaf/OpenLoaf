# 文件 Mention 系统统一重构

> Date: 2026-03-29
> Status: Approved

## 问题总结

文件 mention (`@{path}`) 在输入→发送→显示→交互的全链路中存在三个 bug 和一个架构问题：

1. **路径计算错误**：项目/画布 chat 中上传文件后，`uploadGenericFile` 用 `path.relative` 产出 `../chat-history/...` 路径，服务端 `hasParentTraversal` 拒绝解析
2. **MIME 类型缺失**：前端只对图片推断 MIME，PDF 等文档 fallback 为 `application/octet-stream`
3. **点击失效**：路径含 `../` 导致 `parseMentionFileRef` 解析失败，文件预览无法打开
4. **架构问题**：`MessageHumanTextPart` 有两条独立渲染分支（`MessageFile` 卡片 vs `ChatMessageText` chip），样式和交互不一致

## 设计决策

- 所有文件引用在 human message 中统一渲染为**蓝色内联 chip**（与输入框一致）
- 单图片文件引用也渲染为 chip（不再显示缩略图卡片）——简化换一致性
- 路径格式统一为**项目相对路径**（从项目根算起，不含 `../`）
- MIME 推断只覆盖**常见文档类型**（PDF、Office、文本）
- `MessageFile` 组件保留，仅用于 AI 工具输出的独立文件展示

## 实施计划

### Step 1：修复路径计算（后端）

**根因**：`uploadGenericFile` 用 `getProjectRootPath(projectId) || getResolvedTempStorageDir()` 作为 `path.relative` 的 base，但实际文件存储位置由 `resolveSessionFilesDir` 决定（有 fallback 机制：project root → temp → legacy）。两者的 root 可能不匹配。画布 chat 也有同样问题——文件存在 board 目录树下，但 root 用了 project root。

**方案**：复用 `resolveChatAttachmentRoot`（`attachmentResolver.ts` 中已有的正确实现），它返回 `{ rootPath, chatHistoryDir }` 作为配对，保证 root 和目录同源。

**文件**：`apps/server/src/ai/interface/controllers/ChatAttachmentController.ts`

- `uploadGenericFile` 中用 `resolveChatAttachmentRoot({ projectId })` 获取 rootPath，替代 `getProjectRootPath(projectId) || getResolvedTempStorageDir()`
- `path.relative(root.rootPath, destPath)` 保证不含 `../`
- 同时覆盖项目 chat 和画布 chat 场景

### Step 2：统一 MIME 推断（前端）

**文件**：`apps/web/src/lib/format-utils.ts`（已存在）

- 新增 `resolveMediaTypeFromPath(filePath: string): string` 函数
- 覆盖映射：pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv, json, md, png, jpg, jpeg, webp, gif, svg
- 未知扩展名 fallback 为 `application/octet-stream`

**文件**：`apps/web/src/components/ai/message/MessageHuman.tsx`

- 删除 `resolveImageMediaType` 函数，改用 `resolveMediaTypeFromPath`

**文件**：`apps/web/src/components/ai/message/tools/MessageFile.tsx`

- `attachmentMediaType` 的 fallback 从硬编码 `"application/octet-stream"` 改为 `resolveMediaTypeFromPath(url)`

### Step 3：统一渲染管线（前端）

**文件**：`apps/web/src/components/ai/message/MessageHuman.tsx`

- 简化 `MessageHumanTextPart`：删除 `parseSingleFileToken` / `fileEntry` state / `trpc.fs.stat` 异步查询逻辑
- 直接 `return <ChatMessageText value={text} className={className} projectId={projectId} />`
- 删除 `parseSingleFileToken` 函数
- 删除 `resolveImageMediaType` 函数
- 删除 `FileTokenMatch` 类型
- 删除 `MessageFile` 的 import（此文件不再使用）
- 清理不再需要的 import：`queryClient`, `trpc`（如果仅此处使用）, `IMAGE_EXTS`, `buildUriFromRoot`（如果仅此处使用）

**注意**：单图片文件引用从缩略图卡片变为内联 chip，这是有意的简化——一致性优先于缩略图预览。图片附件（image parts）仍然有缩略图展示，不受影响。

**文件**：`apps/web/src/components/ai/message/ChatMessageText.tsx`

- chip 样式已使用蓝色配色（`--ol-blue-bg` / `--ol-blue`）和 `rounded`（4px）— 已修复
- `data-openloaf-mention="true"` 和 `data-mention-value` 属性已正确设置

### Step 4：修复点击交互（前端）

**文件**：`apps/web/src/lib/chat/mention-pointer.ts`

- 在 `parseMentionFileRef` 中、`parseScopedProjectPath` 返回后，对 `relativePath` 做历史数据兼容 normalize：
  - 如果 `relativePath` 以一个或多个 `../` 开头且包含 `chat-history/`
  - 用正则 `/^(?:\.\.\/)+/` 剥离所有 `../` 前缀
  - 检查剩余部分是否以 `chat-history/` 开头，如果是则前缀 `.openloaf/`
  - 例：`../chat-history/abc/asset/file.pdf` → `.openloaf/chat-history/abc/asset/file.pdf`
  - 例：`../../chat-history/abc/asset/file.pdf` → `.openloaf/chat-history/abc/asset/file.pdf`

### Step 5：验证

- 项目 chat 中上传 PDF，确认路径为 `.openloaf/chat-history/...` 格式
- 画布 chat 中上传文件，确认路径正确（不含 `../`）
- human message 中 PDF mention 显示为蓝色 chip + 正确文件名
- 点击 chip 能打开文件预览
- AI 工具输出的文件（如 PdfQuery 结果）仍正常使用 `MessageFile` 渲染
- 临时 chat（无 projectId）上传文件仍正常工作
- 历史消息中 `../chat-history/...` 路径的 mention 可点击打开

## 不在范围内

- 不改动 message parts 数据格式（`@{...}` 纯文本 token 保持不变）
- 不改动技能 chip（`/skill/[...]`）的渲染
- 不改动 AI 工具输出的 `MessageFile` 组件本身的渲染逻辑
- 不改动后端 preview 接口的逻辑
- 不引入新的路径协议（如 `chat:` 前缀）

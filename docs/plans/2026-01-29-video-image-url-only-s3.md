# Video image_url_only S3 Upload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 当视频模型启用 `image_url_only` feature 时，服务端自动把非公网图片转换为 S3 公网 URL，再发给 provider。

**Architecture:** 在 `AiRouterImpl.videoGenerate` 中新增“图片规范化 + S3 上传”步骤，仅对 `image_url_only` 生效。复用现有 S3 存储服务（`resolveActiveS3Storage` + `putObject`），并参考 `imageEditNormalizer` 的输入解析/命名逻辑。上传路径使用新前缀 `ai-temp/video/{sessionId}/...`。

**Tech Stack:** TypeScript、Hono/tRPC、S3 storage service。

### Task 1: 新增服务端图片规范化与 S3 上传工具

**Files:**
- Modify: `apps/server/src/routers/ai.ts`
- Modify: `apps/server/src/ai/services/image/imageStorage.ts`

**Step 1: Write the failing test**
新增单测：输入本地相对路径图片，在 `image_url_only` 模式下被转换为公网 URL。

**Step 2: Run test to verify it fails**
Run: `pnpm -C apps/server test`
Expected: FAIL（功能尚未实现）。

**Step 3: Write minimal implementation**
在 `imageStorage.ts` 新增工具函数：
- `resolveImageInputBuffer`：支持 URL / data URL / 本地相对路径转 Buffer + mediaType + baseName。
- `uploadImagesToS3`：使用 `resolveActiveS3Storage()`；若为空抛错；构造 key `ai-temp/video/{sessionId}/{fileName}`；上传并返回公网 URL 列表。

在 `ai.ts` 的 `videoGenerate` 中，当 feature 包含 `image_url_only` 时：
- 解析 `imageUrls` 与 `binaryDataBase64` 为 Buffer 列表
- 调用 `uploadImagesToS3`
- 用返回的公网 URL 作为 `imageUrls` 发送
- 清空 `binaryDataBase64`

**Step 4: Run test to verify it passes**
Run: `pnpm -C apps/server test`
Expected: PASS。

**Step 5: Commit**
```bash
git add apps/server/src/routers/ai.ts apps/server/src/ai/services/image/imageStorage.ts
git commit -m "feat: auto upload video images to s3"
```

### Task 2: videoGenerate 兼容 image_url_only 的错误提示

**Files:**
- Modify: `apps/web/src/components/board/nodes/VideoGenerateNode.tsx`

**Step 1: Write the failing test**
新增 UI 测试：`image_url_only` 模式下允许本地图片输入但服务端失败会提示 S3 配置错误。

**Step 2: Run test to verify it fails**
Run: `pnpm -C apps/web test`
Expected: FAIL。

**Step 3: Write minimal implementation**
- 前端不再拒绝非公网 URL（交给服务端上传）。
- 仅保留“过多图片”与必填参数提示。

**Step 4: Run test to verify it passes**
Run: `pnpm -C apps/web test`
Expected: PASS。

**Step 5: Commit**
```bash
git add apps/web/src/components/board/nodes/VideoGenerateNode.tsx
git commit -m "feat: allow local images for image_url_only"
```

---

Plan complete and saved to `docs/plans/2026-01-29-video-image-url-only-s3.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?

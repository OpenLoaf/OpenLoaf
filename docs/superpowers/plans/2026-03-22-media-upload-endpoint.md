# 媒体上传端点 + V3 Generate 透传重构

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建 `/ai/media/upload` 端点，前端上传所有媒体获取公网 URL 后再调 v3 generate，server 只做透传不解析 variant 参数结构。

**Architecture:** 前端在调用 v3 generate 前，先将所有本地媒体（board path / blob / data URL）通过 `/ai/media/upload` 上传获取公网 URL。server 的 upload 端点复用现有 `uploadOrInlineBuffer` 三级策略（S3→SDK→base64）。`submitV3GenerateProxy` 中的 `resolvePayloadMediaInputs` 移除，server 只做 context 分离 + 透传。

**Tech Stack:** TypeScript, Hono, boardPaths.ts, S3/SaaS SDK

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| Modify | `apps/server/src/ai/interface/routes/saasMediaRoutes.ts` | 新增 `POST /ai/media/upload` 路由 |
| Modify | `apps/server/src/modules/saas/modules/media/mediaProxy.ts` | 导出 `uploadOrInlineBuffer`，简化 `submitV3GenerateProxy`（移除 `resolvePayloadMediaInputs`） |
| Create | `apps/web/src/lib/media-upload.ts` | 前端 `uploadMediaToPublicUrl(input)` — 统一上传接口 |
| Modify | `apps/web/src/components/board/panels/ImageAiPanel.tsx` | generate 前批量上传所有媒体 |
| Modify | `apps/web/src/components/board/panels/VideoAiPanel.tsx` | 同上 |
| Modify | `apps/web/src/components/board/panels/AudioAiPanel.tsx` | 同上（如果有媒体输入） |
| Modify | `apps/web/src/components/board/panels/variants/shared/index.ts` | `toMediaInput` 改为返回原始值不包装，上传由 panel 层统一处理 |

---

### Task 1: 后端 — 新建 `/ai/media/upload` 端点

**Files:**
- Modify: `apps/server/src/modules/saas/modules/media/mediaProxy.ts` — 导出 `uploadOrInlineBuffer`
- Modify: `apps/server/src/ai/interface/routes/saasMediaRoutes.ts` — 新增路由

**核心逻辑:** 接受两种输入：
1. `{ path: "asset/xxx.jpg", boardId: "board_xxx" }` — 从磁盘读文件上传
2. multipart `file` — 直接上传 blob

返回 `{ url: "https://..." }` 或 `{ base64: "...", mediaType: "..." }`

- [ ] **Step 1: 导出 `uploadOrInlineBuffer`**

在 `mediaProxy.ts` 中把 `uploadOrInlineBuffer` 从 module-private 改为 `export`。

- [ ] **Step 2: 新增路由处理函数**

在 `saasMediaRoutes.ts` 中新增：

```typescript
app.post("/ai/media/upload", async (c) => {
  return handleSaasMediaRoute(c, async (accessToken) => {
    const contentType = c.req.header("content-type") || "";

    // JSON body: { path, boardId, projectId }
    if (contentType.includes("application/json")) {
      const body = await c.req.json();
      const inputPath = body.path?.trim();
      const boardId = body.boardId?.trim();
      if (!inputPath || !boardId) {
        return { success: false, message: "path and boardId are required" };
      }
      const boardResult = await resolveBoardDirFromDb(boardId);
      if (!boardResult) {
        return { success: false, message: "Board not found" };
      }
      const absPath = path.resolve(boardResult.absDir, inputPath);
      if (!absPath.startsWith(path.resolve(boardResult.absDir) + path.sep)) {
        return { success: false, message: "Invalid file path" };
      }
      const buffer = await fsPromises.readFile(absPath);
      const ext = path.extname(absPath).toLowerCase();
      const mediaType = MEDIA_TYPE_MAP[ext] || "application/octet-stream";
      const result = await uploadOrInlineBuffer(
        Buffer.from(buffer), path.basename(absPath), mediaType, {}, accessToken
      );
      return { success: true, data: result };
    }

    // Multipart: file upload
    const formData = await c.req.parseBody();
    const file = formData.file;
    if (!file || typeof file === "string") {
      return { success: false, message: "file is required" };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const mediaType = file.type || "application/octet-stream";
    const result = await uploadOrInlineBuffer(
      buffer, file.name || "upload", mediaType, {}, accessToken
    );
    return { success: true, data: result };
  });
});
```

- [ ] **Step 3: 添加 import**

```typescript
import { resolveBoardDirFromDb } from "@openloaf/api/common/boardPaths";
import { uploadOrInlineBuffer, MEDIA_TYPE_MAP } from "@/modules/saas/modules/media/mediaProxy";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
```

- [ ] **Step 4: 类型检查**

Run: `pnpm -w exec tsc -p apps/server/tsconfig.json --noEmit`

- [ ] **Step 5: Commit**

```
feat(media): add /ai/media/upload endpoint for frontend media uploads
```

---

### Task 2: 前端 — 创建 `uploadMediaToPublicUrl`

**Files:**
- Create: `apps/web/src/lib/media-upload.ts`

**核心逻辑:** 统一的前端媒体上传函数，接受 board path、data URL、blob，返回公网 URL。

- [ ] **Step 1: 创建 `media-upload.ts`**

```typescript
import { resolveServerUrl } from "@/utils/server-url";
import { buildAuthHeaders } from "@/lib/saas-media"; // 或从 saas-auth 导入

export type MediaUploadInput =
  | { path: string; boardId: string }   // board-relative path
  | { dataUrl: string }                  // data URL (base64)
  | { blob: Blob; fileName?: string }    // raw blob

export type MediaUploadResult =
  | { url: string }
  | { base64: string; mediaType: string }

/**
 * 上传媒体到公网可访问的位置（S3/CDN），返回 URL。
 * 前端在调用 v3 generate 前应先上传所有本地媒体。
 */
export async function uploadMediaToPublicUrl(
  input: MediaUploadInput,
): Promise<MediaUploadResult> {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();

  if ("path" in input) {
    // Board-relative path → JSON body
    const res = await fetch(`${base}/ai/media/upload`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ path: input.path, boardId: input.boardId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Upload failed");
    return json.data;
  }

  if ("dataUrl" in input) {
    // data URL → convert to blob → upload
    const res = await fetch(input.dataUrl);
    const blob = await res.blob();
    return uploadBlob(blob, "upload", base, authHeaders);
  }

  // Blob → multipart upload
  return uploadBlob(input.blob, input.fileName || "upload", base, authHeaders);
}

async function uploadBlob(
  blob: Blob,
  fileName: string,
  base: string,
  authHeaders: Record<string, string>,
): Promise<MediaUploadResult> {
  const formData = new FormData();
  formData.append("file", blob, fileName);
  const res = await fetch(`${base}/ai/media/upload`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders,
    body: formData,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "Upload failed");
  return json.data;
}

/** 判断是否已经是公网可访问的 URL */
export function isPublicUrl(value: string): boolean {
  return (
    value.startsWith("https://") ||
    (value.startsWith("http://") &&
      !value.includes("127.0.0.1") &&
      !value.includes("localhost") &&
      !value.includes("0.0.0.0"))
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec tsc -p apps/web/tsconfig.json --noEmit`

- [ ] **Step 3: Commit**

```
feat(web): add uploadMediaToPublicUrl for frontend media uploads
```

---

### Task 3: 前端 — Panel 层在 generate 前批量上传媒体

**Files:**
- Modify: `apps/web/src/components/board/panels/ImageAiPanel.tsx`
- Modify: `apps/web/src/components/board/panels/VideoAiPanel.tsx`

**核心逻辑:** `buildParams` 在返回之前，遍历 `inputs` 中所有媒体字段，将 `{ path }` 和 `{ base64/dataUrl }` 全部上传为 `{ url }`。这样发给 server 的 payload 全是公网 URL，server 无需解析。

- [ ] **Step 1: 创建通用的 `resolveMediaInputs` 函数**

在 `apps/web/src/lib/media-upload.ts` 中新增：

```typescript
/**
 * 遍历 inputs 对象，将所有媒体字段上传为公网 URL。
 * 支持单个对象 { path/url/base64 } 和数组 [{ path/url/base64 }]。
 */
export async function resolveAllMediaInputs(
  inputs: Record<string, unknown>,
  boardId?: string,
): Promise<Record<string, unknown>> {
  const result = { ...inputs };
  for (const [key, value] of Object.entries(result)) {
    if (isMediaInput(value)) {
      result[key] = await resolveOneMediaInput(value, boardId);
    } else if (Array.isArray(value)) {
      result[key] = await Promise.all(
        value.map((item) =>
          isMediaInput(item) ? resolveOneMediaInput(item, boardId) : item
        ),
      );
    }
  }
  return result;
}

function isMediaInput(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.path === "string" || typeof rec.url === "string" || typeof rec.base64 === "string";
}

async function resolveOneMediaInput(
  input: Record<string, unknown>,
  boardId?: string,
): Promise<Record<string, unknown>> {
  // Already a public URL → pass through
  if (typeof input.url === "string" && isPublicUrl(input.url)) {
    return input;
  }
  // Board-relative path → upload
  if (typeof input.path === "string" && boardId) {
    const result = await uploadMediaToPublicUrl({ path: input.path, boardId });
    return "url" in result ? { url: result.url } : result;
  }
  // data URL → upload
  if (typeof input.url === "string" && input.url.startsWith("data:")) {
    const result = await uploadMediaToPublicUrl({ dataUrl: input.url });
    return "url" in result ? { url: result.url } : result;
  }
  // base64 field → upload
  if (typeof input.base64 === "string" && typeof input.mediaType === "string") {
    const dataUrl = `data:${input.mediaType};base64,${input.base64}`;
    const result = await uploadMediaToPublicUrl({ dataUrl });
    return "url" in result ? { url: result.url } : result;
  }
  return input;
}
```

- [ ] **Step 2: ImageAiPanel — buildParams 中上传所有媒体**

```typescript
// 在 buildParams 的 return 之前：
const resolvedInputs = await resolveAllMediaInputs(inputs, boardId);
// 用 resolvedInputs 替换 inputs
```

同时把之前的 mask 特殊处理简化 — mask 也走通用上传流程。

- [ ] **Step 3: VideoAiPanel — 同样处理**

- [ ] **Step 4: 类型检查**

- [ ] **Step 5: Commit**

```
feat(board): panels upload all media before v3 generate submission
```

---

### Task 4: 后端 — 简化 `submitV3GenerateProxy` 移除字段解析

**Files:**
- Modify: `apps/server/src/modules/saas/modules/media/mediaProxy.ts`

**核心逻辑:** 前端现在负责上传所有媒体，server 不再需要遍历 variant 参数结构。

- [ ] **Step 1: 简化 `submitV3GenerateProxy`**

```typescript
export async function submitV3GenerateProxy(
  body: unknown,
  accessToken: string,
): Promise<unknown> {
  const { payload, context } = splitMediaSubmitBody(body);
  if (!payload || typeof payload !== "object") {
    throw new MediaProxyHttpError(400, "invalid_payload", "请求参数无效");
  }

  // 直接透传，不再解析 variant 字段
  const result = await submitV3Generate(payload, accessToken);

  if (result?.success === true && result.data?.taskId) {
    const feature = (payload as Record<string, unknown>).feature as string | undefined;
    rememberMediaTask({
      taskId: result.data.taskId,
      feature: feature ?? undefined,
      resultType: feature ? inferResultType(feature) : undefined,
      projectId: context.projectId,
      saveDir: context.saveDir,
      sourceNodeId: context.sourceNodeId,
      createdAt: Date.now(),
    });
  }

  return result;
}
```

- [ ] **Step 2: 标记 `resolvePayloadMediaInputs` 为 deprecated**

加注释标记 deprecated，暂不删除（防止有其他调用路径）。

- [ ] **Step 3: 类型检查**

- [ ] **Step 4: Commit**

```
refactor(media): simplify v3 generate proxy, remove server-side variant field parsing
```

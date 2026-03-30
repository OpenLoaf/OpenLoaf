# File Mention Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify file mention rendering, fix path calculation bugs, and align input/display chip styles.

**Architecture:** Fix backend path calculation by reusing `resolveChatAttachmentRoot`, simplify frontend by removing the dual-rendering pipeline in `MessageHumanTextPart`, add MIME inference utility, and add historical path normalization for click handling.

**Tech Stack:** TypeScript, Hono server, React, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-29-file-mention-unification-design.md`

---

### Task 1: Export `resolveChatAttachmentRoot` and fix `uploadGenericFile` path calculation

**Files:**
- Modify: `apps/server/src/ai/services/image/attachmentResolver.ts:340` — export the function
- Modify: `apps/server/src/ai/interface/controllers/ChatAttachmentController.ts:282-332` — fix path calculation

- [ ] **Step 1: Export `resolveChatAttachmentRoot`**

In `apps/server/src/ai/services/image/attachmentResolver.ts`, line 340, change from private to exported:

```typescript
// Before:
async function resolveChatAttachmentRoot(input: {

// After:
export async function resolveChatAttachmentRoot(input: {
```

- [ ] **Step 2: Fix `uploadGenericFile` to use `resolveChatAttachmentRoot`**

In `apps/server/src/ai/interface/controllers/ChatAttachmentController.ts`, replace lines 317-321:

```typescript
// Before:
      const scopeRootPath = projectId ? getProjectRootPath(projectId) : null;
      // 临时会话（无 projectId）的文件存储在 tempDir 下，必须用 tempDir 作为相对根，
      // 否则 path.relative 产出含 ".." 的路径，normalizeGlobalScopedPath 会拒绝。
      const rootPath = scopeRootPath || getResolvedTempStorageDir();
      const relativePath = path.relative(rootPath, destPath).split(path.sep).join("/");

// After:
      const root = await resolveChatAttachmentRoot({ projectId: projectId ?? undefined });
      const rootPath = root?.rootPath ?? getResolvedTempStorageDir();
      const relativePath = path.relative(rootPath, destPath).split(path.sep).join("/");
```

- [ ] **Step 3: Update imports in ChatAttachmentController**

In `apps/server/src/ai/interface/controllers/ChatAttachmentController.ts`, update the import block:

```typescript
// Before:
import {
  getFilePreview,
  saveChatImageAttachment,
  saveChatImageAttachmentFromPath,
} from "@/ai/services/image/attachmentResolver";
import { getProjectRootPath } from "@openloaf/api/services/vfsService";
import { getOpenLoafRootDir } from "@openloaf/config";
import { getResolvedTempStorageDir } from "@openloaf/api/services/appConfigService";

// After:
import {
  getFilePreview,
  resolveChatAttachmentRoot,
  saveChatImageAttachment,
  saveChatImageAttachmentFromPath,
} from "@/ai/services/image/attachmentResolver";
import { getOpenLoafRootDir } from "@openloaf/config";
import { getResolvedTempStorageDir } from "@openloaf/api/services/appConfigService";
```

Remove `getProjectRootPath` import if no longer used elsewhere in the file. Keep `getResolvedTempStorageDir` as fallback.

- [ ] **Step 4: Verify server compiles**

Run: `cd apps/server && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```
fix(server): use resolveChatAttachmentRoot in uploadGenericFile to prevent ../ paths
```

---

### Task 2: Add `resolveMediaTypeFromPath` utility

**Files:**
- Modify: `apps/web/src/lib/format-utils.ts` — add MIME mapping function

- [ ] **Step 1: Add `resolveMediaTypeFromPath` to format-utils.ts**

Append to `apps/web/src/lib/format-utils.ts`:

```typescript
const MEDIA_TYPE_MAP: Record<string, string> = {
  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  md: "text/markdown",
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
}

/** Resolve media type from file path extension. */
export function resolveMediaTypeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
  return MEDIA_TYPE_MAP[ext] ?? "application/octet-stream"
}
```

- [ ] **Step 2: Verify web compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```
feat(web): add resolveMediaTypeFromPath utility for common document MIME types
```

---

### Task 3: Update `MessageFile` to use `resolveMediaTypeFromPath`

**Files:**
- Modify: `apps/web/src/components/ai/message/tools/MessageFile.tsx:192` — use new MIME utility

- [ ] **Step 1: Add import**

In `apps/web/src/components/ai/message/tools/MessageFile.tsx`, add import:

```typescript
import { resolveMediaTypeFromPath } from "@/lib/format-utils";
```

- [ ] **Step 2: Replace hardcoded fallback**

In the same file, replace the `attachmentMediaType` line:

```typescript
// Before:
  const attachmentMediaType = mediaType || (isImage ? "image/png" : "application/octet-stream");

// After:
  const attachmentMediaType = mediaType || resolveMediaTypeFromPath(url);
```

- [ ] **Step 3: Commit**

```
fix(web): use resolveMediaTypeFromPath in MessageFile for correct MIME display
```

---

### Task 4: Simplify `MessageHumanTextPart` — unified chip rendering

**Files:**
- Modify: `apps/web/src/components/ai/message/MessageHuman.tsx` — remove dual rendering pipeline

- [ ] **Step 1: Remove dead types and functions**

In `apps/web/src/components/ai/message/MessageHuman.tsx`, delete the following:

1. Delete the `FileTokenMatch` type (lines 59-68):
```typescript
// DELETE entire block:
type FileTokenMatch = {
  /** Raw token string with leading "@". */
  token: string;
  /** Token string without line range. */
  pathToken: string;
  /** Resolved project id. */
  projectId: string;
  /** Project-relative path. */
  relativePath: string;
};
```

2. Delete the `parseSingleFileToken` function (lines 86-108):
```typescript
// DELETE entire block:
/** Parse a text block that only contains a single file token. */
function parseSingleFileToken(text: string, defaultProjectId?: string): FileTokenMatch | null {
  // ... entire function body
}
```

3. Delete the `resolveImageMediaType` function (lines 110-117):
```typescript
// DELETE entire block:
/** Resolve image media type from a relative path. */
function resolveImageMediaType(relativePath: string): string {
  // ... entire function body
}
```

- [ ] **Step 2: Simplify `MessageHumanTextPart`**

Replace the entire `MessageHumanTextPart` function with:

```typescript
/** Render a human text part as inline chips via ChatMessageText. */
function MessageHumanTextPart(props: {
  /** Raw text content. */
  text: string;
  /** Shared text class name. */
  className?: string;
  /** Default project id for scoped path resolve. */
  projectId?: string;
}) {
  const { text, className, projectId } = props;
  return <ChatMessageText value={text} className={className} projectId={projectId} />;
}
```

- [ ] **Step 3: Clean up unused imports**

Remove imports that are no longer used in `MessageHuman.tsx`:

```typescript
// Remove these if no longer used elsewhere in the file:
import MessageFile from "./tools/MessageFile";
import { IMAGE_EXTS } from "@/components/project/filesystem/components/FileSystemEntryVisual";
import {
  buildUriFromRoot,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { queryClient, trpc } from "@/utils/trpc";
```

Check each import — `queryClient`/`trpc` might be used elsewhere in the file (e.g., image state loading). Only remove if truly unused. `parseScopedProjectPath` and `buildUriFromRoot` are also imported at the top — verify they're not used elsewhere in the file before removing.

Note: `FILE_TOKEN_REGEX` is still used by `collectHumanTextChunks` indirectly — keep it.

- [ ] **Step 4: Also remove `projects` prop from `MessageHumanTextPart` call site**

In the `MessageHuman` component's JSX (around line 466), simplify the render call:

```typescript
// Before:
          <MessageHumanTextPart
              key={`text-${index}`}
              text={text}
              className={cn(USER_MESSAGE_TEXT_CLASS, "text-[12px] leading-4 break-words")}
              projectId={projectId}
              projects={projects}
            />

// After:
          <MessageHumanTextPart
              key={`text-${index}`}
              text={text}
              className={cn(USER_MESSAGE_TEXT_CLASS, "text-[12px] leading-4 break-words")}
              projectId={projectId}
            />
```

- [ ] **Step 5: Verify web compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 6: Commit**

```
refactor(web): unify human message file mentions to inline chip rendering

Remove dual MessageFile/ChatMessageText rendering pipeline in
MessageHumanTextPart. All file mentions now render as inline blue chips
consistent with the input editor style.
```

---

### Task 5: Fix click interaction — historical path normalization

**Files:**
- Modify: `apps/web/src/lib/chat/mention-pointer.ts:97-121` — add `../` path normalization

- [ ] **Step 1: Add normalization in `parseMentionFileRef`**

In `apps/web/src/lib/chat/mention-pointer.ts`, modify `parseMentionFileRef`. After line 112 (`const parsed = parseScopedProjectPath(baseValue);`), add normalization before the return:

```typescript
/** Parse a mention value into a project file reference. */
function parseMentionFileRef(value: string, defaultProjectId?: string): MentionFileRef | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let normalized: string;
  if (trimmed.startsWith("@{") && trimmed.endsWith("}")) {
    normalized = trimmed.slice(2, -1);
  } else if (trimmed.startsWith("@")) {
    normalized = trimmed.slice(1);
  } else {
    normalized = trimmed;
  }
  const match = normalized.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? normalized;
  // 绝对路径不走项目文件解析。
  if (baseValue.startsWith("/")) return null;
  const parsed = parseScopedProjectPath(baseValue);
  const projectId = parsed?.projectId ?? defaultProjectId;
  if (!projectId) return null;

  let relativePath = parsed?.relativePath ?? "";

  // 兼容历史数据：../chat-history/xxx → .openloaf/chat-history/xxx
  if (relativePath.match(/^(?:\.\.\/)+/) && relativePath.includes("chat-history/")) {
    const stripped = relativePath.replace(/^(?:\.\.\/)+/, "");
    if (stripped.startsWith("chat-history/")) {
      relativePath = `.openloaf/${stripped}`;
    }
  }

  if (!relativePath) return null;
  return {
    projectId,
    relativePath,
    lineStart: match?.[2],
    lineEnd: match?.[3],
  };
}
```

- [ ] **Step 2: Verify web compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```
fix(web): normalize historical ../chat-history/ paths in mention click handler
```

---

### Task 6: Final verification and cleanup

- [ ] **Step 1: Run full type check**

Run: `pnpm run check-types`
Expected: All packages pass.

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`
Expected: No new errors.

- [ ] **Step 3: Manual verification checklist**

Test in running app:
1. Project chat: upload a PDF → confirm path is `.openloaf/chat-history/...` (no `../`)
2. Human message: PDF mention shows as blue chip with correct filename
3. Click the chip → file preview opens
4. AI tool output (e.g., pdf-query result) → still renders as `MessageFile` card
5. Temporary chat (no project): upload file → works normally
6. Historical messages with `../chat-history/...` paths → chip is clickable

- [ ] **Step 4: Commit any lint fixes if needed**

```
style(web): lint fixes for file mention unification
```

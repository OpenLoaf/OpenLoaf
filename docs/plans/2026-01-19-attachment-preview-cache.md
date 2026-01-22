# Attachment Preview Cache Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add on-disk caching for `/chat/attachments/preview` compressed image previews under `.tenas-cache/preview/` with invalidation when the source file updates.

**Architecture:** Cache is keyed by relative path and compression options. On preview requests, check cached output in the project/workspace root, compare cache creation time to source mtime, and regenerate if stale. PDFs bypass cache.

**Tech Stack:** Node.js `fs/promises`, `crypto` hashing, existing preview compressor in `apps/server/src/ai/infrastructure/adapters/attachmentResolver.ts`.

### Task 1: Add preview cache helpers and integrate into getFilePreview

**Files:**
- Modify: `apps/server/src/ai/infrastructure/adapters/attachmentResolver.ts`
- Create: none
- Test: none (项目规则：运行 superpowers skill 时跳过 TDD 测试)

**Step 1: Add cache helper functions**

```typescript
/** Build stable cache key for preview compression results. */
function buildPreviewCacheKey(...) { ... }
/** Resolve cache dir paths under .tenas-cache/preview. */
function resolvePreviewCachePaths(...) { ... }
/** Try to load cached preview if valid. */
async function loadPreviewCache(...) { ... }
/** Persist compressed preview to cache. */
async function savePreviewCache(...) { ... }
```

**Step 2: Wire cache into getFilePreview**

```typescript
const cacheHit = await loadPreviewCache(...)
if (cacheHit) return { kind: "ready", buffer: cacheHit.buffer, ... }
// otherwise compress and save
await savePreviewCache(...)
```

**Step 3: Manual verification (no automated tests)**

Run: `pnpm dev:server` and hit `/chat/attachments/preview` twice for same image; confirm cache files appear under `.tenas-cache/preview/` and update when the source file changes.

**Step 4: Commit (optional, only if requested)**

```bash
git add apps/server/src/ai/infrastructure/adapters/attachmentResolver.ts docs/plans/2026-01-19-attachment-preview-cache.md
git commit -m "feat: cache attachment preview images"
```

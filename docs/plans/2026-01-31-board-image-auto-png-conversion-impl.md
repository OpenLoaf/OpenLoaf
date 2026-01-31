# Board Image Auto PNG Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert non-JPG/PNG images to PNG during board insertion, save to board asset folder, and set `originalSrc` to the asset path with failure toast.

**Architecture:** Intercept image insertions via `BoardCanvasCollab`'s image payload builder. Convert files to PNG on the client (HEIC via `heic2any` dynamic import; other formats via canvas), then save the PNG into the board `asset` folder and build node payloads from the converted file. On failure, toast error and fall back to the original file.

**Tech Stack:** React/Next.js, TypeScript, `heic2any`, `sonner` toast, board engine payload builder.

---

> Note: Per project rules for superpowers workflows, skip TDD steps and do not create a worktree.

### Task 1: Add PNG conversion helper for image insertions

**Files:**
- Modify: `apps/web/src/components/board/utils/image.ts`
- (Optional) Modify: `apps/web/src/lib/image/uri.ts` if reuse helpers

**Step 1: Implement helper to detect image type and convert to PNG**

Add functions:

```ts
function isJpegOrPng(file: File): boolean
function isHeicLike(file: File): boolean
async function convertImageFileToPngIfNeeded(file: File): Promise<{ file: File; converted: boolean }>
```

Logic:
- If JPG/PNG, return original file with `converted=false`.
- If HEIC/HEIF: dynamic `import("heic2any")`, call `heic2any({ blob: file, toType: "image/png" })`, normalize return to `Blob`, build `File` with `.png` name.
- Else: read as dataURL, decode `Image`, draw to canvas, `toBlob("image/png")`, build `File`.
- Throw on conversion failure.

**Step 2: Ensure filename becomes `.png`**

Use base name + `.png`. If base missing, fallback to `image.png`.

### Task 2: Apply conversion inside board insertion flow

**Files:**
- Modify: `apps/web/src/components/board/core/BoardCanvasCollab.tsx`

**Step 1: Import helper and toast**

```ts
import { toast } from "sonner";
import { convertImageFileToPngIfNeeded } from "../utils/image";
```

**Step 2: Update `buildImagePayload`**

Replace:

```ts
const payload = await buildImageNodePayloadFromFile(file);
const relativePath = await saveBoardAssetFile(file);
```

With:

```ts
let targetFile = file;
let converted = false;
try {
  const result = await convertImageFileToPngIfNeeded(file);
  targetFile = result.file;
  converted = result.converted;
} catch (error) {
  toast.error("图片转换失败，已使用原始文件插入");
}
const payload = await buildImageNodePayloadFromFile(targetFile);
const relativePath = await saveBoardAssetFile(targetFile);
```

Ensure: If conversion fails, still proceed with original file. If save fails, fall back to payload from target file without changing `originalSrc`.

**Step 3: Preserve preview logic**

Leave preview building as-is (still from the final file), so preview is PNG if converted.

### Task 3: Ensure board insertions use converted asset path

**Files:**
- Modify: `apps/web/src/components/board/core/BoardCanvasCollab.tsx`

**Step 1: Keep `originalSrc` assignment**

Verify it sets:

```ts
originalSrc: relativePath,
```

This must point to `asset/*.png` for converted files.

### Task 4: Validate basic behavior manually

**Files:**
- None

**Step 1: Manual checks**

- Drag HEIC into board → node appears, `originalSrc` in asset with `.png`.
- Drag AVIF/WEBP → if supported, conversion succeeds; if not, toast error and insert original.
- Import multiple images → each converted and saved.

---

Plan complete and saved to `docs/plans/2026-01-31-board-image-auto-png-conversion-impl.md`.

Two execution options:
1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?

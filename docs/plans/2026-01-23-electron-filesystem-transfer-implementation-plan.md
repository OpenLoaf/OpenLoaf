# Electron Filesystem Transfer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Electron drag/drop large uploads with native copy and add a minimal progress bar + retry for files and folders in the project filesystem panel.

**Architecture:** Renderer collects drop files/folders and calls Electron IPC to start a transfer. Main process performs stream copy (file) or recursive copy (folder) with byte-based progress. Renderer shows a single-line progress bar (current file name + percent) and offers retry on failure. Web browser path stays unchanged.

**Tech Stack:** Electron (main/preload), React (Next.js), tRPC (existing fs APIs), Node.js fs streams.

---

### Task 1: Add Electron IPC surface for transfers

**Files:**
- Modify: `apps/electron/src/main/ipc/index.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Modify: `apps/web/src/types/electron.d.ts`

**Step 1: Write a failing test**

Skip (no existing test harness for Electron IPC; use manual verification).

**Step 2: Add IPC handlers in main process**

Implement:
- `tenas:fs:transfer-start` (invoke)
- `tenas:fs:transfer-cancel` (optional if we add cancel)
- Progress events via `event.sender.send('tenas:fs:transfer-progress', payload)`

Payload shape:
```ts
{ id: string; sourcePath: string; targetPath: string; kind: "file" | "folder" }
```

Progress payload:
```ts
{ id: string; currentName: string; percent: number }
```

Error payload:
```ts
{ id: string; reason: string }
```

**Step 3: Expose preload bridge**

Expose in `window.tenasElectron`:
```ts
startTransfer(payload): Promise<{ ok: true } | { ok: false; reason?: string }>
```

**Step 4: Update type definitions**

Add `startTransfer` and optional `onTransferProgress` event signatures to `apps/web/src/types/electron.d.ts`.

**Step 5: Manual verification**

No runtime changes yet; ensure TypeScript compiles.

**Step 6: Commit**

```bash
git add apps/electron/src/main/ipc/index.ts apps/electron/src/preload/index.ts apps/web/src/types/electron.d.ts
git commit -m "feat(electron): add transfer IPC bridge"
```

---

### Task 2: Implement copy engine with progress (file + folder)

**Files:**
- Modify: `apps/electron/src/main/ipc/index.ts`

**Step 1: Implement file copy with stream progress**

Use `fs.createReadStream` / `fs.createWriteStream` and track bytes to emit percent.

**Step 2: Implement folder copy**

- Walk directory tree and compute total bytes.
- Copy files sequentially, emitting progress with `currentName`.

**Step 3: Error handling**

- Validate `sourcePath` exists and is file/dir.
- Emit `transfer-error` on exceptions.

**Step 4: Manual verification**

Drag a large file and a folder; confirm progress events fire.

**Step 5: Commit**

```bash
git add apps/electron/src/main/ipc/index.ts
git commit -m "feat(electron): copy files and folders with progress"
```

---

### Task 3: Add minimal progress UI in filesystem panel

**Files:**
- Modify: `apps/web/src/components/project/filesystem/components/ProjectFileSystem.tsx`
- Modify: `apps/web/src/components/project/filesystem/models/file-system-model.ts`
- Create: `apps/web/src/components/project/filesystem/components/ProjectFileSystemTransferBar.tsx`

**Step 1: Add state in model**

State shape:
```ts
{ id: string; currentName: string; percent: number; status: "running" | "failed" }
```

Handle progress events from Electron and update state.

**Step 2: Render minimal bar**

`ProjectFileSystemTransferBar` shows "<file> <percent>%" and a Retry button only on failure.

**Step 3: Hook into drop flow**

For Electron drops, call `window.tenasElectron.startTransfer` instead of `writeBinary/importLocalFile` when size >= 100MB or when a folder is dropped.

**Step 4: Manual verification**

- Drag 600MB file: bar updates.
- Simulate failure (e.g., delete source file mid-copy): bar shows retry.

**Step 5: Commit**

```bash
git add apps/web/src/components/project/filesystem/components/ProjectFileSystem.tsx \
  apps/web/src/components/project/filesystem/models/file-system-model.ts \
  apps/web/src/components/project/filesystem/components/ProjectFileSystemTransferBar.tsx
git commit -m "feat(web): minimal transfer progress bar"
```

---

### Task 4: Clean up old Electron path usage

**Files:**
- Modify: `packages/api/src/routers/fs.ts`
- Modify: `apps/web/src/components/project/filesystem/models/file-system-model.ts`

**Step 1: Remove Electron-only `importLocalFile` usage**

Leave API intact if used elsewhere; stop using it in the Electron flow.

**Step 2: Manual verification**

Electron drag/drop still works; Web path unaffected.

**Step 3: Commit**

```bash
git add packages/api/src/routers/fs.ts apps/web/src/components/project/filesystem/models/file-system-model.ts
git commit -m "chore: stop Electron importLocalFile usage"
```

---

### Task 5: Final verification

**Step 1: Run type check**

```bash
pnpm check-types
```

Expected: PASS.

**Step 2: Manual scenario checklist**

- Drag 600MB file in Electron: progress bar appears, copy completes.
- Drag folder: progress bar updates, all files copied.
- Failure + retry works.

**Step 3: Commit verification note (optional)**

```bash
# no-op unless you want a verification commit
```

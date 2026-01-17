# Project Permanent Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a confirmed permanent-delete flow for projects (checkbox + "delete" input) and a backend mutation that deletes project files and removes the project mapping.

**Architecture:** Introduce `project.destroy` in the API router to handle irreversible deletion (disk + mapping). Update the project remove dialog to gate destructive deletion behind a checkbox and confirmation text, while keeping the default “remove only” behavior.

**Tech Stack:** Next.js (React), tRPC, TanStack React Query, Node `fs`.

> Note: Automated tests are skipped for this change per user request; include manual verification steps instead.

### Task 1: Add backend `project.destroy` mutation

**Files:**
- Modify: `packages/api/src/routers/project.ts`

**Step 1: Write the failing test (skipped per user request)**

**Step 2: Run test to verify it fails (skipped per user request)**

**Step 3: Write minimal implementation**

```ts
  /** Permanently delete a project from disk and remove it from workspace. */
  destroy: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input }) => {
      const projectTrees = await readWorkspaceProjectTrees();
      const sourceEntry = findProjectNodeWithParent(projectTrees, input.projectId);
      if (!sourceEntry) {
        throw new Error("Project not found.");
      }
      const rootUri = getProjectRootUri(input.projectId);
      if (!rootUri) {
        throw new Error("Project not found.");
      }
      const rootPath = resolveFilePathFromUri(rootUri);
      // 中文注释：先删除磁盘目录，再移除项目映射，避免列表与磁盘状态不一致。
      await fs.rm(rootPath, { recursive: true, force: true });
      const parentProjectId = sourceEntry.parentProjectId;
      if (parentProjectId) {
        await removeChildProjectEntry(parentProjectId, input.projectId);
      } else {
        removeActiveWorkspaceProject(input.projectId);
      }
      return { ok: true };
    }),
```

**Step 4: Run tests to verify pass (skipped per user request)**

**Step 5: Commit**

```bash
git add packages/api/src/routers/project.ts
git commit -m "feat: add project destroy mutation"
```

### Task 2: Update ProjectTree remove dialog UI and behavior

**Files:**
- Modify: `apps/web/src/components/layout/sidebar/ProjectTree.tsx`

**Step 1: Write the failing test (skipped per user request)**

**Step 2: Run test to verify it fails (skipped per user request)**

**Step 3: Write minimal implementation**

```ts
import { Checkbox } from "@/components/ui/checkbox";

const destroyProject = useMutation(trpc.project.destroy.mutationOptions());
const [isPermanentRemoveChecked, setIsPermanentRemoveChecked] = useState(false);
const [permanentRemoveText, setPermanentRemoveText] = useState("");
const isPermanentRemoveConfirmed =
  isPermanentRemoveChecked && permanentRemoveText.trim() === "delete";

const resetRemoveDialogState = () => {
  setRemoveTarget(null);
  setIsPermanentRemoveChecked(false);
  setPermanentRemoveText("");
};

/** Permanently delete project data from disk and remove it from workspace. */
const handleDestroyProject = async () => {
  if (!removeTarget?.projectId) {
    toast.error("缺少项目 ID");
    return;
  }
  try {
    setIsRemoveBusy(true);
    await destroyProject.mutateAsync({ projectId: removeTarget.projectId });
    toast.success("项目已彻底删除");
    resetRemoveDialogState();
    await queryClient.invalidateQueries({ queryKey: getProjectsQueryKey() });
  } catch (err: any) {
    toast.error(err?.message ?? "彻底删除失败");
  } finally {
    setIsRemoveBusy(false);
  }
};
```

Dialog body additions:

```tsx
<div className="grid gap-4 py-4">
  <div className="flex items-start gap-2">
    <Checkbox
      id="remove-project-permanent"
      checked={isPermanentRemoveChecked}
      onCheckedChange={(checked) =>
        setIsPermanentRemoveChecked(Boolean(checked))
      }
    />
    <Label htmlFor="remove-project-permanent">
      勾选后将会彻底删除项目（会删除磁盘文件）
    </Label>
  </div>
  {isPermanentRemoveChecked ? (
    <div className="grid gap-2">
      <Label htmlFor="remove-project-confirm">输入 delete 以确认</Label>
      <Input
        id="remove-project-confirm"
        value={permanentRemoveText}
        onChange={(event) => setPermanentRemoveText(event.target.value)}
        placeholder="delete"
      />
      <p className="text-xs text-muted-foreground">
        输入 delete 后才允许彻底删除
      </p>
    </div>
  ) : null}
</div>
```

Button behavior:

```tsx
const removeAction = isPermanentRemoveChecked
  ? handleDestroyProject
  : handleRemoveProject;
const removeButtonText = isPermanentRemoveChecked ? "彻底删除" : "移除";
const isRemoveActionDisabled =
  isRemoveBusy || (isPermanentRemoveChecked && !isPermanentRemoveConfirmed);

<Button
  variant="destructive"
  onClick={removeAction}
  disabled={isRemoveActionDisabled}
>
  {removeButtonText}
</Button>
```

Ensure `onOpenChange` for the dialog calls `resetRemoveDialogState()` when closing.

**Step 4: Run tests to verify pass (skipped per user request)**

**Step 5: Commit**

```bash
git add apps/web/src/components/layout/sidebar/ProjectTree.tsx
git commit -m "feat: add confirmed permanent delete in project tree"
```

### Task 3: Manual verification

**Files:**
- N/A

**Step 1: Start dev servers (manual)**

Run:
```bash
pnpm dev:web
pnpm dev:server
```

**Step 2: Verify UI**
- Open ProjectTree context menu -> 移除
- Default state: no checkbox selected, button says “移除”
- Check the box: input appears; button switches to “彻底删除” and is disabled until input is exactly `delete`
- Input `delete`: button enabled

**Step 3: Verify behavior**
- Click “移除”: project disappears from list, disk files remain
- Click “彻底删除”: project disappears from list, project root folder removed from disk

**Step 4: Commit**

```bash
git status -sb
```

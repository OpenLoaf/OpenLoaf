# Project Version Control Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a “是否开启项目版本控制” toggle to create/import modals and conditionally initialize version control when enabled.

**Architecture:** Extend the project create mutation input to accept an `enableVersionControl` boolean. Update create/import dialogs to surface a switch (default on) and pass the value through. Server-side, call `ensureGitRepository` only when the switch is enabled.

**Tech Stack:** React (Next.js), tRPC, TypeScript, isomorphic-git.

> Note: Project rules require skipping TDD and not creating worktrees.

### Task 1: Extend project create API input

**Files:**
- Modify: `packages/api/src/routers/project.ts`
- Modify: `packages/api/src/types/tools/db.ts`

**Step 1: Add optional `enableVersionControl` to the create schema**

```ts
enableVersionControl: z.boolean().optional()
```

**Step 2: Gate git initialization on the flag**

```ts
const enableVersionControl = input.enableVersionControl ?? true;
if (enableVersionControl) {
  await ensureGitRepository({ rootPath: projectRootPath, defaultBranch: "main", templatePath });
}
```

**Step 3: Commit**

```bash
git add packages/api/src/routers/project.ts packages/api/src/types/tools/db.ts
git commit -m "feat: add version control toggle to project create API"
```

### Task 2: Add toggle to create/import project modal (root)

**Files:**
- Modify: `apps/web/src/components/layout/sidebar/SidebarProject.tsx`

**Step 1: Add UI state**

```ts
const [enableVersionControl, setEnableVersionControl] = useState(true);
const [importPath, setImportPath] = useState("");
const [isImportOpen, setIsImportOpen] = useState(false);
```

**Step 2: Add switch to create modal**

```tsx
<Label htmlFor="project-version-control" className="text-right">项目版本控制</Label>
<Switch checked={enableVersionControl} onCheckedChange={(checked) => setEnableVersionControl(Boolean(checked))} />
```

**Step 3: Add import modal with switch and path input**

```tsx
<DialogTitle>导入项目</DialogTitle>
<Input value={importPath} ... />
<Switch checked={enableVersionControl} ... />
```

**Step 4: Pass flag to create/import mutation**

```ts
await createProject.mutateAsync({ ..., enableVersionControl });
```

**Step 5: Commit**

```bash
git add apps/web/src/components/layout/sidebar/SidebarProject.tsx
git commit -m "feat: add version control toggle to project create/import modal"
```

### Task 3: Add toggle to create/import child project modal

**Files:**
- Modify: `apps/web/src/components/layout/sidebar/ProjectTree.tsx`

**Step 1: Extend child target state**

```ts
type ChildProjectTarget = { ...; enableVersionControl: boolean; };
type ImportChildTarget = { ...; enableVersionControl: boolean; };
```

**Step 2: Add switch to child create/import dialogs**

```tsx
<Label htmlFor="child-version-control" className="text-right">项目版本控制</Label>
<Switch checked={createChildTarget?.enableVersionControl ?? true} ... />
```

**Step 3: Pass flag to create/import mutation**

```ts
await createProject.mutateAsync({ ..., enableVersionControl: createChildTarget.enableVersionControl });
```

**Step 4: Commit**

```bash
git add apps/web/src/components/layout/sidebar/ProjectTree.tsx
git commit -m "feat: add version control toggle to child project dialogs"
```

### Task 4: Manual verification

**Step 1: Create project with toggle ON**

Expected: repo initialized and `.gitignore` appended.

**Step 2: Create project with toggle OFF**

Expected: no git init performed.

**Step 3: Import project with toggle ON/OFF**

Expected: behavior matches toggle selection.


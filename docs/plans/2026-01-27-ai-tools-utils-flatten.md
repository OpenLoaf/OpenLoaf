# AI Tools + Utils Flatten Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Flatten `apps/server/src/ai/tools` into a single folder and consolidate `apps/server/src/ai/utils` into `apps/server/src/ai/shared/util.ts`.

**Architecture:** Move all tool modules out of nested folders into `apps/server/src/ai/tools`, then update all imports to the new paths. Merge all utility exports into one shared `util.ts` and replace per-file imports with the new shared module. Remove empty directories after moves.

**Tech Stack:** TypeScript, pnpm, ripgrep (rg)

---

### Task 1: Inventory tool modules and plan moves

**Files:**
- Inspect: `apps/server/src/ai/tools/**`

**Step 1: List tool files**

Run: `rg --files apps/server/src/ai/tools`
Expected: Full list of files to move from subfolders.

**Step 2: Define exact move list**

Move (examples; update if list changes):
- Move: `apps/server/src/ai/tools/system/projectPath.ts` → `apps/server/src/ai/tools/projectPath.ts`
- Move: `apps/server/src/ai/tools/system/zipImageExtractor.ts` → `apps/server/src/ai/tools/zipImageExtractor.ts`
- Move: `apps/server/src/ai/tools/system/timeNowTool.ts` → `apps/server/src/ai/tools/timeNowTool.ts`
- Move: `apps/server/src/ai/tools/delegation/subAgentTool.ts` → `apps/server/src/ai/tools/subAgentTool.ts`
- Move: `apps/server/src/ai/tools/runtime/toolScope.ts` → `apps/server/src/ai/tools/toolScope.ts`
- Move: `apps/server/src/ai/tools/runtime/execUtils.ts` → `apps/server/src/ai/tools/execUtils.ts`
- Move: `apps/server/src/ai/tools/runtime/execSessionStore.ts` → `apps/server/src/ai/tools/execSessionStore.ts`
- Move: `apps/server/src/ai/tools/runtime/shellTool.ts` → `apps/server/src/ai/tools/shellTool.ts`
- Move: `apps/server/src/ai/tools/runtime/shellCommandTool.ts` → `apps/server/src/ai/tools/shellCommandTool.ts`
- Move: `apps/server/src/ai/tools/runtime/execCommandTool.ts` → `apps/server/src/ai/tools/execCommandTool.ts`
- Move: `apps/server/src/ai/tools/runtime/writeStdinTool.ts` → `apps/server/src/ai/tools/writeStdinTool.ts`
- Move: `apps/server/src/ai/tools/runtime/fileTools.ts` → `apps/server/src/ai/tools/fileTools.ts`
- Move: `apps/server/src/ai/tools/runtime/commandApproval.ts` → `apps/server/src/ai/tools/commandApproval.ts`
- Move: `apps/server/src/ai/tools/runtime/gitignoreMatcher.ts` → `apps/server/src/ai/tools/gitignoreMatcher.ts`
- Move: `apps/server/src/ai/tools/runtime/updatePlanTool.ts` → `apps/server/src/ai/tools/updatePlanTool.ts`
- Move: `apps/server/src/ai/tools/browserAutomation/browserAutomationTools.ts` → `apps/server/src/ai/tools/browserAutomationTools.ts`
- Move: `apps/server/src/ai/tools/test/testApprovalTool.ts` → `apps/server/src/ai/tools/testApprovalTool.ts`
- Move: `apps/server/src/ai/tools/frontend/pendingRegistry.ts` → `apps/server/src/ai/tools/pendingRegistry.ts`
- Move: `apps/server/src/ai/tools/ui/jsonRenderTool.ts` → `apps/server/src/ai/tools/jsonRenderTool.ts`
- Move: `apps/server/src/ai/tools/ui/openUrl.ts` → `apps/server/src/ai/tools/openUrl.ts`

---

### Task 2: Flatten tool files into `apps/server/src/ai/tools`

**Files:**
- Modify (move): `apps/server/src/ai/tools/**`

**Step 1: Move files (no worktree per project rule)**

Use `mv` or `git mv` for each path in Task 1.

**Step 2: Update internal relative imports inside moved files**

Example: `../runtime/execUtils` → `./execUtils` once co-located.

---

### Task 3: Update tool imports across server

**Files:**
- Modify: `apps/server/src/**` (imports referencing old paths)

**Step 1: Update all `@/ai/tools/...` imports to new flattened paths**

Example: `@/ai/tools/runtime/execCommandTool` → `@/ai/tools/execCommandTool`

**Step 2: Update any relative imports within `apps/server/src/ai/tools`**

Example: `./runtime/toolScope` → `./toolScope`

---

### Task 4: Remove empty tool subdirectories

**Files:**
- Delete: `apps/server/src/ai/tools/{runtime,browserAutomation,ui,system,frontend,delegation,test}`

**Step 1: Delete empty folders**

Run: `find apps/server/src/ai/tools -type d -empty`
Then remove the listed folders.

---

### Task 5: Consolidate `apps/server/src/ai/utils` into `apps/server/src/ai/shared/util.ts`

**Files:**
- Create: `apps/server/src/ai/shared/util.ts`
- Delete: `apps/server/src/ai/utils/*`

**Step 1: Create `shared/util.ts` with merged exports**

Move exports from:
- `apps/server/src/ai/utils/ai-debug-fetch.ts`
- `apps/server/src/ai/utils/openai-url.ts`
- `apps/server/src/ai/utils/provider-auth.ts`
- `apps/server/src/ai/utils/number-utils.ts`
- `apps/server/src/ai/utils/type-guards.ts`

**Step 2: Remove old utils files**

Delete each file after its exports exist in `shared/util.ts`.

---

### Task 6: Update utils imports across server

**Files:**
- Modify: `apps/server/src/**`

**Step 1: Replace imports**

Example:
- `@/ai/utils/number-utils` → `@/ai/shared/util`
- `@/ai/utils/type-guards` → `@/ai/shared/util`

---

### Task 7: Verify type safety (no TDD per project rule)

**Files:**
- Test: none added (skip TDD per project rule)

**Step 1: Run typecheck**

Run: `pnpm check-types`
Expected: PASS, or known unrelated failures outside `apps/server/src/ai` reported back.

---

### Notes

- Worktree creation is skipped per project rule.
- Commit steps are omitted unless explicitly requested.

# Cache Management via tRPC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provide tRPC endpoints to read/clear `.tenas-cache` size for project or workspace roots and update the settings UI to use those endpoints.

**Architecture:** Add two tRPC procedures under `trpc.project` that accept either `projectId` or `workspaceId` (one required). Server resolves the root path, computes directory size, clears cache on request, and the UI queries and triggers these actions without Electron IPC. Existing Electron IPC paths remain but are unused by this UI.

**Tech Stack:** tRPC, Node.js `fs/promises`, existing workspace/project root resolvers.

### Task 1: Server-side cache size/clear procedures

**Files:**
- Modify: `apps/server/src/routers/project.ts`
- Modify: `packages/api/src/routers/project.ts` (types if needed)
- Modify: `packages/api/src/types/` (input/output schemas if needed)
- Test: none (项目规则：运行 superpowers skill 时跳过 TDD 测试)

**Step 1: Add input schema**

```typescript
const cacheScopeSchema = z.object({
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
}).refine((value) => Boolean(value.projectId || value.workspaceId), {
  message: "projectId or workspaceId is required",
});
```

**Step 2: Add `getCacheSize` procedure**

```typescript
getCacheSize: protectedProcedure
  .input(cacheScopeSchema)
  .query(async ({ input }) => {
    // resolve root path from projectId or workspaceId
    // compute .tenas-cache size recursively
    return { bytes };
  })
```

**Step 3: Add `clearCache` procedure**

```typescript
clearCache: protectedProcedure
  .input(cacheScopeSchema)
  .mutation(async ({ input }) => {
    // resolve root path
    // rm -rf .tenas-cache (force)
    return { ok: true };
  })
```

**Step 4: Manual verification**

Run `pnpm dev:server`, call the tRPC endpoints, confirm size changes after clear.

### Task 2: Update ProjectBasicSettings UI

**Files:**
- Modify: `apps/web/src/components/project/settings/menus/ProjectBasicSettings.tsx`

**Step 1: Replace Electron IPC usage with tRPC**

```typescript
const cacheSizeQuery = useQuery(trpc.project.getCacheSize...)
const clearCache = useMutation(trpc.project.clearCache...)
```

**Step 2: Wire UI**

```typescript
// show bytes from cacheSizeQuery.data?.bytes
// clear button triggers mutation and refetch
```

**Step 3: Manual verification**

Open settings page, confirm size shows and clear works.

**Step 4: Commit (optional, only if requested)**

```bash
git add apps/server/src/routers/project.ts packages/api/src/routers/project.ts apps/web/src/components/project/settings/menus/ProjectBasicSettings.tsx docs/plans/2026-01-19-cache-management-trpc.md
git commit -m "feat: add cache management via trpc"
```

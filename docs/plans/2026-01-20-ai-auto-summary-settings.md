# AI Auto Summary Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add “资料自动总结” toggle and “自动总结时间（多选小时）” to workspace AI model settings and project AI settings, with project override gating and defaults (enabled + hours 8/12/16/24).

**Architecture:** Extend global basic settings schema/defaults with auto-summary fields. Add project-level overrides stored in project.json under a new `aiSettings` block, gated by `aiSettingsOverrideEnabled`. UI reads workspace defaults and, when override is enabled, reads/writes project overrides; otherwise it shows workspace values read-only.

**Tech Stack:** tRPC settings + project router, project.json storage, React settings UI components.

**Note:** 项目规则要求运行 superpowers skill 时跳过 TDD 测试；计划中的测试步骤按此省略。

### Task 1: Extend global basic settings (workspace defaults)

**Files:**
- Modify: `packages/api/src/types/basic.ts`
- Modify: `apps/server/src/modules/settings/tenasConfStore.ts`
- Modify: `apps/server/src/modules/settings/settingsService.ts` (normalization if needed)
- Test: none (项目规则：运行 superpowers skill 时跳过 TDD 测试)

**Step 1: Add fields to basic config schema**

```ts
autoSummaryEnabled: z.boolean(),
autoSummaryHours: z.array(z.number().int().min(0).max(24)),
```

**Step 2: Add defaults in DEFAULT_BASIC_CONF**

```ts
autoSummaryEnabled: true,
autoSummaryHours: [8, 12, 16, 24],
```

**Step 3: Ensure normalization clamps to 0–24 and unique sorted**

```ts
const autoSummaryHours = normalizeHours(source.autoSummaryHours, fallbackSource.autoSummaryHours);
```

### Task 2: Add project-level AI settings (project.json)

**Files:**
- Modify: `packages/api/src/services/projectTreeService.ts`
- Modify: `packages/api/src/routers/project.ts`
- Test: none (项目规则：运行 superpowers skill 时跳过 TDD 测试)

**Step 1: Extend projectConfigSchema**

```ts
aiSettings: z.object({
  overrideEnabled: z.boolean().optional(),
  autoSummaryEnabled: z.boolean().optional(),
  autoSummaryHours: z.array(z.number().int().min(0).max(24)).optional(),
}).optional(),
```

**Step 2: Add tRPC procedures**

```ts
getAiSettings: shieldedProcedure.input({ projectId }).query(...)
setAiSettings: shieldedProcedure.input({ projectId, aiSettings }).mutation(...)
```

**Step 3: Persist in project.json**

```ts
await writeJsonAtomic(metaPath, { ...parsed, aiSettings: nextAiSettings });
```

### Task 3: Workspace “AI模型服务” UI

**Files:**
- Modify: `apps/web/src/components/setting/menus/provider/ProviderManagement.tsx`
- Test: none

**Step 1: Add toggle**

```tsx
<Switch checked={basic.autoSummaryEnabled} onCheckedChange={(v) => setBasic({ autoSummaryEnabled: v })} />
```

**Step 2: Add hour multi-select**

```tsx
const hours = Array.from({ length: 25 }, (_, i) => i);
// render checkbox list, update setBasic({ autoSummaryHours })
```

### Task 4: Project “AI设置” menu + override gating

**Files:**
- Modify: `apps/web/src/components/project/settings/ProjectSettingsPage.tsx`
- Create: `apps/web/src/components/project/settings/menus/ProjectAiSettings.tsx`
- Test: none

**Step 1: Add menu item**

```tsx
{ key: "ai", label: "AI设置", Icon: Sparkles, Component: ProjectAiSettings }
```

**Step 2: Implement ProjectAiSettings**

```tsx
// read workspace basic settings (trpc.settings.getBasic)
// read project ai settings (trpc.project.getAiSettings)
// toggle overrideEnabled; when false, disable fields and show workspace values
// when true, write project overrides and show editable hours/toggle
```

**Step 3: Ensure defaults**

If project settings missing, use workspace defaults (enabled + [8,12,16,24]).

**Step 4: Manual verification**

Open workspace settings and project AI settings, verify toggles/hours and override gating.

**Step 5: Commit (optional, only if requested)**

```bash
git add packages/api/src/types/basic.ts apps/server/src/modules/settings/tenasConfStore.ts packages/api/src/services/projectTreeService.ts packages/api/src/routers/project.ts apps/web/src/components/setting/menus/provider/ProviderManagement.tsx apps/web/src/components/project/settings/ProjectSettingsPage.tsx apps/web/src/components/project/settings/menus/ProjectAiSettings.tsx docs/plans/2026-01-20-ai-auto-summary-settings.md
git commit -m "feat: add auto summary settings"
```

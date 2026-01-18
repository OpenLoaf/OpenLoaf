# Runtime Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Codex-like shell, unified exec, and file/text tools to `apps/server/src/ai/tools`, with scope enforcement to project/workspace roots and a basic-settings toggle to allow out-of-scope access.

**Architecture:** Define new ToolDef entries in `packages/api/src/types/tools`, implement server-side tool handlers with shared scope resolution helpers, and register them in the tool registry and master agent toolset. Add a basic settings flag to control whether tools can operate outside project/workspace roots, and expose it in the UI.

**Tech Stack:** TypeScript, AI SDK v6 `tool()`, Node.js child_process, zod, React settings UI.

> 说明：按项目规则，运行 superpowers skill 时跳过 TDD/测试步骤，不创建 worktree。本计划不包含测试步骤。

### Task 1: Add tool definitions for shell/exec/file tools

**Files:**
- Create: `packages/api/src/types/tools/runtime.ts`
- Modify: `packages/api/src/types/tools/index.ts`

**Step 1: Add tool defs file**

```ts
import { z } from "zod";

export const shellCommandToolDef = {
  id: "shell-command",
  description: "...",
  parameters: z.object({
    command: z.array(z.string()).min(1),
    workdir: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    sandboxPermissions: z.enum(["use_default", "require_escalated"]).optional(),
    justification: z.string().optional(),
  }),
  component: null,
} as const;

export const execCommandToolDef = {
  id: "exec-command",
  description: "...",
  parameters: z.object({
    cmd: z.string().min(1),
    workdir: z.string().optional(),
    shell: z.string().optional(),
    login: z.boolean().optional(),
    tty: z.boolean().optional(),
    yieldTimeMs: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    sandboxPermissions: z.enum(["use_default", "require_escalated"]).optional(),
    justification: z.string().optional(),
  }),
  component: null,
} as const;

export const writeStdinToolDef = {
  id: "write-stdin",
  description: "...",
  parameters: z.object({
    sessionId: z.string().min(1),
    chars: z.string().optional(),
    yieldTimeMs: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
  }),
  component: null,
} as const;

export const readFileToolDef = {
  id: "read-file",
  description: "...",
  parameters: z.object({
    path: z.string().min(1),
    offset: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).optional(),
    mode: z.enum(["slice", "indentation"]).optional(),
    anchorLine: z.number().int().min(1).optional(),
    maxLevels: z.number().int().min(0).optional(),
    includeSiblings: z.boolean().optional(),
    includeHeader: z.boolean().optional(),
    maxLines: z.number().int().min(1).optional(),
  }),
  component: null,
} as const;

export const listDirToolDef = {
  id: "list-dir",
  description: "...",
  parameters: z.object({
    path: z.string().min(1),
    offset: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).optional(),
    depth: z.number().int().min(1).optional(),
  }),
  component: null,
} as const;

export const grepFilesToolDef = {
  id: "grep-files",
  description: "...",
  parameters: z.object({
    pattern: z.string().min(1),
    include: z.string().optional(),
    path: z.string().optional(),
    limit: z.number().int().min(1).optional(),
  }),
  component: null,
} as const;
```

**Step 2: Export new tool defs**

```ts
export * from "./runtime";
```

### Task 2: Add basic config flag for tool scope

**Files:**
- Modify: `packages/api/src/types/basic.ts`
- Modify: `apps/server/src/modules/settings/tenasConfStore.ts`
- Modify: `apps/server/src/modules/settings/settingsService.ts`

**Step 1: Extend BasicConfig schema**

```ts
export const basicConfigSchema = z.object({
  ...
  toolAllowOutsideScope: z.boolean(),
  ...
});
```

**Step 2: Add default value**

```ts
const DEFAULT_BASIC_CONF: BasicConf = {
  ...
  toolAllowOutsideScope: false,
  ...
};
```

**Step 3: Normalize/save flag in settingsService**

```ts
const toolAllowOutsideScope =
  typeof next.toolAllowOutsideScope === "boolean"
    ? next.toolAllowOutsideScope
    : current.toolAllowOutsideScope;

const normalized: BasicConfig = {
  ...
  toolAllowOutsideScope,
  ...
};
```

### Task 3: Implement scope helpers + shell/exec tools

**Files:**
- Create: `apps/server/src/ai/tools/runtime/toolScope.ts`
- Create: `apps/server/src/ai/tools/runtime/execSessionStore.ts`
- Create: `apps/server/src/ai/tools/runtime/shellCommandTool.ts`
- Create: `apps/server/src/ai/tools/runtime/execCommandTool.ts`

**Step 1: Add scope helper**

```ts
export function resolveToolRoots(): { workspaceRoot: string; projectRoot?: string } { ... }
export function resolveToolPath(input: { target: string; allowOutside: boolean }): { absPath: string; rootLabel: "workspace" | "project" | "external" } { ... }
export function resolveToolWorkdir(...): string { ... }
```

**Step 2: Add exec session store**

```ts
export type ExecSession = { id: string; process: ChildProcessWithoutNullStreams; buffer: string; ... };
export function createExecSession(...): ExecSession { ... }
export function getExecSession(id: string): ExecSession | null { ... }
export function readExecBuffer(id: string): string { ... }
```

**Step 3: Implement shell command tool**

```ts
export const shellCommandTool = tool({
  description: shellCommandToolDef.description,
  inputSchema: zodSchema(shellCommandToolDef.parameters),
  execute: async (...) => { ... },
});
```

**Step 4: Implement unified exec + write stdin tools**

```ts
export const execCommandTool = tool({ ... });
export const writeStdinTool = tool({ ... });
```

### Task 4: Implement file/text tools

**Files:**
- Create: `apps/server/src/ai/tools/runtime/fileTools.ts`

**Step 1: Implement read file tool**

```ts
export const readFileTool = tool({ ... });
```

**Step 2: Implement list dir tool**

```ts
export const listDirTool = tool({ ... });
```

**Step 3: Implement grep files tool**

```ts
export const grepFilesTool = tool({ ... });
```

### Task 5: Register tools + add settings UI toggle

**Files:**
- Modify: `apps/server/src/ai/registry/toolRegistry.ts`
- Modify: `apps/server/src/ai/agents/masterAgent/masterAgent.ts`
- Modify: `apps/web/src/components/setting/menus/BasicSettings.tsx`

**Step 1: Register tool entries**

```ts
import { ...ToolDef } from "@tenas-ai/api/types/tools/runtime";
import { ...Tool } from "@/ai/tools/runtime/...";

const TOOL_REGISTRY = {
  ...
  [shellCommandToolDef.id]: { tool: shellCommandTool, meta: { needsApproval: true } },
  [execCommandToolDef.id]: { tool: execCommandTool, meta: { needsApproval: true } },
  [writeStdinToolDef.id]: { tool: writeStdinTool, meta: { needsApproval: true } },
  [readFileToolDef.id]: { tool: readFileTool, meta: { needsApproval: false } },
  [listDirToolDef.id]: { tool: listDirTool, meta: { needsApproval: false } },
  [grepFilesToolDef.id]: { tool: grepFilesTool, meta: { needsApproval: false } },
};
```

**Step 2: Expose tools to master agent**

```ts
const MASTER_AGENT_TOOL_IDS = [
  ...,
  shellCommandToolDef.id,
  execCommandToolDef.id,
  writeStdinToolDef.id,
  readFileToolDef.id,
  listDirToolDef.id,
  grepFilesToolDef.id,
];
```

**Step 3: Add basic settings toggle**

```tsx
<div className="flex flex-wrap items-start gap-3 py-3">
  <div className="min-w-0 flex-1">
    <div className="text-sm font-medium">允许工具访问工作区外路径</div>
    <div className="text-xs text-muted-foreground">
      关闭时仅允许 project/workspace 根目录内访问
    </div>
  </div>
  <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
    <div className="origin-right scale-125">
      <Switch
        checked={basic.toolAllowOutsideScope}
        onCheckedChange={(checked) => void setBasic({ toolAllowOutsideScope: checked })}
        aria-label="Allow tool outside scope"
      />
    </div>
  </TenasSettingsField>
</div>
```

---

Plan complete and saved to `docs/plans/2026-01-18-runtime-tools-plan.md`. Two execution options:

1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?

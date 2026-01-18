# Platform-Specific Runtime Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split shell/unified exec tools into platform-specific tool IDs and align outputs/behaviors with Codex (shell, shell_command, exec_command, write_stdin, read_file, list_dir, grep_files).

**Architecture:** Add platform-specific ToolDef IDs (win/unix) with Codex descriptions, refactor runtime tool implementations to match Codex output formats, and register only the current platform’s tool IDs in the registry and master agent. Update file/text tools to emit Codex-formatted text outputs using ripgrep for grep.

**Tech Stack:** TypeScript, AI SDK v6 tool(), Node.js child_process, zod, ripgrep.

> 说明：按项目规则，运行 superpowers skill 时跳过 TDD/测试步骤，不创建 worktree。本计划不包含测试步骤。

### Task 1: Update ToolDefs for platform-specific IDs + Codex descriptions

**Files:**
- Modify: `packages/api/src/types/tools/runtime.ts`
- Modify: `packages/api/src/types/tools/index.ts`

**Step 1: Replace generic exec/shell defs with platform-specific tool defs**

Add **two tool defs per tool** (win/unix) with different IDs and Codex description text:

```ts
export const shellToolDefWin = {
  id: "shell-win",
  description: "Runs a Powershell command (Windows) and returns its output. ...",
  parameters: z.object({
    command: z.array(z.string()).min(1),
    workdir: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    sandboxPermissions: z.enum(["use_default", "require_escalated"]).optional(),
    justification: z.string().optional(),
  }),
  component: null,
} as const;

export const shellToolDefUnix = {
  id: "shell-unix",
  description: "Runs a shell command and returns its output.\n- The arguments ...",
  parameters: z.object({
    command: z.array(z.string()).min(1),
    workdir: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    sandboxPermissions: z.enum(["use_default", "require_escalated"]).optional(),
    justification: z.string().optional(),
  }),
  component: null,
} as const;

export const shellCommandToolDefWin = { id: "shell-command-win", description: "Runs a Powershell command (Windows) ...", ... } as const;
export const shellCommandToolDefUnix = { id: "shell-command-unix", description: "Runs a shell command and returns its output.\n- Always set the `workdir` ...", ... } as const;

export const execCommandToolDefWin = { id: "exec-command-win", description: "Runs a command in a PTY, returning output or a session ID for ongoing interaction.", ... } as const;
export const execCommandToolDefUnix = { id: "exec-command-unix", description: "Runs a command in a PTY, returning output or a session ID for ongoing interaction.", ... } as const;

export const writeStdinToolDefWin = { id: "write-stdin-win", description: "Writes characters to an existing unified exec session and returns recent output.", ... } as const;
export const writeStdinToolDefUnix = { id: "write-stdin-unix", description: "Writes characters to an existing unified exec session and returns recent output.", ... } as const;
```

Keep read/list/grep ToolDef IDs but update their `description` strings to match Codex:

```ts
export const readFileToolDef = {
  description:
    "Reads a local file with 1-indexed line numbers, supporting slice and indentation-aware block modes.",
  ...
} as const;

export const listDirToolDef = {
  description:
    "Lists entries in a local directory with 1-indexed entry numbers and simple type labels.",
  ...
} as const;

export const grepFilesToolDef = {
  description:
    "Finds files whose contents match the pattern and lists them by modification time.",
  ...
} as const;
```

**Step 2: Export new tool defs**

Ensure `packages/api/src/types/tools/index.ts` re-exports the updated runtime tool defs.

### Task 2: Implement platform-specific shell + unified exec outputs

**Files:**
- Create: `apps/server/src/ai/tools/runtime/shellTool.ts`
- Modify: `apps/server/src/ai/tools/runtime/shellCommandTool.ts`
- Modify: `apps/server/src/ai/tools/runtime/execCommandTool.ts`
- Modify: `apps/server/src/ai/tools/runtime/writeStdinTool.ts`
- Modify: `apps/server/src/ai/tools/runtime/execSessionStore.ts`
- Modify: `apps/server/src/ai/tools/runtime/execUtils.ts`

**Step 1: Add `shellTool` for array commands**

Implement a new `shellTool` (array command) that outputs **Codex structured JSON string**:

```ts
const durationSeconds = Math.round(durationMs / 100) / 10;
const payload = {
  output: aggregatedOutput,
  metadata: { exit_code: exitCode ?? -1, duration_seconds: durationSeconds },
};
return JSON.stringify(payload);
```

Aggregate output as `stdout + stderr`, like Codex.

**Step 2: Convert `shellCommandTool` to string-command**

Refactor `shellCommandTool` to accept a string `command` and format output as Codex freeform:

```
Exit code: <code>
Wall time: <seconds> seconds
Output:
<aggregated_output>
```

**Step 3: Adjust unified exec output formatting**

Update `execCommandTool` and `writeStdinTool` to return **plain text**:

```
Chunk ID: <chunkId>
Wall time: <seconds> seconds
Process exited with code <code>
Process running with session ID <sessionId>
Original token count: <n>  // omit if unavailable
Output:
<output>
```

Enhancements in `execSessionStore.ts`:
- store `chunkId` (e.g. randomUUID)
- store `startedAt` to compute wall time
- expose helper to build the formatted response

**Step 4: Keep scope enforcement**

All workdir/path resolution continues using `resolveToolWorkdir` and `resolveToolPath`.

### Task 3: Align file/text tools output with Codex

**Files:**
- Modify: `apps/server/src/ai/tools/runtime/fileTools.ts`

**Step 1: read_file output**

Change `readFileTool` to emit lines with `L{line}: {content}` and max 500 chars per line.
- `slice` mode: same as Codex (offset/limit; error if offset beyond length).
- `indentation` mode: align with Codex semantics (anchor line; max_levels; include_siblings; include_header; max_lines).

**Step 2: list_dir output**

Implement BFS traversal, then output:

```
Absolute path: /abs/path
<indent><name>/
<indent><name>@
<indent><name>?
```

Append `More than {limit} entries found` when truncated.

**Step 3: grep_files output**

Use ripgrep (`rg --files-with-matches --sortr=modified`) and return file path list by line.
- No matches: return `No matches found.`
- Respect `limit` (default 100, max 2000).
- Keep scope resolution for `path` defaulting to workspace/project cwd.

### Task 4: Register platform-specific tool IDs

**Files:**
- Modify: `apps/server/src/ai/registry/toolRegistry.ts`
- Modify: `apps/server/src/ai/agents/masterAgent/masterAgent.ts`

**Step 1: Register only the current platform’s tool IDs**

```ts
const isWindows = process.platform === "win32";
const shellToolDef = isWindows ? shellToolDefWin : shellToolDefUnix;
const shellCommandToolDef = isWindows ? shellCommandToolDefWin : shellCommandToolDefUnix;
const execCommandToolDef = isWindows ? execCommandToolDefWin : execCommandToolDefUnix;
const writeStdinToolDef = isWindows ? writeStdinToolDefWin : writeStdinToolDefUnix;
```

Register these tool IDs with the existing approval metadata.

**Step 2: Master agent tool IDs**

Include only the selected platform tool IDs in `MASTER_AGENT_TOOL_IDS`.

---

Plan complete and saved to `docs/plans/2026-01-18-platform-tool-ids-plan.md`. Two execution options:

1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?

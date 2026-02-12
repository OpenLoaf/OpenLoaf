import { z } from "zod";

// 中文注释：运行时工具的审批策略由 server 侧 tool 实现决定，API 定义只描述参数与展示信息。

export const shellToolDefWin = {
  id: "shell-win",
  name: "Shell 命令（Windows/数组）",
  description: `触发：当你需要执行系统命令并希望得到可解析的结构化输出时调用（Windows/数组形式）。用途：执行 Powershell 命令并返回 JSON 字符串输出。返回：{"output": string, "metadata": {"exit_code": number, "duration_seconds": number}}（output 可能被截断）。不适用：只要可读文本输出用 shell-command；需要持续交互用 exec-command/write-stdin。

Runs a Powershell command (Windows) and returns its output. Arguments to \`shell\` will be passed to CreateProcessW(). Most commands should be prefixed with ["powershell.exe", "-Command"].

Examples of valid command strings:

- ls -a (show hidden): ["powershell.exe", "-Command", "Get-ChildItem -Force"]
- recursive find by name: ["powershell.exe", "-Command", "Get-ChildItem -Recurse -Filter *.py"]
- recursive grep: ["powershell.exe", "-Command", "Get-ChildItem -Path C:\\\\myrepo -Recurse | Select-String -Pattern 'TODO' -CaseSensitive"]
- ps aux | grep python: ["powershell.exe", "-Command", "Get-Process | Where-Object { $_.ProcessName -like '*python*' }"]
- setting an env var: ["powershell.exe", "-Command", "$env:FOO='bar'; echo $env:FOO"]
- running an inline Python script: ["powershell.exe", "-Command", "@'\\nprint('Hello, world!')\\n'@ | python -"]`,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：列出目录内容。"),
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
  name: "Shell 命令（Unix/数组）",
  description: `触发：当你需要执行系统命令并希望得到可解析的结构化输出时调用（Unix/数组形式）。用途：执行 shell 命令并返回 JSON 字符串输出。返回：{"output": string, "metadata": {"exit_code": number, "duration_seconds": number}}（output 可能被截断）。不适用：只要可读文本输出用 shell-command；需要持续交互用 exec-command/write-stdin。

Runs a shell command and returns its output.
- The arguments to \`shell\` will be passed to execvp(). Most terminal commands should be prefixed with ["bash", "-lc"].
- Always set the \`workdir\` param when using the shell function. Do not use \`cd\` unless absolutely necessary.`,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：查看当前目录内容。"),
    command: z.array(z.string()).min(1),
    workdir: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    sandboxPermissions: z.enum(["use_default", "require_escalated"]).optional(),
    justification: z.string().optional(),
  }),
  component: null,
} as const;

export const shellCommandToolDefWin = {
  id: "shell-command-win",
  name: "Shell 命令（Windows/字符串）",
  description: `触发：当你需要执行一条字符串命令并得到可读文本输出时调用（Windows）。用途：执行 Powershell 命令并返回包含退出码与耗时的文本输出。返回：文本块（含 Exit code、Wall time、Output；输出可能截断）。不适用：需要结构化 JSON 输出用 shell；需要持续交互用 exec-command/write-stdin。

Runs a Powershell command (Windows) and returns its output.

Examples of valid command strings:

- ls -a (show hidden): "Get-ChildItem -Force"
- recursive find by name: "Get-ChildItem -Recurse -Filter *.py"
- recursive grep: "Get-ChildItem -Path C:\\\\myrepo -Recurse | Select-String -Pattern 'TODO' -CaseSensitive"
- ps aux | grep python: "Get-Process | Where-Object { $_.ProcessName -like '*python*' }"
- setting an env var: "$env:FOO='bar'; echo $env:FOO"
- running an inline Python script: "@'\\nprint('Hello, world!')\\n'@ | python -"`,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：查询系统信息。"),
    command: z.string().min(1),
    workdir: z.string().optional(),
    login: z.boolean().optional(),
    timeoutMs: z.number().int().positive().optional(),
    sandboxPermissions: z.enum(["use_default", "require_escalated"]).optional(),
    justification: z.string().optional(),
  }),
  component: null,
} as const;

export const shellCommandToolDefUnix = {
  id: "shell-command-unix",
  name: "Shell 命令（Unix/字符串）",
  description: `触发：当你需要执行一条字符串命令并得到可读文本输出时调用（Unix）。用途：执行 shell 命令并返回包含退出码与耗时的文本输出。返回：文本块（含 Exit code、Wall time、Output；输出可能截断）。不适用：需要结构化 JSON 输出用 shell；需要持续交互用 exec-command/write-stdin。

Runs a shell command and returns its output.
- Always set the \`workdir\` param when using the shell_command function. Do not use \`cd\` unless absolutely necessary.`,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：执行命令获取信息。"),
    command: z.string().min(1),
    workdir: z.string().optional(),
    login: z.boolean().optional(),
    timeoutMs: z.number().int().positive().optional(),
    sandboxPermissions: z.enum(["use_default", "require_escalated"]).optional(),
    justification: z.string().optional(),
  }),
  component: null,
} as const;

export const execCommandToolDefWin = {
  id: "exec-command-win",
  name: "交互命令（Windows）",
  description:
    "触发：当你需要启动可持续交互的命令会话（PTY），并可能后续继续写入 stdin 时调用（Windows）。用途：启动命令并返回首段输出与会话信息。返回：文本块（含 Chunk ID、Wall time、Exit code、Output；若仍在运行会包含 sessionId）。不适用：一次性命令优先使用 shell/shell-command。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：获取当前系统时间。"),
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

export const execCommandToolDefUnix = {
  id: "exec-command-unix",
  name: "交互命令（Unix）",
  description:
    "触发：当你需要启动可持续交互的命令会话（PTY），并可能后续继续写入 stdin 时调用（Unix）。用途：启动命令并返回首段输出与会话信息。返回：文本块（含 Chunk ID、Wall time、Exit code、Output；若仍在运行会包含 sessionId）。不适用：一次性命令优先使用 shell/shell-command。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：获取当前系统时间。"),
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

export const writeStdinToolDefWin = {
  id: "write-stdin-win",
  name: "写入会话（Windows）",
  description:
    "触发：当你需要向已有交互会话写入输入并读取最新输出时调用（Windows）。用途：向 session 写入字符并读取输出。返回：文本块（含 Chunk ID、Wall time、Exit code、Output；若仍在运行会包含 sessionId）。不适用：没有 sessionId 时不要调用。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：向交互会话发送输入。"),
    sessionId: z.string().min(1),
    chars: z.string().optional(),
    yieldTimeMs: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
  }),
  component: null,
} as const;

export const writeStdinToolDefUnix = {
  id: "write-stdin-unix",
  name: "写入会话（Unix）",
  description:
    "触发：当你需要向已有交互会话写入输入并读取最新输出时调用（Unix）。用途：向 session 写入字符并读取输出。返回：文本块（含 Chunk ID、Wall time、Exit code、Output；若仍在运行会包含 sessionId）。不适用：没有 sessionId 时不要调用。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：向交互会话发送输入。"),
    sessionId: z.string().min(1),
    chars: z.string().optional(),
    yieldTimeMs: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
  }),
  component: null,
} as const;

export const readFileToolDef = {
  id: "read-file",
  name: "读取文件",
  description:
    "触发：当你需要读取本地文本文件内容并保留行号时调用。用途：按 slice/indentation 模式读取文本文件。返回：带行号的文本行（例如 L1: ...）；仅支持文本文件，二进制会报错。不适用：要查看目录结构请用 list-dir。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：读取配置文件内容。"),
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

export const writeFileToolDef = {
  id: "write-file",
  name: "写入文件",
  description:
    "触发：当你需要在当前项目/工作区内写入文本文件时调用。用途：将文本内容写入指定路径。返回：`Wrote file: <relative-path>`；路径超出范围会报错。不适用：只读任务不要调用。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：写入 markdown 文件。"),
    path: z.string().min(1).describe("目标文件路径（相对当前项目/工作空间）。"),
    content: z.string().describe("要写入的文本内容。"),
  }),
  component: null,
} as const;

export const listDirToolDef = {
  id: "list-dir",
  name: "列出目录",
  description:
    "触发：当你需要列出目录内容并查看统计信息时调用。用途：按深度/分页列出条目并标注类型，可选忽略 .gitignore。返回：文本（含 Absolute path、统计信息、条目列表，可能提示还有更多条目）。不适用：需要文件内容时请用 read-file。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：列出目录内容。"),
    path: z.string().min(1),
    offset: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).optional(),
    depth: z.number().int().min(1).optional(),
    ignoreGitignore: z.boolean().optional().default(true),
  }),
  component: null,
} as const;

const planStepStatusSchema = z
  .enum(["pending", "in_progress", "completed"])
  .describe("Plan step status: pending, in_progress, or completed.");

/** Update-plan mode schema. */
const planUpdateModeSchema = z.enum(["full", "patch"]).describe("Plan update mode.");

const planItemSchema = z.object({
  step: z.string().min(1).describe("Plan step text."),
  status: planStepStatusSchema.describe("Plan step status."),
});

const planPatchItemSchema = z.object({
  index: z.number().int().min(1).describe("1-based index of the plan step."),
  status: planStepStatusSchema.describe("Plan step status."),
});

const planUpdateItemSchema = z.object({
  step: z.string().min(1).optional().describe("Plan step text."),
  index: z.number().int().min(1).optional().describe("1-based index of the plan step."),
  status: planStepStatusSchema.describe("Plan step status."),
});

/** Update-plan tool definition for storing assistant plans. */
export const updatePlanToolDef = {
  id: "update-plan",
  name: "更新计划",
  description: `触发：当你需要把当前计划写入工具状态，以便 UI 展示或后续 patch 更新时调用。用途：提交 full/patch 计划步骤及状态。返回：{ ok: true, data: { updated: true } }。不适用：未维护计划时不要调用。

Updates the task plan for the current assistant turn.
Provide an optional explanation and a list of plan items, each with a step and status.
When mode is patch, provide step index and status only.
At most one step can be in_progress at a time.`,
  parameters: z
    .object({
      mode: planUpdateModeSchema.optional().default("full"),
      actionName: z
        .string()
        .min(1)
        .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：同步当前计划。"),
      explanation: z.string().optional().describe("Optional plan summary."),
      plan: z.array(planUpdateItemSchema).min(1).describe("Plan step list."),
    })
    .superRefine((value, ctx) => {
      const mode = value.mode ?? "full";
      for (let index = 0; index < value.plan.length; index += 1) {
        const item = value.plan[index];
        if (!item) continue;
        if (mode === "patch") {
          if (typeof item.index !== "number") {
            // 中文注释：patch 模式必须提供序号，用于定位更新项。
            ctx.addIssue({
              code: "custom",
              path: ["plan", index, "index"],
              message: "Patch mode requires plan item index.",
            });
          }
        } else if (!item.step) {
          // 中文注释：full 模式必须提供 step 文本。
          ctx.addIssue({
            code: "custom",
            path: ["plan", index, "step"],
            message: "Full mode requires plan item step.",
          });
        }
      }
    }),
  component: null,
} as const;

/** Plan step status type for update-plan payloads. */
export type PlanStepStatus = z.infer<typeof planStepStatusSchema>;

/** Plan step item type for update-plan payloads. */
export type PlanItem = z.infer<typeof planItemSchema>;

/** Plan step patch item type for update-plan payloads. */
export type PlanPatchItem = z.infer<typeof planPatchItemSchema>;

/** Update-plan payload type for update-plan tool. */
export type UpdatePlanArgs = z.infer<typeof updatePlanToolDef.parameters>;

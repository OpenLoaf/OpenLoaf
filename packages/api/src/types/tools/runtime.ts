import { z } from "zod";

// 中文注释：运行时工具的审批策略由 server 侧 tool 实现决定，API 定义只描述参数与展示信息。

export const shellToolDefWin = {
  id: "shell-win",
  name: "Shell 命令（Windows/数组）",
  description: `Runs a Powershell command (Windows) and returns its output. Arguments to \`shell\` will be passed to CreateProcessW(). Most commands should be prefixed with ["powershell.exe", "-Command"].

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
  description: `Runs a shell command and returns its output.
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
  description: `Runs a Powershell command (Windows) and returns its output.

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
  description: `Runs a shell command and returns its output.
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
  description: "Runs a command in a PTY, returning output or a session ID for ongoing interaction.",
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
  description: "Runs a command in a PTY, returning output or a session ID for ongoing interaction.",
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
  description: "Writes characters to an existing unified exec session and returns recent output.",
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
  description: "Writes characters to an existing unified exec session and returns recent output.",
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
    "Reads a local text file with 1-indexed line numbers, supporting slice and indentation-aware block modes. Only text files are supported (no Excel/Word/PDF).",
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
    "Writes text content to a file under the current project or workspace directory.",
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
    "Lists entries in a local directory with 1-indexed entry numbers and simple type labels. Ignores .gitignore by default unless ignoreGitignore=false.",
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
  description: `Updates the task plan for the current assistant turn.
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

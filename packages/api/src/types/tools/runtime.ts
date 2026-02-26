/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { z } from "zod";

// 中文注释：运行时工具的审批策略由 server 侧 tool 实现决定，API 定义只描述参数与展示信息。

export const shellToolDef = {
  id: "shell",
  name: "Shell 命令（数组）",
  description: `触发：当你需要执行系统命令并希望得到可解析的结构化输出时调用（数组形式）。用途：执行 shell 命令并返回 JSON 字符串输出。返回：{"output": string, "metadata": {"exit_code": number, "duration_seconds": number}}（output 可能被截断）。不适用：只要可读文本输出用 shell-command；需要持续交互用 exec-command/write-stdin。

Runs a shell command and returns its output.
- Unix: arguments are passed to execvp(). Most terminal commands should be prefixed with ["bash", "-lc"].
- Windows: arguments are passed to CreateProcessW(). Most commands should be prefixed with ["powershell.exe", "-Command"].
- Always set the \`workdir\` param when using the shell function. Do not use \`cd\` unless absolutely necessary.`,
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

export const shellCommandToolDef = {
  id: "shell-command",
  name: "Shell 命令（字符串）",
  description: `触发：当你需要执行一条字符串命令并得到可读文本输出时调用。用途：执行 shell 命令并返回包含退出码与耗时的文本输出。返回：文本块（含 Exit code、Wall time、Output；输出可能截断）。不适用：需要结构化 JSON 输出用 shell；需要持续交互用 exec-command/write-stdin。

Runs a shell command and returns its output.
- Unix: runs via the user's default shell.
- Windows: runs via Powershell.
- Always set the \`workdir\` param when using the shell_command function. Do not use \`cd\` unless absolutely necessary.`,
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

export const execCommandToolDef = {
  id: "exec-command",
  name: "交互命令",
  description:
    "触发：当你需要启动可持续交互的命令会话（PTY），并可能后续继续写入 stdin 时调用。用途：启动命令并返回首段输出与会话信息。返回：文本块（含 Chunk ID、Wall time、Exit code、Output；若仍在运行会包含 sessionId）。不适用：一次性命令优先使用 shell/shell-command。",
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

export const writeStdinToolDef = {
  id: "write-stdin",
  name: "写入会话",
  description:
    "触发：当你需要向已有交互会话写入输入并读取最新输出时调用。用途：向 session 写入字符并读取输出。返回：文本块（含 Chunk ID、Wall time、Exit code、Output；若仍在运行会包含 sessionId）。不适用：没有 sessionId 时不要调用。",
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

export const applyPatchToolDef = {
  id: "apply-patch",
  name: "编辑文件",
  description: `触发：当你需要创建、修改或删除文件时调用。
用途：通过 diff 补丁格式操作文件。

补丁格式：
*** Begin Patch
*** Update File: <相对路径>
@@ <可选上下文标识符>
 <上下文行（不变）>
-<要删除的行>
+<要添加的行>
 <上下文行（不变）>
*** End Patch

规则：
- 默认显示 3 行上下文（变更前后各 3 行）
- 若 3 行不足以唯一定位，用 @@ 指定类/函数名
- 每行前缀：空格=上下文，-=删除，+=添加
- 文件路径必须是相对路径
- 可在一个补丁中组合多个文件操作
- *** Add File: <path> 创建新文件（每行以 + 开头）
- *** Delete File: <path> 删除文件
- *** Move to: <new path> 重命名（跟在 Update File 后）
- *** End of File 标记 chunk 在文件末尾

返回：操作结果摘要。不适用：只读任务不要调用。`,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的。"),
    patch: z
      .string()
      .min(1)
      .describe("补丁文本，以 *** Begin Patch 开头，*** End Patch 结尾。"),
  }),
  component: null,
} as const;

export const editDocumentToolDef = {
  id: "edit-document",
  name: "编辑文稿",
  description:
    "触发：当用户要求修改文稿（tndoc_ 文件夹中的 index.mdx）时调用。用途：将修改后的完整 MDX 内容写入文稿的 index.mdx 文件。返回：`Wrote document: <relative-path>`。不适用：非文稿文件请用 write-file。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：修改文稿标题。"),
    path: z.string().min(1).describe("文稿文件夹路径或 index.mdx 路径（相对当前项目/工作空间）。"),
    content: z.string().describe("修改后的完整 MDX 内容。"),
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

export const grepFilesToolDef = {
  id: "grep-files",
  name: "搜索文件内容",
  description:
    "触发：当你需要在项目中搜索包含特定模式的文件时调用。用途：使用正则表达式搜索文件内容，返回匹配的文件路径列表（按修改时间排序）。返回：每行一个文件路径；无匹配返回 \"No matches found.\"。不适用：搜索文件名请用 list-dir；读取文件内容请用 read-file。",
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe("由调用的 LLM 传入，用于说明本次工具调用目的，例如：搜索包含 TODO 的文件。"),
    pattern: z.string().min(1).describe("正则表达式搜索模式。"),
    include: z.string().optional().describe("Glob 过滤，如 \"*.ts\" 或 \"*.{ts,tsx}\"。"),
    path: z.string().optional().describe("搜索路径，默认当前项目根目录。"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe("最大返回文件数，默认 100。"),
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

export const jsReplToolDef = {
  id: "js-repl",
  name: "JavaScript REPL",
  description: `触发：当你需要执行 JavaScript 代码进行计算、数据处理、原型验证或调试时调用。用途：在持久化的 Node.js 沙箱中执行代码，变量和函数在多次调用间保留。返回：console.log 输出和最终表达式的值。不适用：需要访问文件系统或网络请求时请用 shell-command。

Executes JavaScript code in a persistent Node.js VM sandbox.
- Variables and functions persist across calls within the same session.
- console.log/warn/error output is captured and returned.
- The last expression value is included in the output.
- Execution has a timeout to prevent infinite loops.
- No access to file system, network, or child_process.`,
  parameters: z.string().min(1).describe("要执行的 JavaScript 代码。"),
  component: null,
} as const;

export const jsReplResetToolDef = {
  id: "js-repl-reset",
  name: "重置 JavaScript REPL",
  description: `触发：当你需要清除 REPL 中所有已定义的变量和状态，恢复到初始环境时调用。用途：重置沙箱上下文。返回：{ ok: true, message: string }。不适用：不需要清除状态时不要调用。

Resets the JavaScript REPL sandbox to a clean state, clearing all variables and functions.`,
  parameters: z.object({}),
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
